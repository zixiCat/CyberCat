const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('node:http');
const { after, before, test } = require('node:test');
const { transformSync } = require('esbuild');

// Use the production compiler, preserving native import() for ESM dictionaries.
require.extensions['.ts'] = (module, filename) => module._compile(transformSync(readFileSync(filename, 'utf8'), {
  loader: 'ts', format: 'cjs', target: 'node22',
}).code, filename);

const { checkEnglishSpelling } = require('../apps/service/src/app/services/translation/english-spelling.ts');
const { createTranslationHistory } = require('../apps/service/src/app/services/translation/translation-history.ts');
const { translate } = require('../apps/service/src/app/services/translation/translate.ts');
const translationRoutes = require('../apps/service/src/app/routes/translation.ts').default;
const { searchTranslation } = require('../apps/web/src/app/features/translation/translation-api.ts');
const wordResult = {
  kind: 'word', sourceLanguage: 'en', pronunciation: '/ˈɛstəmeɪt/',
  meanings: [{ partOfSpeech: 'verb', senses: ['Approximate a value'] }],
};
let temporaryRoot;
let provider;
let config;
const requests = [];
let providerResult = wordResult;

before(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'cybercat-translation-'));
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(providerResult) } }] }));
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  config = { apiKey: 'fixture-key', baseUrl: `http://127.0.0.1:${provider.address().port}`, model: 'fixture-model' };
});

after(async () => {
  await new Promise((resolve) => provider.close(resolve));
  await rm(temporaryRoot, { recursive: true, force: true });
});

test('estmimate offers estimate without generating a definition or pronunciation', async () => {
  const result = await checkEnglishSpelling('estmimate');
  assert.equal(result.kind, 'unrecognized');
  assert.ok(result.suggestions.includes('estimate'));
  assert.equal(result.suggestionSource, 'english-spelling');
  assert.equal(result.pronunciation, undefined);
  assert.equal(result.meanings, undefined);
});

test('valid words, inflections and US/UK spellings need no correction', async () => {
  for (const word of ['estimate', 'ESTIMATE', 'estimates', 'running', 'color', 'colour', "don't"]) {
    assert.equal(await checkEnglishSpelling(word), null, word);
  }
});

test('unknown input stays unknown, including long tokens; multilingual phrases bypass English checking', async () => {
  for (const word of ['qzxvbnmkj', 'z'.repeat(1000)]) {
    const result = await checkEnglishSpelling(word);
    assert.equal(result.kind, 'unrecognized');
    assert.deepEqual(result.suggestions, []);
  }
  for (const text of ['an estimate', '你好', '你好 estimate', 'café']) {
    assert.equal(await checkEnglishSpelling(text), null);
  }
});

test('legacy typo history is rechecked and concurrent writes keep both lookups', async () => {
  const file = path.join(temporaryRoot, 'legacy.json');
  await writeFile(file, JSON.stringify([{ query: 'estmimate', result: wordResult }]));
  const history = createTranslationHistory(file);
  assert.equal((await history.read())[0].result.kind, 'unrecognized');
  await Promise.all(['estimate', 'test'].map((query) => history.save({ query, result: wordResult })));
  assert.equal((await history.read()).length, 3);
  assert.equal(JSON.parse(await readFile(file, 'utf8')).find((entry) => entry.query === 'estmimate').result.kind, 'unrecognized');
});

test('route supports typo suggestions without credentials, then corrected lookup through the existing provider', async () => {
  const envBefore = { ...process.env };
  const app = require('fastify')();
  try {
    process.env.SCRIPTS_ROOT = path.join(temporaryRoot, 'route');
    delete process.env.SELECTION_ASSISTANT_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await app.register(require('@fastify/sensible'));
    await app.register(translationRoutes);
    const typo = await app.inject({ method: 'POST', url: '/translation', payload: { query: 'estmimate' } });
    assert.equal(typo.statusCode, 200);
    assert.ok(typo.json().entry.result.suggestions.includes('estimate'));
    assert.equal(typo.json().entry.query, 'estmimate');
    const valid = await app.inject({ method: 'POST', url: '/translation', payload: { query: 'estimate' } });
    assert.equal(valid.statusCode, 503);
    const history = await app.inject('/translation/history');
    assert.equal(history.json()[0].result.kind, 'unrecognized');
  } finally {
    await app.close();
    process.env = envBefore;
  }

  const configured = require('fastify')();
  try {
    Object.assign(process.env, {
      SCRIPTS_ROOT: path.join(temporaryRoot, 'configured'),
      SELECTION_ASSISTANT_API_KEY: config.apiKey,
      SELECTION_ASSISTANT_BASE_URL: config.baseUrl,
      SELECTION_ASSISTANT_MODEL: config.model,
    });
    await configured.register(require('@fastify/sensible'));
    await configured.register(translationRoutes);
    const beforeCount = requests.length;
    await configured.inject({ method: 'POST', url: '/translation', payload: { query: 'estmimate' } });
    assert.equal(requests.length, beforeCount, 'a typo must not be sent to the AI provider');
    const corrected = await configured.inject({ method: 'POST', url: '/translation', payload: { query: 'estimate' } });
    assert.equal(corrected.statusCode, 200);
    assert.equal(corrected.json().entry.result.kind, 'word');
    assert.equal(requests.at(-1).messages.at(-1).content, 'estimate');
    assert.equal(corrected.json().history.length, 2);
    providerResult = { kind: 'word', sourceLanguage: 'en' };
    const failed = await configured.inject({ method: 'POST', url: '/translation', payload: { query: 'test' } });
    assert.equal(failed.statusCode, 502);
    assert.equal((await configured.inject('/translation/history')).json().length, 2);
    providerResult = { kind: 'unrecognized', sourceLanguage: 'en', suggestions: [], suggestionSource: 'ai' };
    const asWritten = await configured.inject({
      method: 'POST', url: '/translation', payload: { query: 'estmimate', translateAsWritten: true },
    });
    assert.equal(asWritten.statusCode, 200);
    assert.equal(asWritten.json().entry.result.suggestionSource, 'ai');
    assert.match(requests.at(-1).messages[0].content, /Do not correct it or provide word definitions/);
    providerResult = wordResult;
  } finally {
    await configured.close();
    process.env = envBefore;
  }
});

test('AI translation preserves multilingual output and rejects invalid or invented bypass word results', async () => {
  providerResult = { kind: 'sentence', sourceLanguage: 'zh', casual: 'How much?', standard: 'How much does this cost?' };
  assert.deepEqual(await translate(config, '这个多少钱？'), providerResult);
  providerResult = { kind: 'sentence', sourceLanguage: 'en', casual: '你好', standard: '您好' };
  assert.deepEqual(await translate(config, 'Hello there'), providerResult);
  providerResult = { kind: 'unrecognized', sourceLanguage: 'en', suggestions: [], suggestionSource: 'ai' };
  assert.deepEqual(await translate(config, 'qzxvbnmkj', true), providerResult);
  assert.match(requests.at(-1).messages[0].content, /Do not correct it or provide word definitions/);
  providerResult = wordResult;
  await assert.rejects(translate(config, 'estmimate', true), /invalid result/);
  providerResult = { kind: 'word', sourceLanguage: 'en' };
  await assert.rejects(translate(config, 'estimate'), /invalid result/);
});

test('web lookup reports useful connection errors and preserves cancellation', async (context) => {
  const failure = new TypeError('Failed to fetch');
  const fetch = context.mock.method(globalThis, 'fetch', async () => { throw failure; });
  try {
    await assert.rejects(searchTranslation('estimate', new AbortController().signal), /Check your connection and retry/);
    const canceled = new AbortController();
    canceled.abort();
    await assert.rejects(searchTranslation('estimate', canceled.signal), (error) => error === failure);
    fetch.mock.mockImplementation(async (_url, options) => {
      assert.equal(JSON.parse(options.body).query, 'estimate');
      return new Response(JSON.stringify({ entry: { query: 'estimate', result: wordResult }, history: [] }));
    });
    assert.equal((await searchTranslation('estimate', new AbortController().signal)).entry.query, 'estimate');
  } finally {
    fetch.mock.restore();
  }
});
