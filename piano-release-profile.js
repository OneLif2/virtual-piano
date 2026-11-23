(function (global) {
  'use strict';
  const VERSION=1, STORAGE_KEY='nocturne.pianoReleaseProfile.v1';
  const DURATIONS=Object.freeze([80,120,200,350,500,750,1000,1500,2000]);
  const FAMILIES=Object.freeze([
    {id:'linear',label:'Linear',description:'直線收音'},
    {id:'exponential',label:'Exponential',description:'指數 · k = 6',k:6},
    {id:'logarithmic',label:'Logarithmic',description:'對數 · 後段收音',k:6},
    {id:'sigmoid',label:'S-Curve / Sigmoid',description:'正規化 S 曲線',slope:12},
    {id:'power-2',label:'Power · 2',description:'冪次 · 平方',exponent:2},
    {id:'power-half',label:'Power · 0.5',description:'冪次 · 平方根',exponent:.5},
    {id:'stepped',label:'Stepped / Quantized',description:'量化階梯 · 8 級',steps:8},
    {id:'smoothstep',label:'Smoothstep',description:'平滑多項式 · 非實測擬合'},
    {id:'cosine',label:'Cosine',description:'餘弦 · 緩入緩出'}
  ].map(Object.freeze));
  const BY_FAMILY=new Map(FAMILIES.map(f=>[f.id,f]));
  const DEFAULT=Object.freeze({familyId:'power-half',durationMs:350});
  const listeners=new Set();let serial=0,lastStoredRaw;
  function family(id){const f=BY_FAMILY.get(id);if(!f)throw new RangeError('Unknown piano release family');return f;}
  function curveValue(id,time){
    const f=family(id);if(typeof time!=='number'||!Number.isFinite(time))throw new TypeError('Curve time must be finite');
    const t=Math.max(0,Math.min(1,time));if(t===0)return 1;if(t===1)return 0;
    if(id==='linear')return 1-t;
    if(id==='exponential')return (Math.exp(-f.k*t)-Math.exp(-f.k))/(1-Math.exp(-f.k));
    if(id==='logarithmic')return Math.log1p(f.k*(1-t))/Math.log1p(f.k);
    if(id==='sigmoid'){const high=1/(1+Math.exp(-f.slope/2)),low=1/(1+Math.exp(f.slope/2));return (1/(1+Math.exp(f.slope*(t-.5)))-low)/(high-low);}
    if(f.exponent)return Math.pow(1-t,f.exponent);
    if(id==='stepped')return 1-Math.floor(t*f.steps)/f.steps;
    if(id==='cosine')return (1+Math.cos(Math.PI*t))/2;
    return 1-3*t*t+2*t*t*t;
  }
  function makeSamples(id,count){
    family(id);if(!Number.isInteger(count)||count<2||count>4097)throw new RangeError('Curve sample count must be 2..4097');
    return Object.freeze(Array.from(Float32Array.from({length:count},(_,i)=>curveValue(id,i/(count-1)))));
  }
  const TABLES=new Map(FAMILIES.map(f=>[f.id,makeSamples(f.id,129)]));
  function curveSamples(id,count=129){family(id);return count===129?TABLES.get(id):makeSamples(id,count);}
  // This is the exact piecewise-linear/stepped envelope scheduled by the engine,
  // not an analytic approximation between the 129 sampled control points.
  function sampledValue(id,time){
    family(id);if(typeof time!=='number'||!Number.isFinite(time))throw new TypeError('Curve time must be finite');
    const t=Math.max(0,Math.min(1,time));if(id==='stepped')return curveValue(id,t);
    const values=TABLES.get(id),position=t*(values.length-1),i=Math.min(values.length-2,Math.floor(position)),fraction=position-i;
    return values[i]+(values[i+1]-values[i])*fraction;
  }
  function validateProfile(profile){
    if(!profile||typeof profile!=='object'||Array.isArray(profile)||Object.keys(profile).sort().join(',')!=='durationMs,familyId')throw new TypeError('A release profile must contain only familyId and durationMs');
    family(profile.familyId);if(typeof profile.durationMs!=='number'||!DURATIONS.includes(profile.durationMs))throw new RangeError('Unsupported piano release duration');
    return Object.freeze({familyId:profile.familyId,durationMs:profile.durationMs});
  }
  function decode(raw){
    if(raw===null)return {profile:DEFAULT,persisted:false,source:'default',errorCode:null};
    try{
      if(typeof raw!=='string'||raw.length>2048)throw new TypeError('Saved profile is too large');
      const data=JSON.parse(raw);
      if(!data||typeof data!=='object'||Array.isArray(data)||Object.keys(data).sort().join(',')!=='profile,revision,version'||data.version!==VERSION||typeof data.revision!=='string'||!/^[A-Za-z0-9:._-]{1,100}$/.test(data.revision))throw new TypeError('Invalid saved profile version');
      return {profile:validateProfile(data.profile),persisted:true,source:'saved',errorCode:null};
    }catch(_){return {profile:DEFAULT,persisted:false,source:'invalid-saved-value',errorCode:'INVALID_SAVED_PROFILE'};}
  }
  function initial(){try{lastStoredRaw=global.localStorage.getItem(STORAGE_KEY);return decode(lastStoredRaw);}catch(_){return {profile:DEFAULT,persisted:false,source:'storage-unavailable',errorCode:'STORAGE_UNAVAILABLE'};}}
  let state=Object.freeze(initial());
  function getProfile(){return state.profile;}
  function getSnapshot(){return Object.freeze({...state,version:VERSION,storageKey:STORAGE_KEY});}
  function notify(reason){
    const detail=Object.freeze({...getSnapshot(),reason});
    for(const listener of listeners){try{listener(detail);}catch(_){}}
    global.dispatchEvent(new CustomEvent('nocturne-release-profile-change',{detail}));return detail;
  }
  function setProfile(profile){
    const next=validateProfile(profile);let persisted=false,errorCode=null;
    try{
      const revision=String(Date.now())+'-'+String(++serial)+'-'+String(Math.floor(global.performance?.timeOrigin||0));
      const serialized=JSON.stringify({version:VERSION,profile:next,revision});
      global.localStorage.setItem(STORAGE_KEY,serialized);if(global.localStorage.getItem(STORAGE_KEY)!==serialized)throw new Error('Profile persistence was not confirmed');lastStoredRaw=serialized;persisted=true;
    }catch(_){errorCode='STORAGE_WRITE_FAILED';}
    state=Object.freeze({profile:next,persisted,source:'apply',errorCode});return notify('apply');
  }
  function onChange(listener){if(typeof listener!=='function')throw new TypeError('Profile observer must be a function');listeners.add(listener);return()=>listeners.delete(listener);}
  global.addEventListener('storage',event=>{
    if(event.key!==STORAGE_KEY&&event.key!==null)return;
    try{
      // Storage events may be queued behind a newer local Apply. Re-read the
      // canonical current value instead of resurrecting stale event.newValue.
      const raw=global.localStorage.getItem(STORAGE_KEY);if(raw===lastStoredRaw&&!(state.source==='storage'&&state.errorCode==='STORAGE_UNAVAILABLE'))return;
      lastStoredRaw=raw;state=Object.freeze({...decode(raw),source:'storage'});
    }catch(_){state=Object.freeze({profile:state.profile,persisted:false,source:'storage',errorCode:'STORAGE_UNAVAILABLE'});}
    notify('storage');
  });
  global.NocturnePianoRelease=Object.freeze({version:VERSION,storageKey:STORAGE_KEY,defaultProfile:DEFAULT,families:FAMILIES,durations:DURATIONS,curveValue,curveSamples,sampledValue,validateProfile,getProfile,getSnapshot,setProfile,onChange});
})(window);
