/* Alternative layout of ONE selected score. Reuse its existing engraving,
   sounding-head highlights and playback line; no additional player or timer. */
(() => {
  'use strict';
  const NS='http://www.w3.org/2000/svg', states=new WeakMap();
  let nextPrefix=0;
  function svg(name){return document.createElementNS(NS,name);}
  function use(id){const el=svg('use');el.setAttribute('href','#'+id);return el;}

  // Referencing a detached <g> via <use> draws nothing. Clone those rows only.
  // A row may become part of the mounted page again, so namespace every local
  // id and its references instead of risking collisions with VexFlow originals.
  function inactiveCopy(row,s){
    let clone=s.copies.get(row);
    if(clone)return clone;
    clone=row.cloneNode(true);
    const els=[clone,...clone.querySelectorAll('*')],ids=new Map();
    const prefix='dense-copy-'+(++nextPrefix)+'-';
    for(const e of els){
      e.classList.remove('is-now');
      if(e.id){ids.set(e.id,prefix+e.id);e.id=prefix+e.id;}
    }
    for(const e of els){
      for(const a of [...e.attributes]){
        let v=a.value;
        if((a.localName==='href')&&v.startsWith('#')&&ids.has(v.slice(1)))v='#'+ids.get(v.slice(1));
        else if(['data-native-id','aria-labelledby','aria-describedby'].includes(a.localName))
          v=v.split(' ').map(x=>ids.get(x)||x).join(' ');
        else if(v.includes('url(#'))v=v.replace(/url\(#([^)]*)\)/g,(original,id)=>ids.has(id)?'url(#'+ids.get(id)+')':original);
        if(v!==a.value)e.setAttributeNS(a.namespaceURI,a.name,v);
      }
    }
    s.copies.set(row,clone);return clone;
  }
  function size(host,s){
    if(host.hidden||!s.shown)return;
    const w=host.clientWidth||innerWidth;
    // The dense shell allocates a height in dvh; do not infer this from SVG sizes.
    const h=host.clientHeight||Math.max(60,innerHeight-host.getBoundingClientRect().top-10);
    let bestC=1,bestR=s.shown,best=-Infinity;
    for(let c=1;c<=s.shown;c++){
      const r=Math.ceil(s.shown/c);
      // Estimate the available paper rectangle after the caption, border and gap.
      const cw=(w-8-(c-1)*5)/c-6,ch=(h-6-(r-1)*5)/r-19;
      const scale=Math.min(cw/s.W,ch/256);
      // Ties prefer fewer empty final cells, then vertical reading order.
      const utility=scale-0.00001*(c*r-s.shown)-0.000001*c;
      if(utility>best){best=utility;bestC=c;bestR=r;}
    }
    if(s.cols!==bestC||s.gridRows!==bestR){
      host.style.setProperty('--dense-cols',bestC);host.style.setProperty('--dense-rows',bestR);
      Object.assign(host.dataset,{columns:bestC,gridRows:bestR});
      s.cols=bestC;s.gridRows=bestR;
    }
  }
  function clear(host){
    if(!host)return;
    const s=states.get(host);s?.observer.disconnect();states.delete(host);
    host.replaceChildren();
    for(const k of ['firstSystem','lastSystem','totalSystems','shownSystems','columns','gridRows'])delete host.dataset[k];
    host.style.removeProperty('--dense-cols');host.style.removeProperty('--dense-rows');
  }
  function render({host,pages,W,count,system,currentSvg,onRead}){
    if(!host||!pages?.length||!W||!currentSvg||!system)return;
    let s=states.get(host);
    if(!s||s.pages!==pages||s.W!==W){
      clear(host);
      const rows=pages.flatMap(page=>Array.from(page.paperSvg.querySelectorAll('g.staff-system'),
        row=>({row,paper:page.paperSvg,line:page.line})));
      if(!rows.length)return;
      s={pages,W,rows,first:-1,shown:0,active:0,liveSvg:null,tiles:[],copies:new WeakMap()};
      s.observer=new ResizeObserver(()=>size(host,s));
      states.set(host,s);host.classList.add('four-rows-view');s.observer.observe(host);
    }
    s.onRead=onRead;
    const total=s.rows.length,id=Number(system),step=Math.max(1,Math.min(total,Math.floor(Number(count)||4)));
    // Page boundaries are not boundaries for this view. Clamp only at the end
    // of the entire score. The final partial block borrows earlier real rows.
    const first=Math.min(step*Math.floor((Math.max(1,Math.min(total,id))-1)/step),total-step);
    const layoutChanged=s.first!==first||s.shown!==step;
    if(layoutChanged){
      s.first=first;s.shown=step;s.active=0;s.liveSvg=null;s.tiles=[];
      const frag=document.createDocumentFragment();
      for(const src of s.rows.slice(first,first+step)){
        const {system:no,systemRow,startBar,endBar}=src.row.dataset;
        const tile=document.createElement('button');tile.type='button';
        Object.assign(tile.dataset,{system:no,startBar,endBar});
        const label=startBar===endBar?startBar:startBar+'–'+endBar;
        tile.setAttribute('aria-label','放大第 '+no+' 行雙手譜，小節 '+label);
        const caption=document.createElement('span');caption.className='four-row-title';
        caption.textContent='第 '+no+' 行 · 小節 '+label;
        const v=svg('svg');v.setAttribute('viewBox','0 '+((Number(systemRow)-1)*256)+' '+W+' 256');
        v.setAttribute('preserveAspectRatio','xMidYMid meet');v.setAttribute('aria-hidden','true');
        v.setAttribute('stroke','black');v.setAttribute('stroke-width','.3');
        tile.append(caption,v);tile.onclick=()=>s.onRead?.(Number(startBar));
        frag.append(tile);s.tiles.push({src,tile,v,live:null,line:null});
      }
      host.replaceChildren(frag);
      Object.assign(host.dataset,{firstSystem:first+1,lastSystem:first+step,totalSystems:total,shownSystems:step});
      size(host,s);
    }
    if(s.liveSvg!==currentSvg||s.active!==id){
      for(const t of s.tiles){
        const live=t.src.paper===currentSvg,here=Number(t.tile.dataset.system)===id;
        if(live!==t.live){
          t.v.replaceChildren(live?use(t.src.row.id):inactiveCopy(t.src.row,s));
          t.live=live;t.line=null;t.tile.dataset.ink=live?'live':'cached';
        }
        if(here&&live&&!t.line){
          t.line=use(t.src.line.id);t.line.classList.add('dense-playhead');t.v.append(t.line);
        }else if(!here&&t.line){t.line.remove();t.line=null;}
        t.tile.classList.toggle('current',here);
        if(here)t.tile.setAttribute('aria-current','true');else t.tile.removeAttribute('aria-current');
      }
      s.liveSvg=currentSvg;s.active=id;
    }
    return {first:first+1,last:first+step,total,shown:step};
  }
  window.CanonDenseRows=Object.freeze({render,clear});
})();

/* Score and transport use the same quarter-note -> audio-seconds conversion. */
(()=>{'use strict';
const $=id=>document.getElementById(id), VF=window.Vex?.Flow??window.VexFlow, SVG='http://www.w3.org/2000/svg';
const $score=$('score'), clock=s=>{s=Math.max(0,s);return Math.floor(s/60)+':'+String(Math.floor(s)%60).padStart(2,'0')+'.'+Math.floor(s*10+1e-6)%10;};
const safe=(m)=>String(m?.message||m),status=(s,bad=false)=>{const t=$('status');t.dataset.error=String(bad);t.textContent=s;};
const qs=new URLSearchParams(location.search), levels=['easy','normal','hard','extreme'];
const songs={
 reference:{title:'Canon in D · Mutopia D 調總譜',subtitle:'D 大調 · 4:08.7',file:'data.json',report:'reference'},
 recording:{title:'Canon in D (Short ver)',subtitle:'7961 錄音配譜 · F 大調 · 2:43.2',file:'recording.json',report:'recording'},
 elise:{title:'Für Elise · 給愛麗絲',subtitle:'A 小調 · 雙手全譜',file:'elise.json',report:'elise'}
};
const picked=qs.get('song')??qs.get('source');
const songInfo=()=>songs[$('source').value]??songs.reference;
const linesPerPage=12, viewModes=['single','rows4','rows8','rows12','rows15'];
let scoreView=viewModes.includes(qs.get('view'))?qs.get('view'):'single';
let entryBar=/^[1-9]\d{0,3}$/.test(qs.get('bar')??'')?Number(qs.get('bar')):1;
const denseCount=()=>scoreView==='single'?0:Number(scoreView.slice(4));
function chrome(){
 const dense=!!denseCount(),tools=$('denseTools');
 document.body.classList.toggle('dense-reader',dense);
 if(!dense)document.body.classList.remove('dense-tools');
 const expanded=document.body.classList.contains('dense-tools');
 tools.hidden=!dense;tools.setAttribute('aria-expanded',String(expanded));tools.textContent=expanded?'收起工具及琴鍵':'展開工具及琴鍵';
 $('scoreView').value=scoreView;
 $('prev').setAttribute('aria-label',dense?'上一組譜行':'上一頁');$('next').setAttribute('aria-label',dense?'下一組譜行':'下一頁');
}
$('denseTools').onclick=()=>{document.body.classList.toggle('dense-tools');chrome();};
chrome();
let data,chart,notes=[],kb=[],bars=[],page=-1,perLine=2,W=720,geometry=[],paperSvg,line,dirty=true,revision=0,fetcher;
let xmlObjectUrl=null;
let pages=[],partsById=new Map(),litParts=new Set(),lastRow=-1,longestNote=0,overview=false;
let ac,ready,paused=0,startAt=0,startPos=0,playing=false,starting=false,next=0,timer=null,raf=null,token=0,voices=[],eventCount=0,lastEvent=null;
let queue=[],backingCount=0,backingOn=true,mix=null,mode='demo',byPart={player:0,backing:0};
const BACKING_GAIN=.64;
let manual=new Map(),phys=new Map(),keyButtons=new Map(),activeSet=new Set(); const B=()=>chart.beatsPerBar*4/chart.beatType;
function svg(name,attrs,parent,content){const e=document.createElementNS(SVG,name);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);if(content!=null)e.textContent=content;parent.appendChild(e);return e;}
const keyNames=['Cb','Gb','Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#','C#'];
const DUR=[[6,'wd'],[4,'w'],[3,'hd'],[2,'h'],[1.5,'qd'],[1,'q'],[.75,'8d'],[.5,'8'],[.375,'16d'],[.25,'16'],[.1875,'32d'],[.125,'32'],[.0625,'64']];
function bucket(len){return DUR.find(([l])=>l<=len+.0001)||DUR.at(-1);}
function split(start,end,fn){
 if(chart?.edition==='mutopia931'){
  // Keep the supplied MIDI's exact PPQ384 onsets/gates. A tuplet/grace must
  // never become several counterfeit key attacks just to fit binary values.
  const length=end-start;if(length<1e-8)return;
  const triplet=Math.abs(length-1/6)<1e-7;
  const nearest=triplet?[.25,'16']:DUR.reduce((a,b)=>Math.abs(b[0]-length)<Math.abs(a[0]-length)?b:a);
  fn(start,length,nearest[1]);return;
 }
 let t=start;for(let i=0;t<end-.01 && i<32;i++){const [len,kind]=bucket(end-t);fn(t,len,kind);t+=len;}
}
function buildBars(){
 longestNote=notes.reduce((m,n)=>Math.max(m,n.duration),0);
 bars=Array.from({length:chart.measures},()=>({treble:[],bass:[]}));
 notes.forEach((n,id)=>{const first=Math.floor((n.beat+1e-7)/B()),last=Math.ceil((n.beat+n.beats-1e-7)/B())-1;
   for(let b=first;b<=last&&bars[b];b++){const s=Math.max(n.beat,b*B()),e=Math.min(n.beat+n.beats,(b+1)*B());
    split(s,e,(t,len,kind)=>bars[b][n.staff].push({n,id,t,len,kind,carry:t>n.beat+.001,more:t+len<n.beat+n.beats-.001}));}});
}
function layout(){
 W=Math.max(260,Math.floor($score.clientWidth||720));let minGap=1;
 for(const bar of bars){const on=Array.from(new Set([...bar.treble,...bar.bass].map(x=>x.t))).sort((a,b)=>a-b);
   for(let j=1;j<on.length;j++){const d=on[j]-on[j-1];if(d>.03)minGap=Math.min(minGap,d);}}
 const wanted=Math.max(180,(B()/minGap)*17);
 // At least one full, twelve-system page for a score of twelve bars or more.
 // A short final page contains music only: no invented bars or duplicated notes.
 perLine=Math.max(1,Math.min(4,Math.floor(chart.measures/linesPerPage),Math.floor((W-125)/wanted)));
 pages=[];dirty=true;page=-1;lastRow=-1;litParts=new Set();
 // Construct before audio starts; turning a page during playback only mounts a
 // cached sheet. Large VexFlow DOM builds must never block the sound scheduler.
 for(let p=0;p<Math.ceil(chart.measures/pageBars());p++)pages.push(engravePage(p));
}
// Inverse seeks to bar/row starts (e.g. 16 quarters at 55 BPM) can land
// 2e-15 quarters short. Snap only floating-point noise, not musical timing.
const beatAt=t=>{const q=t*chart.bpm/60,grid=Math.round(q*16)/16;return Math.abs(q-grid)<1e-9?grid:q;};
const pageBars=()=>perLine*linesPerPage;
function pageAt(t){return Math.max(0,Math.min(Math.ceil(chart.measures/pageBars())-1,Math.floor(beatAt(t)/B()/pageBars())));}
function signatureState(fifths){const s={};for(const letter of (fifths>=0?'FCGDAEB':'BEADGCF').slice(0,Math.abs(fifths)))s[letter]=Math.sign(fifths);return s;}
// This is an engraving preference only: do not rebuild the chart or interrupt playback.
const headPref='canon-studio.pc-noteheads';let pcHeads=true;
try{pcHeads=localStorage.getItem(headPref)!=='off';}catch{}
function headModeUI(){
 $score.closest('.paper').dataset.pcHeads=pcHeads?'on':'off';
 $('headMode').setAttribute('aria-pressed',String(pcHeads));
 $('headMode').textContent=pcHeads?'PC 符頭：開':'PC 符頭：關';
}
$('headMode').onclick=()=>{pcHeads=!pcHeads;headModeUI();try{localStorage.setItem(headPref,pcHeads?'on':'off');}catch{}};
headModeUI();
function engravePage(p){
 const geometry=[],partsById=new Map(),heads=[];
 const register=(id,node,from=-Infinity,to=Infinity)=>{
  if(!partsById.has(id))partsById.set(id,[]);partsById.get(id).push({node,from,to});
 };
 const nlines=Math.min(linesPerPage,Math.ceil((chart.measures-p*pageBars())/perLine));
 const dy=256, mount=document.createElement('div');$score.replaceChildren(mount);
 const renderer=new VF.Renderer(mount,VF.Renderer.Backends.SVG);renderer.resize(W,nlines*dy+8);
 const ctx=renderer.getContext(),paperSvg=mount.querySelector('svg');paperSvg.setAttribute('viewBox',`0 0 ${W} ${nlines*dy+8}`);paperSvg.setAttribute('aria-label',`鋼琴雙譜表，第 ${p+1} 頁，共 ${nlines} 行`);
 const ties=new Map(),systems=[];
 for(let row=0;row<nlines;row++){
  const y=row*dy,first=p*pageBars()+row*perLine,nb=Math.min(perLine,chart.measures-first);
  const system=ctx.openGroup('staff-system');system.classList.add('staff-system');
  Object.assign(system.dataset,{systemRow:row+1,system:p*linesPerPage+row+1,startBar:first+1,endBar:first+nb});
  system.id='music-system-'+system.dataset.system;systems.push(system);
  const staves={};for(const [staff,shift] of [['treble',27],['bass',128]]){
   const st=new VF.Stave(17,y+shift,W-29).addClef(staff).addKeySignature(keyNames[chart.keyFifths+7]||'C').addTimeSignature(chart.beatsPerBar+'/'+chart.beatType);
   st.setEndBarType(first+nb===chart.measures?VF.Barline.type.END:VF.Barline.type.SINGLE);st.setContext(ctx).draw();staves[staff]=st;
  }
  for(const type of [VF.StaveConnector.type.BRACE,VF.StaveConnector.type.SINGLE_LEFT])new VF.StaveConnector(staves.treble,staves.bass).setType(type).setContext(ctx).draw();
  const top=staves.treble.getYForLine(0),btm=staves.bass.getYForLine(4);
  const x0=Math.max(staves.treble.getNoteStartX(),staves.bass.getNoteStartX())+14,xEnd=W-17;
  const barW=(xEnd-x0)/nb;
  for(let i=0;i<nb;i++){
   const b=first+i,barX=x0+i*barW,barRight=barX+barW, xStart=barX+(i?5:0);
   const geom={b,xStart,xEnd:barRight-3,top:top-27,bottom:btm+9,rowTop:y,rowHeight:dy,system:p*linesPerPage+row+1},getX=beat=>xStart+(beat-b*B())/B()*(geom.xEnd-xStart);
   geometry.push(geom);svg('text',{x:barX-3,y:y+12,class:'measure-num'},system,String(b+1));
   if(i)svg('line',{x1:barX-2,x2:barX-2,y1:top,y2:btm,stroke:'#4d504c','stroke-width':1},system);
   for(const staff of ['treble','bass']){
    const st=staves[staff],raw=bars[b][staff],groups=new Map(),sig=signatureState(chart.keyFifths),accs=new Map(),beams=new Map(),occupied=[];
    for(const a of raw){const k=a.t+'|'+a.kind;if(!groups.has(k))groups.set(k,{...a,es:[]});groups.get(k).es.push(a);occupied.push([a.t,a.t+a.len]);}
    // Rests fill whole-staff silences; different sounding durations retain independent stems.
    let until=b*B();const rest=(t,l,k)=>groups.set('rest'+t,{t,len:l,kind:k,es:[]});
    if(!raw.length)rest(until,B(), 'w');
    else{for(const [s,e] of occupied.sort((a,b)=>a[0]-b[0])){if(s>until+.03)split(until,s,rest);until=Math.max(until,e);}
     if(until<(b+1)*B()-.01)split(until,(b+1)*B(),rest);}
    const ordered=[...groups.values()].sort((a,z)=>a.t-z.t||a.len-z.len);
    const atT=new Map();for(const g of ordered){if(!atT.has(g.t))atT.set(g.t,[]);atT.get(g.t).push(g);}
    const drawables=[];
    for(const g of ordered){
     const es=g.es.sort((a,z)=>a.n.midi-z.n.midi),isRest=!es.length,parallel=atT.get(g.t),lane=parallel.indexOf(g);
     const keys=isRest?[staff==='treble'?'b/4':'d/3']:es.map(a=>a.n.step.toLowerCase()+['bb','b','','#','##'][a.n.alter+2]+'/'+a.n.octave);
     const dotted=g.kind.endsWith('d'),dk=g.kind.replace('d',''),stem=parallel.length>1?(lane%2?-1:1):((isRest?60:es.reduce((a,e)=>a+e.n.midi,0)/es.length)<(staff==='treble'?71:50)?1:-1);
     const grace=chart.edition==='mutopia931'&&!isRest&&es.every(e=>e.n.sourceDurationTicks<=21);
     const n=new VF.StaveNote({clef:staff,keys,duration:dk+(isRest?'r':''),stem_direction:stem,...(grace?{glyph_font_scale:22}:{})});
     es.forEach(({n:a},j)=>{const id=a.step+a.octave,prev=accs.has(id)?accs.get(id):(sig[a.step]||0);
      if(prev!==a.alter)n.addModifier(new VF.Accidental(['bb','b','n','#','##'][a.alter+2]),j);accs.set(id,a.alter);});
     if(dotted)VF.Dot.buildAndAttach([n],{all:true});n.setStave(st).setContext(ctx);n.addToModifierContext(new VF.ModifierContext());
     const tc=new VF.TickContext().addTickable(n);tc.preFormat().setX(0);
     const cx0=(n.getNoteHeadBeginX()+n.getNoteHeadEndX())/2;
     const x=(!raw.length&&isRest)?barX+barW/2:getX(g.t)+(parallel.length>1&&lane>0?4*lane:0);
     tc.setX(x-cx0);drawables.push({g,n,es});
     if(!isRest&&g.len<=.75){const v=g.es[0].n.voice,stamp=v+'|'+Math.floor(g.t+1e-6)+'|'+stem; if(!beams.has(stamp))beams.set(stamp,[]);beams.get(stamp).push({g,n});}
    }
    const made=[];for(const chain of beams.values()){
     let run=[];const flush=()=>{if(run.length>=2)made.push(new VF.Beam(run.map(r=>r.n),true));run=[];};
     for(const item of chain){const prev=run.at(-1);if(prev&&Math.abs(item.g.t-prev.g.t-prev.g.len)>.025)flush();run.push(item);}flush();
    }
    for(const {g,n,es} of drawables){const node=ctx.openGroup('staff-note');n.draw();ctx.closeGroup();
     if(es.length){node.classList.add('staff-note');node.dataset.staff=staff;
      es.forEach(e=>register(e.id,node,e.carry?g.t:-Infinity,e.more?g.t+g.len:Infinity));
      // VF may displace seconds or reverse heads for a downward stem. Match by the
      // noteHead object's ID for each key index, not DOM order, pitch math or getX(t).
      const nativeById=new Map([...node.querySelectorAll('g.vf-notehead')].map(el=>[el.id,el]));
      n.noteHeads.forEach((head,j)=>{const native=nativeById.get('vf-'+head.getAttribute('id')),glyph=native?.querySelector(':scope > path');
       if(!glyph)throw Error('未能辨識 VexFlow 符頭');
       heads.push({glyph,system,g,e:es[j],staff});});
      es.forEach((a,j)=>{if(a.carry||a.more){if(!ties.has(a.id))ties.set(a.id,[]);ties.get(a.id).push({n,j,b,row,carry:a.carry,more:a.more});}});}}
    made.forEach(beam=>beam.setContext(ctx).draw());
    if(chart.edition==='mutopia931'){
     const triples=new Map();
     for(const {g,n,es} of drawables)if(es.length&&Math.abs(g.len-1/6)<1e-7){
      const key=g.es[0].n.voice+'|'+Math.floor((g.t+1e-7)*2);
      if(!triples.has(key))triples.set(key,[]);triples.get(key).push(n);
     }
     for(const ns of triples.values())if(ns.length===3){
      const tuplet=ctx.openGroup('staff-tuplet');tuplet.classList.add('staff-tuplet');
      tuplet.setAttribute('aria-label','三連音');
      new VF.Tuplet(ns,{num_notes:3,notes_occupied:2,bracketed:true}).setContext(ctx).draw();ctx.closeGroup();
     }
    }
    for(const [t,gs] of atT){const now=gs.flatMap(g=>g.es).filter(e=>!e.carry).sort((a,b)=>b.n.midi-a.n.midi);
     now.forEach((e,idx)=>{const yy=staff==='treble'?y+40-idx*11:y+238+idx*10;
       const el=svg('text',{x:getX(t),y:yy,'text-anchor':'middle',class:'key-cue '+staff,'data-midi':e.n.midi,'data-note-id':e.id},system,e.n.key??('觸'+pitch(e.n.midi)));
       register(e.id,el);
       svg('title',{},el,(e.n.key??'畫面琴鍵')+' · '+pitch(e.n.midi));});}
   }
  }
  ctx.closeGroup();
 }
 for(const segs of ties.values()){segs.sort((a,b)=>a.b-b.b);const draw=(a,z)=>{const group=ctx.openGroup('sustain-tie');new VF.StaveTie({first_note:a?.n,last_note:z?.n,first_indices:[a?.j??z.j],last_indices:[z?.j??a.j]}).setContext(ctx).draw();ctx.closeGroup();systems[(a??z).row].append(group);};
  if(segs[0].carry)draw(null,segs[0]);for(let j=1;j<segs.length;j++){if(segs[j-1].row===segs[j].row)draw(segs[j-1],segs[j]);else{draw(segs[j-1],null);draw(null,segs[j]);}}if(segs.at(-1).more)draw(segs.at(-1),null);}
 // All pages are inked in a live SVG before caching. Batch the measurements before
 // writing overlays. Read just the actual head path: its group may also contain dots
 // and accidentals, whose width would shift a label away from the note center.
 const bounds=heads.map(h=>h.glyph.getBBox());
 // Use a larger reading size for isolated notes; reserve the original staff
 // spacing for seconds/thirds and densely interlocking parallel voices.
 const crowded=new Set(),columns=new Map();
 bounds.forEach((b,i)=>{const x=b.x+b.width/2,y=b.y+b.height/2,c=Math.floor(x/18);
  for(let k=c-1;k<=c+1;k++)for(const other of columns.get(k)??[]){
   if(Math.abs(other.x-x)<18&&Math.abs(other.y-y)<14){crowded.add(i);crowded.add(other.i);}
  }
  if(!columns.has(c))columns.set(c,[]);columns.get(c).push({x,y,i});
 });
 heads.forEach(({glyph,system,g,e,staff},i)=>{
  const bb=bounds[i],cx=bb.x+bb.width/2,cy=bb.y+bb.height/2;
  const cap=e.n.key??pitch(e.n.midi),open=/^[hw]/.test(g.kind),wide=[...cap].length>1;
  const label=(e.n.key??'畫面琴鍵')+' · '+pitch(e.n.midi)+(e.carry?' · 延音，毋須重按':'');
  glyph.classList.add('native-pitched-head'); // only the oval, never the enclosing modifiers
  const tag=svg('g',{class:'pc-notehead '+staff+(open?' hollow':' solid'),'data-midi':e.n.midi,
   'data-note-id':e.id,'data-staff':staff,'data-carry':String(e.carry),'data-native-id':glyph.parentNode.id,
   role:'img','aria-label':label},system);
  svg('title',{},tag,label);
  const tight=crowded.has(i),w=Math.max(bb.width,wide?(tight?16:21):(tight?12:16)),h=tight?10:14;
  if(tight)tag.classList.add('compact');
  svg('rect',{class:'pc-head-badge',x:cx-w/2,y:cy-h/2,width:w,height:h,rx:2.1},tag);
  svg('text',{class:'pc-head-label',x:cx,y:cy,'text-anchor':'middle','dominant-baseline':'central',
   ...(wide?{textLength:w-2,lengthAdjust:'spacingAndGlyphs'}:{})},tag,cap);
  register(e.id,tag,e.carry?g.t:-Infinity,e.more?g.t+g.len:Infinity);
 });
 const line=svg('line',{id:'playhead',x1:0,x2:0,y1:0,y2:0},paperSvg);
 return {paperSvg,line,geometry,partsById,nlines};
}
function drawPage(p){
 if(!chart||(!dirty&&page===p))return;
 dirty=false;page=p;lastRow=-1;for(const node of litParts)node.classList.remove('is-now');litParts=new Set();
 ({paperSvg,line,geometry,partsById}=pages[p]);
 $score.replaceChildren(paperSvg);$score.scrollTop=0;
 $('pageCount').textContent=(p+1)+' / '+Math.ceil(chart.measures/pageBars());
 $('pageCoverage').textContent=`本頁 ${pages[p].nlines} 行雙譜表 · 小節 ${geometry[0].b+1}–${geometry.at(-1).b+1}`;
 $('prev').disabled=(p===0);$('next').disabled=(p+1)*pageBars()>=chart.measures;
 syncOverview();
}
function syncOverview(){
 const grid=$('scoreOverview'),toggle=$('overview');grid.replaceChildren();grid.hidden=!overview;
 $('scoreFour').hidden=!denseCount();toggle.hidden=!!denseCount();
 $score.setAttribute('aria-hidden',String(overview||!!denseCount()));$score.tabIndex=overview||denseCount()?-1:0;
 $score.classList.toggle('overview-source',overview||!!denseCount());toggle.setAttribute('aria-pressed',String(overview));
 toggle.textContent=overview?'返回讀譜':'全頁總覽';
 if(!overview||page<0)return;
 for(const system of paperSvg.querySelectorAll('g.staff-system')){
  const {systemRow,system:id,startBar,endBar}=system.dataset,button=document.createElement('button');
  button.type='button';button.dataset.system=id;button.setAttribute('aria-label',`跳到第 ${id} 行，小節 ${startBar} 至 ${endBar}`);
  const caption=document.createElement('span');caption.textContent=`第 ${id} 行 · 小節 ${startBar}–${endBar}`;button.append(caption);
  const v=svg('svg',{viewBox:`0 ${(systemRow-1)*256} ${W} 256`,stroke:'black','stroke-width':.3,'aria-hidden':'true'},button);
  svg('use',{href:'#'+system.id},v);svg('use',{href:'#playhead'},v);
  button.onclick=()=>{overview=false;syncOverview();seek((startBar-1)*B()*60/chart.bpm);};
  grid.append(button);
 }
}
$('overview').onclick=()=>{if(!chart)return;overview=!overview;syncOverview();lastRow=-1;update(position());};
function setScoreView(v,bar){
 if(!viewModes.includes(v))return;
 scoreView=v;overview=false;CanonDenseRows.clear($('scoreFour'));chrome();
 const u=new URL(location.href);u.searchParams.delete('bar');
 if(v==='single')u.searchParams.delete('view');else u.searchParams.set('view',v);history.replaceState(null,'',u);
 if(chart){dirty=true;lastRow=-1;syncOverview();if(bar!==undefined)seek((bar-1)*B()*60/chart.bpm,playing);else update(position());}
 if(v!=='single')window.scrollTo(0,0);
}
$('scoreView').onchange=e=>setScoreView(e.target.value);
function enlargeBar(b){setScoreView('single',b);$score.focus({preventScroll:true});$score.scrollIntoView({block:'nearest'});}
function denseTick(g){
 const span=CanonDenseRows.render({host:$('scoreFour'),pages,W,count:denseCount(),perLine,system:g.system,currentSvg:paperSvg,onRead:enlargeBar});
 if(!span)return;
 const {first,last,total}=span,cap='第 '+first+'–'+last+' 行 · '+$('level').selectedOptions[0].textContent+' · 點一行放大',counter=first+'–'+last+' / '+total;
 if($('pageCoverage').textContent!==cap)$('pageCoverage').textContent=cap;
 if($('pageCount').textContent!==counter)$('pageCount').textContent=counter;
 $('prev').disabled=first<=1;$('next').disabled=last>=total;
}
function pitch(m){return ['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'][m%12]+(Math.floor(m/12)-1);}
function keysUI(){
 const el=$('keys');el.replaceChildren();keyButtons.clear();phys=new Map(kb.filter(k=>k.code).map(k=>[k.code,k.midi]));
 const black=m=>[1,3,6,8,10].includes(m%12), whites=kb.filter(k=>!black(k.midi)).length;let wi=0;
 el.style.minWidth=(whites*24)+'px';
 kb.forEach(k=>{const sharp=black(k.midi),b=document.createElement('button');b.type='button';b.className='key '+(sharp?'black':'white');b.dataset.midi=k.midi;
  b.style.left=(100*(sharp?wi-.29:wi)/whites)+'%';b.style.width=(100*(sharp?.58:1)/whites)+'%';if(!sharp)wi++;
  const s=document.createElement('span'),small=document.createElement('small');small.textContent=pitch(k.midi);s.textContent=k.key??'觸';s.append(small);b.append(s);
  b.setAttribute('aria-label',pitch(k.midi)+'，'+(k.key??'畫面琴鍵'));b.title=b.getAttribute('aria-label');
  b.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();b.setPointerCapture(e.pointerId);manualOn('p'+e.pointerId,k.midi);});
  b.addEventListener('lostpointercapture',e=>manualOff('p'+e.pointerId));b.addEventListener('pointerup',e=>manualOff('p'+e.pointerId));b.addEventListener('pointercancel',e=>manualOff('p'+e.pointerId));
  b.addEventListener('click',e=>{if(e.detail===0){const id='a'+k.midi;manualOn(id,k.midi);setTimeout(()=>manualOff(id),280);}});
  el.append(b);keyButtons.set(k.midi,b);
 });}
let synthOnly=false;
async function engine(){
 if(!ac)ac=new (window.AudioContext||window.webkitAudioContext)({latencyHint:'interactive'});
 await ac.resume();if(!ready)ready=(async()=>{
  try{if(!window.NocturnePiano)throw Error('no sample provider');await window.NocturnePiano.prepare(ac);$('engine').textContent='Accurate Grand · 取樣鋼琴';}
  catch{ synthOnly=true;$('engine').textContent='合成琴音 · 取樣未能載入';}
 })();await ready;
}
function voice(m,at,vel=.72,output=null,elapsed=0){
 if(!synthOnly){const v=window.NocturnePiano?.voice(ac,m,at,vel,output,elapsed);if(v)return v;}
 const osc=ac.createOscillator(),gain=ac.createGain();osc.type='triangle';osc.frequency.value=440*2**((m-69)/12);
 gain.gain.setValueAtTime(.00001,at);gain.gain.exponentialRampToValueAtTime(.12*vel*Math.exp(-Math.min(2,elapsed)),at+.007);gain.gain.exponentialRampToValueAtTime(.013*vel,at+Math.max(.017,2-elapsed));osc.connect(gain);gain.connect(output??ac.destination);osc.start(at);
 return {release(t){const when=Math.max(ac.currentTime,t);if(gain.gain.cancelAndHoldAtTime)gain.gain.cancelAndHoldAtTime(when);else gain.gain.cancelScheduledValues(when);gain.gain.setTargetAtTime(.00001,when,.07);try{osc.stop(when+.34);}catch{}}};
}
function manualOn(id,m){if(manual.has(id))return;const rec={m};manual.set(id,rec);keyButtons.get(m)?.classList.add('manual-active');
 engine().then(()=>{if(manual.get(id)!==rec)return;rec.v=voice(m,ac.currentTime,.76);}).catch(e=>{manualOff(id);status('未能啟動琴音：'+safe(e),true);});}
function manualOff(id){const r=manual.get(id);if(!r)return;manual.delete(id);if(r.v)r.v.release(ac.currentTime);if(![...manual.values()].some(a=>a.m===r.m))keyButtons.get(r.m)?.classList.remove('manual-active');}
function stopManual(){for(const id of [...manual.keys()])manualOff(id);}
// AudioContext.currentTime is the render clock, ahead of the samples reaching
// the output device. Draw from the output timestamp where supported, keeping
// note scheduling on the (uncompensated) render clock.
function audibleTime(){
 const ts=ac.getOutputTimestamp?.(), wall=performance.now();
 if(ts && Number.isFinite(ts.contextTime) && ts.performanceTime>0 && wall>=ts.performanceTime && wall-ts.performanceTime<250)
   return Math.min(ac.currentTime,ts.contextTime+(wall-ts.performanceTime)/1000);
 return Math.max(0,ac.currentTime-(Number.isFinite(ac.outputLatency)?ac.outputLatency:0));
}
function position(){return playing?Math.min(chart.duration,startPos+Math.max(0,audibleTime()-startAt)):paused;}
function update(t){
 if(!chart)return;drawPage(pageAt(t));const beat=Math.min(chart.measures*B()-.00001,beatAt(t)),bm=Math.floor(beat/B()),g=geometry.find(g=>g.b===bm);
 if(g){const x=g.xStart+(beat/B()-bm)*(g.xEnd-g.xStart);line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('y1',g.top);line.setAttribute('y2',g.bottom);
  if(lastRow!==g.system){lastRow=g.system;line.dataset.system=$score.dataset.system=g.system;
   if(overview){for(const tile of $('scoreOverview').children)tile.classList.toggle('current',Number(tile.dataset.system)===g.system);}
   else if(!denseCount()&&(g.rowTop<$score.scrollTop||g.rowTop+g.rowHeight>$score.scrollTop+$score.clientHeight))
    $score.scrollTop=Math.max(0,g.rowTop-5);
  }}
 const nowParts=new Set(),midis=new Set();
 if(playing&&audibleTime()>=startAt){
  // Binary search the sounding window rather than touching every ink mark of
  // twelve engraved systems on every animation frame; the score and keys use
  // actual performance on/off times, including held notes across row breaks.
  let lo=0,hi=notes.length;while(lo<hi){const m=(lo+hi)>>1;if(notes[m].time<=t)lo=m+1;else hi=m;}
  for(let id=lo-1;id>=0&&notes[id].time+longestNote>=t;id--){const n=notes[id];if(t>=n.time+n.duration)continue;
   midis.add(n.midi);for(const d of partsById.get(id)||[])if(beat>=d.from&&beat<d.to)nowParts.add(d.node);
  }}
 for(const el of litParts)if(!nowParts.has(el))el.classList.remove('is-now');
 for(const el of nowParts)if(!litParts.has(el))el.classList.add('is-now');litParts=nowParts;
 if(g&&denseCount())denseTick(g);
 const demoKeys=mode==='demo'?midis:new Set();
 for(const m of activeSet)if(!demoKeys.has(m))keyButtons.get(m)?.classList.remove('demo-active');
 for(const m of demoKeys)if(!activeSet.has(m))keyButtons.get(m)?.classList.add('demo-active');activeSet=demoKeys;
 $('elapsed').textContent=clock(t);$('scrub').value=t;$('loc').textContent='第 '+(g?.system??'—')+' 行 · 小節 '+(bm+1)+' / '+chart.measures;
 $('target').textContent=midis.size?[...midis].map(m=>pitch(m)+' '+(kb.find(k=>k.midi===m)?.key??'觸')).join(' · '):'—';
}
// Engraving and prompts use only notes (the player's grade); the transport
// merges those targets with the exact complement from the same D score.
function arrangement(c){
 const ids=c.backingNoteIds??[],full=data.charts.extreme.notes,ref=Array.isArray(c.backingNoteIds);
 if($('source').value!=='recording'&&!ref)throw Error('欠缺分軌資料，請重建所選琴譜');
 const known=new Set(),stamp=n=>n.beat+':'+n.midi;
 const canonical=ref?new Set(full.map(stamp)):null;
 const q=c.notes.map(n=>{const key=stamp(n);if(ref&&(!canonical.has(key)||known.has(key)))throw Error('演奏譜含無效或重複音符');
   known.add(key);return {n,part:'player'};});
 for(const id of ids){const n=full[id];if(!Number.isInteger(id)||!n||known.has(stamp(n)))throw Error('伴奏含無效或重複音符');
  known.add(stamp(n));q.push({n,part:'backing'});}
 if(ref&&(known.size!==full.length||($('level').value==='extreme'&&ids.length)))throw Error('所選歌曲聲部不完整');
 return q.sort((a,b)=>a.n.time-b.n.time||a.n.midi-b.n.midi);
}
function showArrangement(){
 const ref=!!chart&&Array.isArray(chart.backingNoteIds),btn=$('backingToggle');
 $('arrangement').hidden=!ref;$('along').hidden=!ref;
 $('partCounts').textContent=ref?`演奏 ${notes.length.toLocaleString()} 音 · 伴奏 ${backingCount.toLocaleString()} 音 · ${(notes.length/chart.duration).toFixed(2)} 鍵/秒`:'';
 btn.disabled=!backingCount;btn.textContent=backingCount?(backingOn?'伴奏：開':'伴奏：關'):'全譜 · 無伴奏';
 btn.setAttribute('aria-pressed',String(!!backingCount&&backingOn));
}
$('backingToggle').onclick=()=>{if(!backingCount)return;backingOn=!backingOn;
 if(mix?.backing)mix.backing.gain.setTargetAtTime(backingOn?BACKING_GAIN:0,ac.currentTime,.008);showArrangement();};
function makeMix(){
 const bus=ac.createGain();bus.connect((!synthOnly&&window.NocturnePiano?.output(ac))||ac.destination);
 const lane=v=>{const g=ac.createGain();g.gain.value=v;g.connect(bus);return g;};
 return {bus,player:mode==='demo'?lane(1):null,backing:backingCount?lane(backingOn?BACKING_GAIN:0):null};
}
function silence(){
 // Master gate for *this run only*: stop future attacks and discard old
 // release tails on seek/grade switch without cutting user's manual notes.
 const old=mix;mix=null;if(old){const now=ac.currentTime;old.bus.gain.cancelScheduledValues(now);
  old.bus.gain.setValueAtTime(1,now);old.bus.gain.linearRampToValueAtTime(0,now+.015);
  setTimeout(()=>{old.bus.disconnect();old.player?.disconnect();old.backing?.disconnect();},60);}
 if(ac)for(const a of voices)if(ac.currentTime<a.off)a.v.release(ac.currentTime);voices=[];
}
function buttons(){for(const [role,id,label] of [['demo','demo','Demo 示範'],['along','along','跟彈']]){
 $(id).textContent=mode===role&&(playing||starting)?(starting?'◼ 取消載入':'Ⅱ 暫停'):'▶ '+label;}}
function pause(){const p=position();token++;playing=false;starting=false;paused=p;clearInterval(timer);cancelAnimationFrame(raf);silence();buttons();if(chart)update(p);}
function scheduleOne({n,part},on,off,elapsed=0){
 const lane=mix?.[part];if(!lane)return; // Follow: no automatic player-note source whatsoever.
 const v=voice(n.midi,on,n.velocity||.7,lane,elapsed);v.release(off);voices.push({v,off});eventCount++;byPart[part]++;lastEvent={part,midi:n.midi,time:n.time,on,off};}
function finish(){pause();status(mode==='along'?'跟彈完成。':'示範完成。');}
function pump(){if(!playing)return;
 // Hidden tabs can suspend animation frames and coalesce timers to one second.
 // Keep explicit playback alive, never start another transport on visibility.
 if(position()>=chart.duration){finish();return;}
 const now=ac.currentTime,horizon=startPos+now-startAt+(document.hidden?6:.65);voices=voices.filter(r=>r.off+.5>=now);
 while(next<queue.length&&queue[next].n.time<=horizon){const e=queue[next++],n=e.n,end=n.time+n.duration,planned=startAt+n.time-startPos;
   if(startAt+end-startPos<=now)continue;const at=Math.max(now,planned);scheduleOne(e,at,Math.max(at+.007,startAt+end-startPos),at-planned);}}
function frame(){if(!playing)return;const t=position();if(t>=chart.duration){finish();return;}update(t);raf=requestAnimationFrame(frame);}
async function start(){if(!chart||playing||starting)return;const mark=++token;starting=true;buttons();
 try{await engine();if(token!==mark||!chart)return;
  if(paused>=chart.duration-.015)paused=0;startPos=paused;startAt=ac.currentTime+.035;next=queue.findIndex(e=>e.n.time>=paused-.000001);if(next<0)next=queue.length;
  mix=makeMix();eventCount=0;byPart={player:0,backing:0};lastEvent=null;
  for(let i=0;i<next;i++){const e=queue[i],n=e.n;if(n.time+n.duration>paused)scheduleOne(e,startAt,startAt+n.time+n.duration-paused,paused-n.time);}
  starting=false;playing=true;buttons();status(mode==='along'?'跟彈中 · 譜上提示音請自己彈':'示範中 · 游標、琴鍵及伴奏共用音訊時鐘');pump();timer=setInterval(pump,25);frame();
 }catch(e){if(mark!==token)return;pause();status('示範未能開始：'+safe(e),true);}}
function seek(t,resume=playing){pause();paused=Math.min(chart.duration,Math.max(0,t));update(paused);if(resume)start();}
function apply(){
 pause();stopManual();const c=data.charts[$('level').value];if(!c||!(c.bpm>0)||!c.notes?.length)throw Error('此版本缺少可用譜面');
 chart=c;notes=[...c.notes].sort((a,b)=>a.time-b.time||a.midi-b.midi);queue=arrangement(c);backingCount=queue.length-notes.length;mode='demo';eventCount=0;byPart={player:0,backing:0};lastEvent=null;
 kb=c.keyboard??data.keyboard;paused=0;buildBars();layout();keysUI();buttons();showArrangement();
 $('edition').textContent=c.sourceLabel+' · '+c.label+($('source').value!=='recording'&&$('level').value==='extreme'?' 全譜':'');
 $('sig').textContent=($('source').value==='elise'?'A 小調':keyNames[c.keyFifths+7]+' 大調')+' · '+c.beatsPerBar+'/'+c.beatType+' · ♩ '+c.bpm+' · '+notes.length.toLocaleString()+' 鍵';
 $('scrub').max=c.duration;$('total').textContent=clock(c.duration);$('along').disabled=$('demo').disabled=$('restart').disabled=$('scrub').disabled=false;
 if(xmlObjectUrl){URL.revokeObjectURL(xmlObjectUrl);xmlObjectUrl=null;}
 $('xml').href='notation/'+$('source').value+'/'+$('level').value+'.musicxml';$('xml').hidden=false;
 if($('source').value==='elise'){
  const xml=$('elise-xml-'+$('level').value);
  if(xml){xmlObjectUrl=URL.createObjectURL(new Blob([JSON.parse(xml.textContent)],{type:'application/vnd.recordare.musicxml+xml'}));$('xml').href=xmlObjectUrl;$('xml').download='fur-elise-'+$('level').value+'.musicxml';}
 }else $('xml').removeAttribute('download');
 paused=(Math.min(chart.measures,entryBar)-1)*B()*60/chart.bpm;entryBar=1;
 update(paused);status(c.description||c.sourceLabel);
}
async function load(){
 const rev=++revision;pause();stopManual();chart=null;data=null;dirty=true;CanonDenseRows.clear($('scoreFour'));$('scoreOverview').replaceChildren();$score.replaceChildren();$('keys').replaceChildren();
 for(const id of ['along','demo','restart','scrub','next','prev'])$(id).disabled=true;backingCount=0;showArrangement();
 $('edition').textContent='載入中…';$('pageCount').textContent='—';$('xml').hidden=true;fetcher?.abort();fetcher=new AbortController();
 try{const src=songInfo().file,inline=$('source').value==='elise'?$('elise-pack'):null;
  let parsed;if(inline)parsed=JSON.parse(inline.textContent);
  else {const r=await fetch(src,{signal:fetcher.signal,cache:'no-cache'});if(!r.ok)throw Error(src+' · HTTP '+r.status);parsed=await r.json();}
  if(rev!==revision)return;data=parsed;apply();
 }catch(e){if(rev!==revision)return;chart=null;data=null;$('edition').textContent='未能開啟所選譜源';for(const id of ['demo','restart','scrub','next','prev'])$(id).disabled=true;status('載入失敗：'+safe(e)+'。請用本機 HTTP 連結重新整理，或選擇另一譜源。',true);}}
function address(){const u=new URL(location.href);u.searchParams.delete('bar');u.searchParams.set('source',$('source').value);u.searchParams.set('song',$('source').value);u.searchParams.set('level',$('level').value);history.replaceState(null,'',u);}
const defaultLevel=()=>$('source').value==='reference'?'extreme':'easy';
function editionChoices(){
 const ref=$('source').value==='reference',options=$('level').options;
 const info=songInfo();$('song').value=$('source').value;
 $('densityReport').hidden=false;$('densityReport').href='review.html?report=kps&song='+info.report;
 $('densityReport').setAttribute('aria-label',info.title+' KPS 四級曲線報告，另開分頁');
 $('workTitle').textContent=info.title;$('songSubtitle').textContent=info.subtitle;
 $('composer').textContent=$('source').value==='elise'?'Ludwig van Beethoven':'Johann Pachelbel';
 $('composerFolio').textContent='PIANO / '+($('source').value==='elise'?'BEETHOVEN':'PACHELBEL');
 document.title=info.title+' · 五線譜練習室';
 options[0].textContent=ref?'Easy · Verse 主題':'Easy';
 options[3].textContent=ref?'Extreme · D 調全譜':$('source').value==='elise'?'Extreme · 全譜':'Extreme · 候選編配';
}
$('source').value=Object.hasOwn(songs,picked)?picked:'reference';editionChoices();
$('level').value=levels.includes(qs.get('level'))?qs.get('level'):defaultLevel();
$('source').addEventListener('change',()=>{editionChoices();$('level').value=defaultLevel();address();load();});$('level').addEventListener('change',()=>{address();if(data)apply();});
$('song').addEventListener('change',()=>{$('source').value=$('song').value;$('source').dispatchEvent(new Event('change'));});
function transport(role){const wasMoving=playing||starting,same=mode===role;
 if(wasMoving){pause();if(same){status('已暫停 · 再按播放繼續');return;}}
 mode=role;start();}
$('demo').onclick=()=>transport('demo');$('along').onclick=()=>transport('along');$('restart').onclick=()=>seek(0,playing);
let resumeScrub=false;
$('scrub').addEventListener('pointerdown',()=>{resumeScrub=playing;if(playing)pause();});
$('scrub').addEventListener('input',e=>{resumeScrub||=playing;seek(Number(e.target.value),false);});
$('scrub').addEventListener('change',()=>{if(resumeScrub)start();resumeScrub=false;});$('scrub').addEventListener('pointerup',()=>{if(resumeScrub)start();resumeScrub=false;});
for(const [id,delta] of [['prev',-1],['next',1]])$(id).onclick=()=>{
 if(!chart)return;
 if(!denseCount())return seek((page+delta)*pageBars()*B()*60/chart.bpm,false);
 const host=$('scoreFour'),n=denseCount(),first=Number(host.dataset.firstSystem),last=Number(host.dataset.lastSystem);
 const dest=delta<0?Math.max(0,Math.floor((first-2)/n)*n):last;
 seek(dest*perLine*B()*60/chart.bpm,false);
};
for(const [id,delta] of [['keyLeft',-1],['keyRight',1]])$(id).onclick=()=>{const el=$('keys').parentElement;el.scrollBy({left:delta*el.clientWidth*.65,behavior:'smooth'});};
window.addEventListener('keydown',e=>{if(!chart||e.repeat||e.ctrlKey||e.metaKey||e.altKey||!phys.has(e.code)||e.target.closest('input,select,textarea,[contenteditable=true]'))return;
 if(e.code==='Tab'&&(document.activeElement!==$score||e.shiftKey))return;if(e.code==='Space'&&e.target.closest('button'))return;e.preventDefault();manualOn(e.code,phys.get(e.code));});
window.addEventListener('keyup',e=>manualOff(e.code));window.addEventListener('blur',stopManual);
document.addEventListener('visibilitychange',()=>{if(document.hidden){stopManual();if(playing)pump();}else if(playing){pump();if(playing)update(position());}});
window.addEventListener('pagehide',()=>{if(playing||starting){pause();status('示範已暫停');}stopManual();});
let resizeToken;new ResizeObserver(()=>{clearTimeout(resizeToken);resizeToken=setTimeout(()=>{if(chart&&!denseCount()&&Math.max(260,Math.floor($score.clientWidth))!==W){const resume=playing;if(resume)pause();layout();update(position());if(resume)start();}},90);}).observe($('score').parentElement);
window.NocturneStaff={snapshot:()=>({chart:$('level').value,source:$('source').value,mode,playing,position:position(),page:page+1,perPage:pageBars(),perLine,linesPerPage,system:chart?Math.min(Math.ceil(chart.measures/perLine),1+Math.floor(beatAt(position())/B()/perLine)):0,pageTotal:chart?Math.ceil(chart.measures/pageBars()):0,noteCount:notes.length,backingCount,backingOn:!!backingCount&&backingOn,active:[...activeSet],issued:eventCount,issuedByPart:{...byPart},lastEvent})};
load();
})();
