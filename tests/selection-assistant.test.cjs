const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { createServer } = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');
const { transformSync } = require('esbuild');

require.extensions['.ts'] = (module, filename) => module._compile(transformSync(readFileSync(filename, 'utf8'), {
  loader: 'ts', format: 'cjs', target: 'node22',
}).code, filename);

const { createSelectionAssistantController } = require('../apps/service/src/app/automation/selection-assistant/store.ts');
const { createSelectionAssistantRunner } = require('../apps/service/src/app/automation/selection-assistant/runner.ts');
const { buildSelectionAssistantPrompts } = require('../apps/service/src/app/automation/selection-assistant/prompt.ts');
const { generateSelectionAssistantResponse } = require('../apps/service/src/app/automation/selection-assistant/llm.ts');
const { appendSelectionAssistantOutput } = require('../apps/service/src/app/automation/selection-assistant/log.ts');
const routes = require('../apps/service/src/app/routes/selection-assistant.ts').default;
let temporaryRoot;
let provider;
let config;
const requests = [];

test('the production build includes the default assistant prompt at its runtime path', () => {
  const { assetGlobsToFiles } = require('@nx/js/src/utils/assets/assets');
  const root = path.resolve(__dirname, '..');
  const assets = require('../apps/service/package.json').nx.targets.build.options.assets;
  const output = path.join(root, 'apps/service/dist');
  const files = assetGlobsToFiles(assets, root, output);
  const prompt = files.find((file) => path.basename(file.input) === 'selection-assistant.prompt.md');
  assert.ok(prompt, 'The built assistant needs its default prompt even without a custom prompt path.');
  assert.equal(prompt.output, path.join(output, 'apps/service/src/assets/selection-assistant.prompt.md'));
});

before(async () => {
  temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'cybercat-assistant-'));
  await writeFile(path.join(temporaryRoot, 'prompt.md'), 'Explain the supplied text.');
  provider = createServer(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.setHeader('Content-Type', 'text/event-stream');
    for (const content of ['Hello', ' from the assistant.']) {
      response.write(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  config = {
    apiKey: 'fixture-key', baseUrl: `http://127.0.0.1:${provider.address().port}`, model: 'fixture-model',
    shortcut: 'Alt+Shift+0', promptFilePath: path.join(temporaryRoot, 'prompt.md'), logFilePaths: [],
  };
});

after(async () => {
  await new Promise((resolve) => provider.close(resolve));
  await rm(temporaryRoot, { recursive: true, force: true });
});

const fixture = (overrides = {}) => {
  const controller = createSelectionAssistantController(config.shortcut);
  const entries = [];
  const logs = [];
  const errors = [];
  let captureCount = 0;
  controller.subscribe((entry) => entries.push(entry));
  const run = createSelectionAssistantRunner({
    config, controller,
    readSelectedText: async () => { captureCount++; return '  selected text  '; },
    generate: (text, onDelta) => generateSelectionAssistantResponse(config, buildSelectionAssistantPrompts(config.promptFilePath, text), onDelta),
    appendOutput: async (text) => { logs.push(text); },
    onError: (error) => errors.push(error),
    ...overrides,
  });
  return { ...controller, run, entries, logs, errors, captureCount: () => captureCount };
};

test('manual multiline text uses the existing prompts, configured model, streaming and output log', async () => {
  const file = path.join(temporaryRoot, 'manual-log.md');
  const assistant = fixture({ appendOutput: (text) => appendSelectionAssistantOutput([file], text) });
  const task = assistant.run('  first line\nsecond line  ');
  assert.equal(task.entry.status, 'loading');
  assert.equal(task.entry.inputText, 'first line\nsecond line');
  await task.completion;
  assert.equal(assistant.captureCount(), 0, 'manual input never reads the global selection');
  assert.deepEqual(assistant.entries.map((entry) => entry.status), ['loading', 'streaming', 'streaming', 'complete']);
  assert.equal(new Set(assistant.entries.map((entry) => entry.id)).size, 1);
  assert.equal(requests.at(-1).model, config.model);
  assert.match(requests.at(-1).messages[0].content, /translation and sentence-optimization assistant/);
  assert.ok(requests.at(-1).messages[1].content.includes('Explain the supplied text.'));
  assert.ok(requests.at(-1).messages[1].content.includes('first line\nsecond line'));
  assert.match(await readFile(file, 'utf8'), /Hello from the assistant\./);
});

test('hotkey capture shares the same lifecycle and both entry points share a busy lock', async () => {
  const assistant = fixture();
  const selected = assistant.run();
  assert.equal(assistant.run('manual overlap'), null);
  assert.equal(assistant.run(), null);
  await selected.completion;
  assert.equal(assistant.captureCount(), 1);
  assert.equal(assistant.getSnapshot().entry.inputText, 'selected text');
  assert.equal(assistant.getSnapshot().entry.status, 'complete');
  const manual = assistant.run('retry');
  await manual.completion;
  assert.equal(assistant.captureCount(), 1);
  assert.deepEqual(assistant.logs, ['Hello from the assistant.', 'Hello from the assistant.']);
});

test('empty selection and provider failure publish errors and allow retry, preserving supplied input', async () => {
  const assistant = fixture({
    readSelectedText: async () => ' \n ',
    generate: async () => { throw new Error('Provider unavailable'); },
  });
  await assistant.run().completion;
  assert.equal(assistant.getSnapshot().entry.errorMessage, 'No selected text was captured.');
  await assistant.run('keep my text').completion;
  assert.equal(assistant.getSnapshot().entry.errorMessage, 'Provider unavailable');
  assert.equal(assistant.getSnapshot().entry.inputText, 'keep my text');
  assert.equal(assistant.getSnapshot().entry.status, 'error');
  assert.deepEqual(assistant.logs, []);
});

test('a log failure retains the successful result and releases the shared lock', async () => {
  const assistant = fixture({ appendOutput: async () => { throw new Error('Read-only output'); } });
  await assistant.run('text').completion;
  assert.equal(assistant.getSnapshot().entry.status, 'complete');
  assert.equal(assistant.errors.length, 1);
  await assistant.run('next').completion;
});

test('POST validates input, rejects overlap, streams results, and leaves the feed snapshot up to date', async () => {
  const app = require('fastify')();
  const assistant = fixture();
  app.decorate('selectionAssistant', assistant);
  await app.register(require('@fastify/sensible'));
  await app.register(routes);
  try {
    for (const payload of [{ inputText: '' }, { inputText: ' \n ' }, {}, { inputText: {} }]) {
      const result = await app.inject({ method: 'POST', url: '/selection-assistant/run', payload });
      assert.equal(result.statusCode, 400);
    }
    assert.equal(assistant.entries.length, 0);
    const selected = assistant.run();
    const busy = await app.inject({ method: 'POST', url: '/selection-assistant/run', payload: { inputText: 'overlap' } });
    assert.equal(busy.statusCode, 409);
    await selected.completion;
    const result = await app.inject({ method: 'POST', url: '/selection-assistant/run', payload: { inputText: ' typed input ' } });
    assert.equal(result.statusCode, 200);
    assert.match(result.headers['content-type'], /text\/event-stream/);
    assert.match(result.body, /event: entry/);
    assert.match(result.body, /"status":"loading"/);
    assert.match(result.body, /"status":"streaming"/);
    assert.match(result.body, /"status":"complete"/);
    assert.match(result.body, /event: done/);
    assert.equal(assistant.getSnapshot().entry.inputText, 'typed input');
    assert.equal(assistant.captureCount(), 1);
  } finally {
    await app.close();
  }
});

test('the existing live feed delivers selection results and snapshots for later visitors', async () => {
  const app = require('fastify')();
  const assistant = fixture();
  app.decorate('selectionAssistant', assistant);
  await app.register(require('@fastify/sensible'));
  await app.register(routes);
  const url = await app.listen({ port: 0, host: '127.0.0.1' });
  const abort = new AbortController();
  try {
    const response = await fetch(`${url}/selection-assistant/stream`, { signal: abort.signal });
    const reader = response.body.getReader();
    let text = new TextDecoder().decode((await reader.read()).value);
    assert.match(text, /event: snapshot/);
    assert.match(text, /"entry":null/);
    const selected = assistant.run();
    while (!text.includes('"status":"complete"')) {
      const chunk = await reader.read();
      assert.equal(chunk.done, false);
      text += new TextDecoder().decode(chunk.value);
    }
    await selected.completion;
    assert.match(text, /"inputText":"selected text"/);
    assert.match(text, /"status":"streaming"/);
    abort.abort();
    const lateAbort = new AbortController();
    const late = await fetch(`${url}/selection-assistant/stream`, { signal: lateAbort.signal });
    const snapshot = new TextDecoder().decode((await late.body.getReader().read()).value);
    assert.match(snapshot, /"status":"complete"/);
    lateAbort.abort();
  } finally {
    abort.abort();
    await app.close();
  }
});

test('the registered hotkey still captures text and uses the same busy guard as manual submissions', async () => {
  const shortcutsPath = require.resolve('../apps/service/src/app/automation/selection-shortcuts/index.ts');
  const previous = require.cache[shortcutsPath];
  const envBefore = { ...process.env };
  let onKeyDown;
  let stopped = false;
  const hotkeys = require('../apps/service/src/app/automation/selection-shortcuts/hotkey.ts');
  require.cache[shortcutsPath] = { exports: {
    ...hotkeys,
    getGlobalSelectedText: async () => 'captured by the hotkey',
    registerGlobalKeydownListener: (listener) => { onKeyDown = listener; return () => { stopped = true; }; },
  } };
  const app = require('fastify')();
  try {
    Object.assign(process.env, {
      SELECTION_ASSISTANT_API_KEY: config.apiKey,
      SELECTION_ASSISTANT_BASE_URL: config.baseUrl,
      SELECTION_ASSISTANT_MODEL: config.model,
      SELECTION_ASSISTANT_SHORTCUT: config.shortcut,
      SELECTION_ASSISTANT_PROMPT_PATH: config.promptFilePath,
      SELECTION_ASSISTANT_LOG_PATH: path.join(temporaryRoot, 'hotkey-log.md'),
    });
    await app.register(require('../apps/service/src/app/plugins/selection-assistant.ts').default);
    await app.ready();
    const hotkey = hotkeys.parseHotkey(config.shortcut);
    const event = { keycode: hotkey.keycode, ctrlKey: false, altKey: true, shiftKey: true, metaKey: false };
    onKeyDown({ ...event, altKey: false });
    assert.equal(app.selectionAssistant.getSnapshot().entry, null);
    const complete = new Promise((resolve) => {
      const unsubscribe = app.selectionAssistant.subscribe((entry) => {
        if (entry.status === 'complete' || entry.status === 'error') { unsubscribe(); resolve(entry); }
      });
    });
    onKeyDown(event);
    assert.equal(app.selectionAssistant.run('overlapping manual text'), null);
    const entry = await complete;
    assert.equal(entry.status, 'complete');
    assert.equal(entry.inputText, 'captured by the hotkey');
    assert.equal(entry.outputText, 'Hello from the assistant.');
  } finally {
    await app.close();
    process.env = envBefore;
    if (previous) require.cache[shortcutsPath] = previous;
    else delete require.cache[shortcutsPath];
  }
  assert.equal(stopped, true);
});
