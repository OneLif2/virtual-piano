'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');
const {JSDOM}=require('jsdom');
const html=readFileSync(join(__dirname,'..','index.html'),'utf8');

function piano(t,noAudio=false,screen={width:0,height:0}){
  const {window:w}=new JSDOM(html,{runScripts:'outside-only',pretendToBeVisual:true});
  t.after(()=>w.close());
  const d=w.document, by=id=>d.getElementById(id), voices=[], timers=new Map();
  let clock=100,serial=0;
  Object.defineProperty(w.performance,'now',{value:()=>clock});
  const frames=new Map();
  w.requestAnimationFrame=fn=>{const id=++serial;frames.set(id,fn);return id;};
  w.cancelAnimationFrame=id=>frames.delete(id);
  function frame(){const batch=[...frames.values()];frames.clear();for(const fn of batch)fn(clock);}
  w.matchMedia=query=>({get matches(){
    if(query.includes('reduced-motion'))return !!screen.reduced;
    const width=Number(query.match(/min-width:\s*(\d+)/)?.[1]||0);
    const height=Number(query.match(/min-height:\s*(\d+)/)?.[1]||0);
    return screen.width>=width&&screen.height>=height;
  },addEventListener(){}});
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return this.id==='readingLane'?screen.width:0;}});
  function resize(width,height){Object.assign(screen,{width,height});w.dispatchEvent(new w.Event('resize'));frame();}

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
  return {by,tick,frame,resize,change,keyPress,start,voices,note:()=>d.querySelector('#score .current')?.textContent,
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

const group=(p,i)=>p.by('readingTrack').querySelector('[data-group="'+i+'"]');
const groupLabels=(p,i)=>[...group(p,i).querySelectorAll('.read-pitch')].map(x=>x.textContent);
function groupX(p,i){
  const shift=parseFloat(p.by('readingTrack').style.transform.slice('translateX('.length));
  return shift+parseFloat(group(p,i).style.left);
}
test('desktop scores use the real key mapping and fallback; resize never changes a manual view',t=>{
  const p=piano(t,false,{width:3440,height:900});
  assert.equal(p.by('keyView').value,'34');
  assert.equal(p.pianoKey(81).querySelector('.hotkey').textContent,'/');
  p.change('keyView','61');
  assert.equal(p.pianoKey(36).querySelector('.note').textContent,'C2');
  assert.equal(p.pianoKey(36).querySelector('.hotkey').textContent,'');
  assert.deepEqual(groupLabels(p,0),['Q']);
  p.change('keyView','88');p.resize(1250,800);assert.equal(p.by('keyView').value,'88');
  p.change('octave','1');assert.deepEqual(groupLabels(p,0),['Z']);
  p.change('octave','2');assert.deepEqual(groupLabels(p,0),['C4']);
  p.change('transpose','-12');assert.deepEqual(groupLabels(p,0),['Z']);
  const key=p.pianoKey(60);p.by('labelCde').click();
  assert.equal(p.by('keybed').dataset.labelMode,'cde');assert.equal(key,p.pianoKey(60));
  assert.deepEqual(groupLabels(p,0),['C4']);
  p.by('labelQwerty').click();assert.deepEqual(groupLabels(p,0),['Z']);
  assert.equal(p.by('labelQwerty').getAttribute('aria-pressed'),'true');
});
test('horizontal track crosses the 30% cursor in musical time; reduced motion snaps on note changes',t=>{
  for(const reduced of [false,true]){
    const width=1200,p=piano(t,false,{width,height:800,reduced});
    assert.equal(p.by('keyView').value,'34');p.start('moon','Demo');
    assert.equal(groupX(p,0),360);assert.equal(groupX(p,1),460);
    p.tick(300);p.frame();assert.equal(groupX(p,0),reduced?360:310);
    p.tick(300);p.frame();assert.equal(groupX(p,1),360);assert.equal(group(p,0).dataset.state,'done');
    p.by('modeAlong').click();p.tick(300);p.frame();
    assert.equal(groupX(p,1),reduced?360:310);
    p.by('lessonAction').click();const x=groupX(p,1);p.tick(5000);p.frame();assert.equal(groupX(p,1),x);
  }
});
test('Practice fixes the cursor at the waiting chord and retains per-pitch hits through label switches',t=>{
  const p=piano(t,false,{width:1200,height:800});p.start('moon','Practice');
  for(const k of 'QETYTEWRYTWE')p.keyPress('Key'+k);
  assert.deepEqual(groupLabels(p,12),['Q','E']);
  const g=group(p,12),x=groupX(p,12);assert.equal(x,360);
  p.keyPress('KeyQ');p.tick(8000);p.frame();assert.equal(groupX(p,12),x);
  assert.equal(g.querySelector('[data-midi="60"]').dataset.hit,'true');
  assert.equal(g.querySelector('[data-midi="64"]').dataset.hit,'false');
  p.by('labelCde').click();
  assert.deepEqual(groupLabels(p,12),['C4','E4']);assert.equal(p.note(),'C4+E4');
  p.keyPress('KeyE');assert.equal(g.dataset.state,'done');assert.equal(groupX(p,13),360);
  assert.equal(g.querySelector('[data-midi="64"]').dataset.hit,'true');
});

test('mid-hold Practice parks the awaited glyph on the cursor without changing transport time',t=>{
  const p=piano(t,false,{width:1200,height:800});p.start('canon','Demo');
  p.tick(2340);p.frame();assert.equal(groupX(p,0),-30);
  p.by('modePractice').click();assert.equal(groupX(p,0),360);
  assert.equal(Number(p.by('seek').value),2.34);
  assert.equal(group(p,0).querySelector('.read-pitch').dataset.mapped,'true');
  p.by('labelCde').click();assert.equal(group(p,0).querySelector('.read-pitch').dataset.mapped,'false');
  p.tick(5000);p.frame();assert.equal(groupX(p,0),360);
  p.by('modeAlong').click();assert.equal(groupX(p,0),-30);p.tick(60);
  assert.equal(p.note(),'E4');assert.equal(groupX(p,1),360);
});
