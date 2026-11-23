(function (global) {
  'use strict';
  const original = global.NocturneAudio;
  const catalog = JSON.parse(document.getElementById('sampleBankCatalog').textContent);
  if (!original || !catalog || catalog.presets.length !== 109) throw new Error('Sampled audio requires studio.js and sampled-catalog.js first.');
  const volumeTable=JSON.parse(document.getElementById('volumeCalibration').textContent);
  let volumeAlignment=true;
  if(volumeTable.reference!=='concert-grand'||volumeTable.midiMin!==43||volumeTable.midiMax!==76||volumeTable.policy?.metric!=='whole-note-max-200ms-rms')throw Error('Wrong local volume calibration');
  for(const p of catalog.presets)for(let n=43;n<=76;n++){
    const g=volumeTable.gains[p.id]?.[n];
    if(!Number.isFinite(g)||g<=0||g>=1e6||(p.id==='concert-grand'&&g!==1))throw Error('Invalid volume calibration: '+p.id+'/'+n);
  }
  function getVolumeAlignment(){return volumeAlignment;}
  function setVolumeAlignment(enabled){if(typeof enabled!=='boolean')throw TypeError('Boolean volume alignment required');volumeAlignment=enabled;return enabled;}
  function alignmentInfo(id,midi=60){
    const n=Math.max(43,Math.min(76,Math.round(Number.isFinite(midi)?midi:60))),gain=volumeTable.gains[id]?.[n];
    if(!Number.isFinite(gain))return Object.freeze({id,midi,calibrated:false,applied:false,gain:1,effectiveGain:1,db:0});
    return Object.freeze({id,midi,n,reference:'concert-grand',calibrated:true,applied:volumeAlignment,gain,effectiveGain:volumeAlignment?gain:1,db:20*Math.log10(gain),medianDb:volumeTable.summaries[id]?.trimMedianDb,limited:!!volumeTable.policy.peakLimited?.[id]?.[n],outOfRange:midi<43||midi>76,metric:'whole-note-max-200ms-rms'});
  }
  function volumeGain(id,midi){return volumeAlignment?alignmentInfo(id,midi).effectiveGain:1;}
  const scriptURL = document.currentScript && document.currentScript.src || location.href;
  const presets = Object.freeze(catalog.presets.map(p => Object.freeze({id:p.id,name:p.name,short:p.short,category:p.category,available:p.available!==false})));
  const rows = new Map(catalog.presets.map(p => [p.id,p]));
  const failed = new Map(); const REF='local-sounds-yamaha-v1';
  if(catalog.revision!==REF)throw Error('Unexpected sample bank revision');
  const statuses = new Map(), observers = new Set(), banks = new Map(), decoded = new Map(), handles = new Set(), liveHandles = new Set();
  const MAX_BANKS=4, MAX_BUFFER_BYTES=128*1024*1024, MAX_BUFFERS=128, MAX_LIVE_VOICES=96;
  const batches=new Map();
  let bufferBytes=0;
  const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  const finite=(n,d)=>Number.isFinite(n)?n:d;
  function available(id){return rows.get(id)?.available===true;}
  function unavailableError(id){const error=new Error('此音色未於公開版提供。');report(id,'error',error.message);return error;}
  function rowFor(id){const row=rows.get(id);if(!row||!available(id))throw unavailableError(id);return row;}
  function report(id,state,message) {
    const value=Object.freeze({id,state,message:message||'',ready:state==='ready'}); statuses.set(id,value);
    observers.forEach(fn=>{try{fn(value);}catch(_){}});
    if (global.dispatchEvent && global.CustomEvent) global.dispatchEvent(new CustomEvent('nocturne-audio-status',{detail:value}));
    return value;
  }
  function getStatus(id){if(!available(id))return Object.freeze({id,state:'error',message:'此音色未於公開版提供。',ready:false,available:false});return statuses.get(id)||Object.freeze({id,state:'idle',message:'Not loaded',ready:false,available:true});}
  function onStatus(fn) { if(typeof fn!=='function')throw new TypeError('Status observer must be a function');observers.add(fn);return()=>observers.delete(fn); }
  function touch(map,key,value) { map.delete(key);map.set(key,value);return value; }
  function trimBanks() {
    while(banks.size>MAX_BANKS) {
      const item=[...banks].find(([,v])=>v.data);
      if(!item)break;
      banks.delete(item[0]);report(item[0],'idle','Bank evicted from bounded cache');
    }
  }
  async function verifiedAsset(asset) {
    if(!/^(?:(?:grand_piano|soundfonts|fluidr3)\/[A-Za-z0-9_.-]+|pianos\/[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+)$/.test(asset.file))throw Error('Unsafe local sample path');
    const url=new URL('instruments/'+asset.file,scriptURL);
    if(url.origin!==location.origin)throw Error('Samples must stay on this site origin');
    const response=await fetch(url.href,{credentials:'omit',redirect:'error'});
    if(!response.ok)throw Error('Local sample HTTP '+response.status);
    const bytes=await response.arrayBuffer();
    if(bytes.byteLength!==asset.bytes)throw Error('Local sample length mismatch');
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(x=>x.toString(16).padStart(2,'0')).join('');
    if(digest!==asset.sha256)throw Error('Local sample SHA-256 mismatch: '+asset.file);
    return bytes;
  }
  function noteMidi(key) {
    const match=/^([A-G])([#b]?)(-?\d+)$/.exec(key); if(!match)throw new Error('Invalid sample note: '+key);
    const pitch={C:0,D:2,E:4,F:5,G:7,A:9,B:11}[match[1]]+(match[2]==='#'?1:match[2]==='b'?-1:0);
    const midi=(Number(match[3])+1)*12+pitch;
    if(midi<0||midi>127)throw new Error('Sample note out of range');return midi;
  }
  function parseSoundfont(text) {
    // Strictly recognize a flat assignment as DATA. Never use eval, Function or script injection.
    const match=/^\s*if\s*\(typeof\(MIDI\)\s*===\s*'undefined'\)\s*var MIDI\s*=\s*\{\};\s*if\s*\(typeof\(MIDI\.Soundfont\)\s*===\s*'undefined'\)\s*MIDI\.Soundfont\s*=\s*\{\};\s*MIDI\.Soundfont\.[A-Za-z_][A-Za-z_0-9]*\s*=\s*(\{[\s\S]*\})\s*;?\s*$/.exec(text);
    if(!match)throw new Error('Unrecognized soundfont DATA wrapper');
    const object=JSON.parse(match[1].replace(/,\s*}/g,'}'));
    if(!object || Array.isArray(object) || typeof object!=='object')throw new Error('Invalid sample map');
    const keys=Object.keys(object);if(!keys.length||keys.length>128)throw new Error('Invalid sample count');
    // Verified local banks have different note counts; flat 1..128 audio entries only.
    return keys.map(key=>{
      const data=object[key];
      if(typeof data!=='string'||!/^data:audio\/(?:ogg|mp3|mpeg|mp4|x-m4a);base64,[A-Za-z0-9+/=]+$/.test(data))throw new Error('Non-audio soundfont entry');
      return {midi:noteMidi(key),data};
    }).sort((a,b)=>a.midi-b.midi);
  }
  function dataBytes(data) {
    const binary=atob(data.slice(data.indexOf(',')+1)), bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);return bytes.buffer;
  }
  async function loadBank(id) {
    const row=rowFor(id);id=row.bank;let state=banks.get(id);
    if(state){touch(banks,id,state);return state.pending;}
    // Reserve a slot BEFORE starting fetch; completed banks must not permit unbounded in-flight loads.
    while(banks.size>=MAX_BANKS) {
      const evict=[...banks].find(([,s])=>s.data);
      if(!evict)throw new Error('Too many sample banks loading; retry after loading finishes');
      banks.delete(evict[0]);report(evict[0],'idle','Bank evicted from bounded cache');
    }
    state={data:null,pending:null};banks.set(id,state);
    state.pending=(async()=>{
      const data=row.kind==='samples'?row.assets.map(asset=>({midi:asset.midi,asset})):parseSoundfont(new TextDecoder().decode(await verifiedAsset(row.assets[0])));
      state.data=data;trimBanks();return state;
    })().catch(error=>{if(banks.get(id)===state)banks.delete(id);report(id,'error',error.message);throw error;});
    return state.pending;
  }
  function sampleFor(state,midi) {
    return state.data.reduce((best,s)=>Math.abs(s.midi-midi)<Math.abs(best.midi-midi)?s:best,state.data[0]);
  }
  function trimBuffers() {
    while(bufferBytes>MAX_BUFFER_BYTES||decoded.size>MAX_BUFFERS) {
      const item=[...decoded].find(([,v])=>v.buffer);if(!item)break;
      bufferBytes-=item[1].bytes;decoded.delete(item[0]);
    }
  }
  async function bufferFor(ctx,id,state,midi) {
    const sample=sampleFor(state,midi), key=rowFor(id).bank+':'+sample.midi;let entry=decoded.get(key);
    if(entry){touch(decoded,key,entry);return {buffer:await entry.pending,midi:sample.midi,key};}
    entry={buffer:null,bytes:0,pending:null};decoded.set(key,entry);
    entry.pending=(async()=>{
      const bytes=sample.asset?await verifiedAsset(sample.asset):dataBytes(sample.data);
      let buffer;
      try{buffer=await ctx.decodeAudioData(bytes.slice(0));}catch(error){throw new Error('Audio codec/decode failed for '+rowFor(id).name+': '+error.message);}
      const size=buffer.length*buffer.numberOfChannels*4;
      if(!Number.isFinite(size)||size<=0||size>MAX_BUFFER_BYTES)throw new Error('Decoded sample exceeds memory limit');
      entry.buffer=buffer;entry.bytes=size;bufferBytes+=size;trimBuffers();return buffer;
    })().catch(error=>{if(decoded.get(key)===entry)decoded.delete(key);report(id,'error',error.message);throw error;});
    return {buffer:await entry.pending,midi:sample.midi,key};
  }
  function prepare(ctx,id,midis){
    if(!available(id))return Promise.reject(unavailableError(id));
    const notes=[...new Set(Array.isArray(midis)&&midis.length?midis:[60])].sort((a,b)=>a-b),key=id+'/'+notes.join(',');
    if(batches.has(key))return batches.get(key);
    const work=prepareBatch(ctx,id,notes).finally(()=>{if(batches.get(key)===work)batches.delete(key);});
    batches.set(key,work);return work;
  }
  async function prepareBatch(ctx,id,midis) {
    if(failed.has(id))throw Error(failed.get(id));
    if(!warm(id,midis||[60]))report(id,'loading','正在準備 '+rowFor(id).name);
    try {
      if(!ctx||typeof ctx.decodeAudioData!=='function')throw new Error('An AudioContext is required to prepare samples');
      const state=await loadBank(id), notes=Array.isArray(midis)&&midis.length?midis:[60];
      // Warm only needed notes, not all 95 banks or every decoded note in a bank.
      for(const midi of new Set(notes.map(n=>clamp(Math.round(finite(n,60)),0,127))))await bufferFor(ctx,id,state,midi);
      // Do not recurse if a huge decoded working set cannot fit the bounded cache.
      // Mark an explicit fallback instead of entering a prepare/restart loop.
      if(failed.has(id)){report(id,'fallback',failed.get(id));return rowFor(id);}
      if(!warm(id,notes))throw Error('目前鍵域超過取樣快取，請縮小鍵域後重試');
      report(id,'ready','Ready: '+rowFor(id).name);
      return rowFor(id);
    } catch(error){failed.set(id,String(error.message));report(id,'error',String(error.message));throw error;}
  }
  function warm(id,notes){if(!available(id)||failed.has(id))return false;
    const bank=banks.get(rowFor(id).bank);return !!bank?.data && notes.every(n=>decoded.get(rowFor(id).bank+':'+sampleFor(bank,n).midi)?.buffer);}
  function retry(id){if(!available(id))return unavailableError(id);failed.delete(id);report(id,'idle','');}
  function fallbackVoice(ctx,dst,n,t,v,id){
    const error=Error('Sample playback unavailable: '+(failed.get(id)||id));
    report(id,'error',error.message);
    return {release(){},releaseAt(){},cancelPending(){},error};
  }
  // Normal piano key-up is a damped release, not a sustain latch.
  // Explicit short fades remain emergency/cancel operations.
  const PIANO_RELEASE_SECONDS = .35;
  function startSample(ctx,destination,sample,midi,time,velocity,endTime,presetId) {
    const source=ctx.createBufferSource(), gain=ctx.createGain();
    const when=Math.max(ctx.currentTime,finite(time,ctx.currentTime)), peak=.25*clamp(finite(velocity,.8),0,1)*volumeGain(presetId,midi);
    source.buffer=sample.buffer;source.playbackRate.setValueAtTime(Math.pow(2,(midi-sample.midi)/12),when);
    gain.gain.setValueAtTime(.00001,when);gain.gain.linearRampToValueAtTime(Math.max(.00001,peak),when+.004);
    source.connect(gain);gain.connect(destination);
    let stopAt=Infinity,ended=false,releasePlan=null;
    const targetPeak=Math.max(.00001,peak);
    function envelopeAt(at){
      if(releasePlan&&at>=releasePlan.at){
        const f=Math.max(0,Math.min(1,(at-releasePlan.at)/releasePlan.span));
        return Math.max(.00001,releasePlan.linear
          ? releasePlan.level*(1-f)+.00001*f
          : releasePlan.level*Math.pow(.00001/releasePlan.level,f));
      }
      const f=Math.max(0,Math.min(1,(at-when)/.004));
      return .00001+(targetPeak-.00001)*f;
    }
    function releaseAt(at,fade) {
      if(ended)return;
      const requested=finite(at,ctx.currentTime);
      // A scheduled source must be stopped BEFORE its start, not faded after onset.
      if(ctx.currentTime<when && requested<=when) {
        const stop=Math.max(ctx.currentTime,requested);if(stop>=stopAt)return;stopAt=stop;
        gain.gain.cancelScheduledValues(ctx.currentTime);gain.gain.setValueAtTime(.00001,ctx.currentTime);
        try{source.stop(stop);}catch(_){}return;
      }
      const naturalPiano=!Number.isFinite(fade)&&rowFor(presetId).category==='Piano';
      const now=Math.max(when,ctx.currentTime,requested),span=clamp(finite(fade,naturalPiano?PIANO_RELEASE_SECONDS:.12),.008,1.5);
      if(now+span+.01>=stopAt)return;stopAt=now+span+.01;
      const level=envelopeAt(now),continuingRelease=releasePlan&&now>releasePlan.at&&now<releasePlan.at+releasePlan.span;
      gain.gain.cancelScheduledValues(now);
      if(continuingRelease){
        if(releasePlan.linear)gain.gain.linearRampToValueAtTime(level,now);
        else gain.gain.exponentialRampToValueAtTime(level,now);
      }
      else if(now<when+.004)gain.gain.linearRampToValueAtTime(level,now);
      else gain.gain.setValueAtTime(level,now);
      if(naturalPiano)gain.gain.linearRampToValueAtTime(.00001,now+span);
      else gain.gain.exponentialRampToValueAtTime(.00001,now+span);
      releasePlan={at:now,level,span,linear:naturalPiano};
      try{source.stop(now+span+.01);}catch(_){}
    }
    const result={release(fade){releaseAt(ctx.currentTime,fade);},releaseAt,ended:null};
    source.onended=()=>{if(ended)return;ended=true;source.disconnect();gain.disconnect();if(result.ended)result.ended();};
    source.start(when);source.stop(when+45);
    if(endTime!=null)releaseAt(endTime);
    return result;
  }
  function voice(ctx,destination,midi,time,velocity,id) {
    if(!available(id)){const error=unavailableError(id);return {release(){},releaseAt(){},cancelPending(){},error};}
    if(failed.has(id))return fallbackVoice(ctx,destination,midi,time,velocity,id);
    let real=null,cancelled=false,end=null,fade,requestError=null;
    const when=finite(time,ctx.currentTime), note=clamp(Math.round(finite(midi,60)),0,127);
    const handle={
      release(span){cancelled=true;fade=span;handles.delete(handle);if(real)real.release(span);else liveHandles.delete(handle);},
      releaseAt(at,span){const next=finite(at,ctx.currentTime);if(end===null||next<end){end=next;fade=span;}if(end<=Math.max(ctx.currentTime,when)){cancelled=true;handles.delete(handle);}if(real)real.releaseAt(end,fade);},
      cancelPending(){if(!real){cancelled=true;handles.delete(handle);liveHandles.delete(handle);}},
      get error(){return requestError;}
    };
    handles.add(handle);liveHandles.add(handle);
    // Keep released sources reachable until ended; an all-off must also cancel their tails.
    while(liveHandles.size>MAX_LIVE_VOICES){const oldest=liveHandles.values().next().value;liveHandles.delete(oldest);oldest.release(.015);}
    while(handles.size>MAX_LIVE_VOICES)handles.values().next().value.release(.015);
    const cachedState=banks.get(rowFor(id).bank);
    const cachedSample=cachedState?.data&&sampleFor(cachedState,note);
    const cached=cachedSample&&decoded.get(rowFor(id).bank+':'+cachedSample.midi)?.buffer;
    if(cached){real=startSample(ctx,destination,{buffer:cached,midi:cachedSample.midi},note,when,velocity,end,id);real.ended=()=>{handles.delete(handle);liveHandles.delete(handle);};return handle;}
    report(id,'loading','載入中');
    (async()=>{
      const state=await loadBank(id), sample=await bufferFor(ctx,id,state,note);
      if(cancelled || (end!==null&&end<=Math.max(ctx.currentTime,when))){handles.delete(handle);liveHandles.delete(handle);return;}
      real=startSample(ctx,destination,sample,note,when,velocity,end,id);real.ended=()=>{handles.delete(handle);liveHandles.delete(handle);};
      if(end!==null&&fade!==undefined)real.releaseAt(end,fade);
      // Only prepareBatch may mark READY; one decoded note is insufficient.
    })().catch(error=>{requestError=error;failed.set(id,error.message);report(id,'error',error.message);
      if(!cancelled&&(end===null||end>ctx.currentTime)){real=fallbackVoice(ctx,destination,note,Math.max(ctx.currentTime,when),velocity,id);if(end!==null)real.releaseAt(end,fade);}
      handles.delete(handle);liveHandles.delete(handle);});
    return handle;
  }
  function loadEncoder() {
    if(global.lamejs&&global.lamejs.Mp3Encoder)return Promise.resolve(global.lamejs.Mp3Encoder);
    if(!loadEncoder.pending)loadEncoder.pending=new Promise((resolve,reject)=>{
      const el=document.createElement('script');el.src=new URL('vendor/lame.min.js',scriptURL).href;
      el.onload=()=>global.lamejs&&global.lamejs.Mp3Encoder?resolve(global.lamejs.Mp3Encoder):reject(new Error('MP3 encoder did not initialize'));
      el.onerror=()=>{el.remove();reject(new Error('Bundled MP3 encoder could not load'));};document.head.appendChild(el);
    }).catch(error=>{loadEncoder.pending=null;throw error;});return loadEncoder.pending;
  }
  async function exportMp3(tracks,{volume=.85,onProgress}={}) {
    const parts=(Array.isArray(tracks)?tracks:[]).slice(0,4).flatMap(track=>{
      if(!track||track.muted||track.mute)return[];
      const gain=clamp(finite(track.gain,1),0,1.5),notes=track.events||track.notes;if(!gain||!Array.isArray(notes))return[];
      if(notes.length>4096)throw new Error('MP3 export supports up to 4,096 notes per track.');
      return notes.filter(e=>e&&Number.isFinite(e.midi)&&e.midi>=0&&e.midi<=127&&Number.isFinite(e.start)&&Number.isFinite(e.duration)&&e.start>=0&&e.duration>0).map(e=>({...e,presetId:e.presetId||'yamaha-c5-accurate-z',gain}));
    });
    if(!parts.length)throw new Error('No audible notes to export. Record a track or unmute one first.');
    if(parts.length>6000)throw new Error('MP3 export supports up to 6,000 audible notes per mix.');
    const duration=Math.max(...parts.map(e=>e.start+e.duration))/1000;if(duration>180)throw new Error('MP3 export supports recordings up to 3 minutes.');
    parts.forEach(e=>rowFor(e.presetId));
    const Offline=global.OfflineAudioContext||global.webkitOfflineAudioContext;if(!Offline)throw new Error('This browser does not support offline audio rendering.');
    const sampleRate=44100,offline=new Offline(2,Math.ceil((duration+1.62)*sampleRate),sampleRate),master=offline.createGain(),compressor=offline.createDynamicsCompressor();
    master.gain.value=clamp(finite(volume,.85),0,1);compressor.threshold.value=-12;compressor.knee.value=15;compressor.ratio.value=4;compressor.attack.value=.004;compressor.release.value=.16;master.connect(compressor).connect(offline.destination);
    if(onProgress)onProgress(0);
    const resources=new Map(),uniqueBuffers=new Set();let retainedBytes=0;
    for(const e of parts) {
      const midi=clamp(Math.round(e.midi),0,127),key=e.presetId+':'+midi;if(resources.has(key))continue;
      const state=await loadBank(e.presetId),sample=await bufferFor(offline,e.presetId,state,midi);
      if(banks.get(e.presetId)===state)report(e.presetId,'ready','Ready: '+rowFor(e.presetId).name);
      if(!uniqueBuffers.has(sample.buffer)){uniqueBuffers.add(sample.buffer);retainedBytes+=sample.buffer.length*sample.buffer.numberOfChannels*4;}
      if(retainedBytes>96*1024*1024)throw new Error('MP3 sample mix exceeds the 96 MiB decoded-sample limit; export fewer instruments/notes.');
      resources.set(key,sample);
    }
    const buses=new Map();parts.forEach(e=>{
      if(!buses.has(e.gain)){const bus=offline.createGain();bus.gain.value=e.gain;bus.connect(master);buses.set(e.gain,bus);}
      const midi=clamp(Math.round(e.midi),0,127),when=e.start/1000+.008;
      startSample(offline,buses.get(e.gain),resources.get(e.presetId+':'+midi),midi,when,finite(e.velocity,.8),when+Math.max(.012,e.duration/1000),e.presetId);
    });
    const [audio,Encoder]=await Promise.all([offline.startRendering(),loadEncoder()]);
    const encoder=new Encoder(2,sampleRate,128),chunks=[],left=audio.getChannelData(0),right=audio.getChannelData(1);
    const pcm=v=>{const n=clamp(v,-1,1);return n<0?n*32768:n*32767;};
    for(let i=0;i<left.length;i+=1152){const len=Math.min(1152,left.length-i),l=new Int16Array(len),r=new Int16Array(len);for(let j=0;j<len;j++){l[j]=pcm(left[i+j]);r[j]=pcm(right[i+j]);}const block=encoder.encodeBuffer(l,r);if(block.length)chunks.push(block);if(i%(1152*24)===0){if(onProgress)onProgress(.32+.66*i/left.length);await new Promise(resolve=>setTimeout(resolve,0));}}
    const tail=encoder.flush();if(tail.length)chunks.push(tail);const head=chunks[0];if(!head||(head[0]&255)!==255||(head[1]&224)!==224)throw new Error('MP3 encoder did not return an MPEG audio stream.');
    if(onProgress)onProgress(1);return new Blob(chunks,{type:'audio/mpeg'});
  }
  function cancelAll(fade=.025){for(const handle of [...liveHandles])handle.release(clamp(finite(fade,.025),.008,1.5));}
  function cacheStats(){return Object.freeze({banks:banks.size,decodedEntries:decoded.size,decodedBytes:bufferBytes,liveVoices:handles.size,liveSources:liveHandles.size,maxBanks:MAX_BANKS,maxDecodedBytes:MAX_BUFFER_BYTES,maxLiveVoices:MAX_LIVE_VOICES});}
  global.NocturneOriginalAB=Object.freeze({localOnly:false,revision:REF,catalog,
    selectionFor(id,midi){const row=rowFor(id),state=banks.get(row.bank);const roots=state?.data||row.assets.filter(a=>Number.isInteger(a.midi)).map(asset=>({midi:asset.midi,asset}));
      const sample=roots.length?sampleFor({data:roots},midi):{midi:clamp(Math.round(midi),21,108)};
      return Object.freeze({id,midi,root:sample.midi,rate:Math.pow(2,(midi-sample.midi)/12),file:sample.asset?.file||row.assets[0].file});}
  });
  global.NocturneLocalSounds=global.NocturneOriginalAB;
  global.NocturneAudio=Object.freeze({...original,presets,categories:Object.freeze(catalog.categories.slice()),prepare,warm,retry,voice,exportMp3,onStatus,getStatus,cacheStats,cancelAll,getVolumeAlignment,setVolumeAlignment,alignmentInfo,sampled:true});
})(window);
