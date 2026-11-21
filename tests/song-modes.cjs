'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {JSDOM}=require('jsdom');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');

function piano(t,noAudio=false){
  const {window:w}=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>w.close());
  const d=w.document, by=id=>d.getElementById(id), voices=[], timers=new Map();
  let clock=100,serial=0;
  Object.defineProperty(w.performance,'now',{value:()=>clock});
  w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};
  w.setTimeout=(fn,ms=0)=>{const id=++serial;timers.set(id,{at:clock+ms,fn});return id;};
  w.clearTimeout=id=>timers.delete(id);
  const tick=(ms,fire=true)=>{
    const end=clock+ms;
    while(fire){
      const next=[...timers.entries()].sort((a,b)=>a[1].at-b[1].at)[0];
      if(!next||next[1].at>end)break;
      clock=Math.max(clock,next[1].at);timers.delete(next[0]);next[1].fn();
    }
    clock=end;
  };
  const connect=()=>({connect});
  w.AudioContext=class{
    state='running';currentTime=0;
    createGain(){return {gain:{setTargetAtTime(){}},connect};}
    createDynamicsCompressor(){return {threshold:{},ratio:{},connect};}
  };
  w.NocturneAudio={presets:[],voice(_ctx,_master,midi,_time,velocity){
    const v={midi,velocity,clock,released:false,release(){this.released=true;}};
    voices.push(v);return v;
  }};
  if(noAudio)delete w.AudioContext;
  w.eval(d.querySelector('script:not([src])').textContent);
  function change(id,value){by(id).value=value;by(id).dispatchEvent(new w.Event('change'));}
  function keyPress(code){for(const type of ['keydown','keyup'])d.dispatchEvent(new w.KeyboardEvent(type,{code,bubbles:true}));}
  function start(song,mode){change('song',song);by('mode'+mode).click();by('lessonAction').click();}
  return {by,tick,change,keyPress,start,voices,note:()=>d.querySelector('#score .current')?.textContent,
    pianoKey:n=>d.querySelector('#keybed [data-midi="'+n+'"]')};
}

test('Demo plays melody; a paused seek preserves tempo, target and next onset',t=>{
  const p=piano(t);p.start('moon','Demo');
  assert.equal(p.note(),'C4');
  assert.deepEqual(p.voices.map(v=>[v.midi,v.velocity]),[[60,.82]]);
  p.tick(200);p.by('lessonAction').click();p.change('bpm','240');p.tick(10000);
  assert.equal(p.note(),'C4');assert.ok(p.voices[0].released);
  p.change('seek','1.50');assert.equal(p.note(),'G4');
  assert.match(p.by('lessonAction').textContent,/繼續/);
  p.by('lessonAction').click();assert.equal(p.voices.at(-1).midi,67);
  p.tick(299);assert.equal(p.note(),'G4');p.tick(1);assert.equal(p.note(),'A4');
});

test('Practice waits for the rest of a chord, even across pause, wrong input and a view change',t=>{
  const p=piano(t);p.start('moon','Practice');
  const play=letter=>p.keyPress('Key'+letter);
  for(const k of 'QETYTEWRYTWE')play(k);
  assert.equal(p.note(),'C4+E4');
  play('Q');play('Q');play('W');
  assert.equal(p.note(),'C4+E4');assert.match(p.by('lessonFeedback').textContent,/再試.*E4/);
  p.change('keyView','88');
  assert.ok(p.pianoKey(60).classList.contains('target-hit'));
  assert.ok(!p.pianoKey(60).classList.contains('target'));
  assert.ok(p.pianoKey(64).classList.contains('target'));
  p.by('lessonAction').click();p.tick(100000);play('E');
  assert.equal(p.note(),'C4+E4');
  p.by('lessonAction').click();assert.match(p.by('lessonFeedback').textContent,/E4/);
  play('E');assert.equal(p.note(),'D4');
});

test('Play Along pulses independently under a long note and never double-counts repeats or resume',t=>{
  const p=piano(t);p.start('canon','Along');
  const bass=()=>p.voices.filter(v=>v.velocity===.36).map(v=>v.midi);
  assert.deepEqual(bass(),[50]);p.keyPress('Digit5');p.keyPress('Digit5');
  assert.match(p.by('lessonFeedback').textContent,/已彈對 1/);
  p.tick(1200);assert.equal(p.note(),'F♯4');assert.deepEqual(bass(),[50,50]);
  p.by('lessonAction').click();p.tick(5000);assert.deepEqual(bass(),[50,50]);
  p.by('lessonAction').click();p.keyPress('Digit5');assert.match(p.by('lessonFeedback').textContent,/已彈對 1/);
  p.tick(1200);assert.equal(p.note(),'E4');p.keyPress('KeyE');
  assert.match(p.by('lessonFeedback').textContent,/已彈對 2/);
});

test('a delayed timer cannot award a stale pitch or emit an overdue burst',t=>{
  const p=piano(t);p.start('canon','Along');
  p.tick(2500,false); // the event loop stalled beyond the F-sharp group
  p.keyPress('Digit5');assert.equal(p.note(),'E4');
  assert.match(p.by('lessonFeedback').textContent,/目標：E4/);
  p.keyPress('KeyE');assert.match(p.by('lessonFeedback').textContent,/已彈對 1/);
  assert.deepEqual(p.voices.filter(v=>v.velocity===.36).map(v=>v.midi),[50,57]);
  p.tick(80000,false);p.keyPress('Digit5');
  assert.match(p.by('lessonFeedback').textContent,/完成！彈對 1 \//);
  assert.equal(p.note(),undefined);
});

test('switching modes keeps transport, position and locked tempo until an explicit restart',t=>{
  const p=piano(t);p.start('moon','Demo');
  p.tick(1500);assert.equal(p.note(),'G4');
  p.change('bpm','240');p.by('modeAlong').click();
  assert.equal(p.note(),'G4');assert.equal(Number(p.by('seek').value),1.5);
  assert.match(p.by('lessonAction').textContent,/暫停/);
  p.tick(300);assert.equal(p.note(),'A4');p.tick(600);
  p.by('modePractice').click();assert.equal(p.note(),'A4');
  assert.equal(Number(p.by('seek').value),2.4);
  p.tick(10000);p.keyPress('KeyQ');assert.equal(p.note(),'A4');
  p.keyPress('KeyY');assert.equal(p.note(),'G4');
  p.by('lessonAction').click();p.by('modeDemo').click();
  assert.match(p.by('lessonAction').textContent,/繼續/);
  p.tick(5000);assert.equal(p.note(),'G4');
  p.by('lessonAction').click();p.tick(599);assert.equal(p.note(),'G4');
  p.tick(1);assert.equal(p.note(),'E4');p.by('restart').click();
  assert.equal(p.note(),'C4');assert.equal(Number(p.by('seek').value),0);
});


test('audio failure leaves transport stopped and reports on the visible lesson surface',t=>{
  const p=piano(t,true);p.start('moon','Demo');
  assert.match(p.by('lessonAction').textContent,/開始/);
  assert.equal(p.by('lessonFeedback').textContent,'此瀏覽器不支援 Web Audio。');
  assert.equal(p.by('lessonFeedback').closest('details'),null);
  assert.equal(p.voices.length,0);
});
