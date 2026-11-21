const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {test} = require('node:test');
const {JSDOM} = require('jsdom');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');

function piano(t) {
  const {window} = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  t.after(() => window.close());
  const {document} = window;
  const notes = [];
  const connect = () => ({connect});
  window.AudioContext = class {
    state = 'running';
    currentTime = 0;
    createGain() {
      return {gain: {setTargetAtTime() {}}, connect};
    }
    createDynamicsCompressor() {
      return {threshold: {}, ratio: {}, connect};
    }
  };
  window.NocturneAudio = {
    presets: [],
    voice(_ctx, _destination, midi) {
      const note = {midi, released: false};
      notes.push(note);
      return {release() { note.released = true; }};
    }
  };
  window.eval(document.querySelector('script:not([src])').textContent);

  const byId = id => document.getElementById(id);
  const key = midi => document.querySelector(`#keybed [data-midi="${midi}"]`);
  const change = (id, value) => {
    byId(id).value = value;
    byId(id).dispatchEvent(new window.Event('change', {bubbles: true}));
  };
  const send = (type, code, target = document) => {
    target.dispatchEvent(new window.KeyboardEvent(type, {code, bubbles: true}));
  };
  const press = code => {
    send('keydown', code);
    send('keyup', code);
  };
  return {window, document, notes, byId, key, change, send, press};
}

test('all keyboard views keep the compact typing layout', t => {
  const {document, notes, key, change, press} = piano(t);
  const keys = '#keybed .key';
  assert.equal(document.querySelectorAll(keys).length, 25);
  for (const [count, first, last, whites] of [
    [25, 48, 72, 15], [61, 36, 96, 36], [88, 21, 108, 52]
  ]) {
    change('keyView', String(count));
    const buttons = [...document.querySelectorAll(keys)];
    assert.equal(buttons.length, count);
    assert.equal(buttons[0], key(first));
    assert.equal(buttons.at(-1), key(last));
    assert.equal(buttons.filter(button => button.classList.contains('white')).length, whites);
    assert.equal(buttons.filter(button => button.querySelector('.hotkey').textContent).length, 25);
    press('KeyQ');
    press('Digit5');
    assert.deepEqual(notes.slice(-2).map(note => note.midi), [60, 66]);
  }

  for (const octave of [-2, -1, 0, 1, 2]) {
    change('keyView', '61');
    change('octave', String(octave));
    change('transpose', '-12');
    press('KeyZ');
    press('KeyI');
    assert.deepEqual(notes.slice(-2).map(note => note.midi), [36 + 12 * octave, 60 + 12 * octave]);
    assert.equal(key(36 + 12 * octave).querySelector('.hotkey').textContent, 'Z');
    assert.equal(key(60 + 12 * octave).querySelector('.hotkey').textContent, 'I');
  }
});

test('pointer endpoints and held keys release across views', t => {
  const {window, notes, byId, key, change, send} = piano(t);
  send('keydown', 'KeyQ');
  change('keyView', '88');
  assert.ok(key(60).classList.contains('active'));
  send('keyup', 'KeyQ');
  assert.ok(!key(60).classList.contains('active'));
  assert.ok(notes.at(-1).released);

  const keybed = byId('keybed');
  keybed.setPointerCapture = () => {};
  for (const [midi, id] of [[21, 1], [108, 2]]) {
    const event = new window.MouseEvent('pointerdown', {button: 0, bubbles: true});
    Object.defineProperty(event, 'pointerId', {value: id});
    key(midi).dispatchEvent(event);
    assert.ok(key(midi).classList.contains('active'));
  }
  change('keyView', '25');
  for (const id of [1, 2]) {
    const event = new window.Event('pointercancel');
    Object.defineProperty(event, 'pointerId', {value: id});
    keybed.dispatchEvent(event);
  }
  assert.deepEqual(notes.slice(-2), [
    {midi: 21, released: true}, {midi: 108, released: true}
  ]);
});

test('Canon Practice keeps targets when switching keyboard views', t => {
  const {document, byId, key, change, press} = piano(t);
  const target = () => document.querySelector('#score .current')?.textContent;
  change('keyView', '88');
  change('song', 'canon');
  byId('modePractice').click();
  byId('lessonAction').click();
  assert.equal(target(), 'F♯4');
  assert.ok(key(66).classList.contains('target'));
  press('KeyQ');
  assert.equal(target(), 'F♯4');
  change('keyView', '61');
  assert.ok(key(66).classList.contains('target'));
  press('Digit5');
  assert.equal(target(), 'E4');
  assert.ok(key(64).classList.contains('target'));
});

test('note playback keeps the same pitch and highlight when the view changes', async t => {
  const {window, byId, notes, key, change} = piano(t);
  change('keyView', '88');
  byId('notes').value = 'A0:4';
  byId('playNotes').click();
  await new Promise(resolve => window.setTimeout(resolve, 80));
  assert.ok(key(21).classList.contains('active'));
  change('keyView', '25');
  assert.equal(key(21), null);
  change('keyView', '88');
  assert.ok(key(21).classList.contains('active'));
  byId('stop').click();
  assert.ok(!key(21).classList.contains('active'));
  assert.deepEqual(notes, [{midi: 21, released: true}]);
});
