/* Original preview scheduler: score data and required attribution are in ../score/. */
(() => {
  'use strict';
  function compile(s){
  if(!s)throw Error("Missing score");
  const {ppq,endTick,tempoBpm,tracks}=s;
  if(!Number.isInteger(ppq)||ppq<1||!Number.isInteger(endTick)||endTick<1||
    !Number.isFinite(tempoBpm)||tempoBpm<=0||!Array.isArray(tracks)||tracks.length!==2)throw Error('Invalid full-score header');
  const timeline=[], edges=new Map([[0,{on:[],off:[]}],[endTick,{on:[],off:[]}]]);
  const edge=tick=>{if(!edges.has(tick))edges.set(tick,{on:[],off:[]});return edges.get(tick);};
  const lead=new Map();
  tracks.forEach((part,track)=>{
    part.notes.forEach(({tick,duration,midi,velocity},i)=>{
      if(!Number.isInteger(tick)||tick<0||!Number.isInteger(duration)||duration<1||tick+duration>endTick||
        !Number.isInteger(midi)||midi<21||midi>108)throw Error('Invalid score note '+track+':'+i);
      const event={id:track+':'+i,track,midi,velocity,start:tick/ppq,end:(tick+duration)/ppq};
      timeline.push(event);edge(tick).on.push(event);edge(tick+duration).off.push(event);
      if(s.practiceTracks.includes(track)){if(!lead.has(tick))lead.set(tick,[]);lead.get(tick).push({midi,end:tick+duration});}
    });
  });
  const ticks=[...edges.keys()].sort((a,b)=>a-b), held=new Map();
  const slices=ticks.map((tick,i)=>{
    const {on,off}=edges.get(tick);
    for(const e of off)held.delete(e.id);for(const e of on)held.set(e.id,e);
    return {tick,notes:[...held.values()],until:(ticks[i+1]??endTick)/ppq};
  });
  function at(beat){
    const tick=beat*ppq+1e-7;let lo=0,hi=ticks.length-1;
    while(lo<hi){const mid=(lo+hi+1)>>1;if(ticks[mid]<=tick)lo=mid;else hi=mid-1;}
    return slices[lo];
  }
  const onsets=[...lead.keys()].sort((a,b)=>a-b),guide=[];let count=0,carry=0;
  function add(tick,end,pitches){if(end>tick)guide.push({tick,beats:(end-tick)/ppq,pitches,group:count});}
  add(0,onsets[0],[]);
  onsets.forEach((tick,i)=>{
    const notes=lead.get(tick),next=onsets[i+1]??endTick;
    carry=Math.max(carry,...notes.map(e=>e.end));const release=Math.min(carry,next);
    count++;add(tick,release,[...new Set(notes.map(e=>e.midi))]);add(release,next,[]);
  });
  return {ppq,tempoBpm,endTick,timeline,guide,leadGroups:count,at};
  }
  window.NocturneCompileScore=compile;
  window.NocturneScorePlayer=compile(window.NocturneFullScore);
})();
