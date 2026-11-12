const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const { transformSync } = require('esbuild');

require.extensions['.ts'] = (module, filename) => module._compile(transformSync(readFileSync(filename, 'utf8'), {
  loader: 'ts', format: 'cjs', target: 'node22',
}).code, filename);
const { handleTextSubmitKey } = require('../apps/web/src/app/components/text-submit-key.ts');

const fixture = (overrides = {}, submitDisabled = false) => {
  let submissions = 0;
  let prevented = false;
  const changes = [];
  const event = {
    key: 'Enter', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false,
    nativeEvent: { isComposing: false, keyCode: 13 },
    currentTarget: { value: 'hello', selectionStart: 5, selectionEnd: 5, maxLength: -1 },
    preventDefault: () => { prevented = true; },
    ...overrides,
  };
  const caret = handleTextSubmitKey(event, {
    submitDisabled, onSubmit: () => { submissions++; }, onValueChange: value => changes.push(value),
  });
  return { caret, changes, submissions, prevented };
};

test('Enter submits once without adding a line', () => {
  assert.deepEqual(fixture(), { caret: undefined, changes: [], submissions: 1, prevented: true });
});

test('Ctrl+Enter and Command+Enter insert a line without submitting', () => {
  for (const modifier of ['ctrlKey', 'metaKey']) {
    assert.deepEqual(fixture({ [modifier]: true }), {
      caret: 6, changes: ['hello\n'], submissions: 0, prevented: true,
    });
  }
});

test('line breaks replace the selection and report the correct caret', () => {
  assert.deepEqual(fixture({
    ctrlKey: true, currentTarget: { value: 'hello', selectionStart: 1, selectionEnd: 3, maxLength: -1 },
  }), { caret: 2, changes: ['h\nlo'], submissions: 0, prevented: true });
});

test('line breaks respect the input length limit, including selection replacement', () => {
  const currentTarget = { value: '1234', selectionStart: 4, selectionEnd: 4, maxLength: 4 };
  assert.deepEqual(fixture({ ctrlKey: true, currentTarget }).changes, []);
  assert.deepEqual(fixture({
    ctrlKey: true, currentTarget: { ...currentTarget, selectionStart: 1, selectionEnd: 2 },
  }).changes, ['1\n34']);
});

test('IME confirmation never sends, including the legacy composition key code', () => {
  for (const nativeEvent of [{ isComposing: true, keyCode: 13 }, { isComposing: false, keyCode: 229 }]) {
    assert.deepEqual(fixture({ nativeEvent }), { caret: undefined, changes: [], submissions: 0, prevented: false });
  }
});

test('holding Enter and pressing Enter while busy cannot duplicate a submission', () => {
  assert.equal(fixture({ repeat: true }).submissions, 0);
  assert.deepEqual(fixture({}, true), { caret: undefined, changes: [], submissions: 0, prevented: true });
  assert.deepEqual(fixture({ ctrlKey: true }, true).changes, ['hello\n'], 'draft editing remains available while busy');
});

test('other keys and Shift+Enter keep their native editing behavior', () => {
  for (const overrides of [{ key: 'a' }, { shiftKey: true }, { altKey: true }]) {
    assert.deepEqual(fixture(overrides), { caret: undefined, changes: [], submissions: 0, prevented: false });
  }
});
