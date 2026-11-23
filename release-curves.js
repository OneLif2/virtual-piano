(function (global) {
  'use strict';
  const $ = id => document.getElementById(id);
  const SVG = 'http://www.w3.org/2000/svg';
  const profileStore=global.NocturnePianoRelease;
  if(!profileStore)throw new Error('Shared piano release profiles are required');
  const DURATIONS=profileStore.durations,FAMILIES=profileStore.families;
  const NOTES = Object.freeze([{key:'I',code:'KeyI',midi:60,note:'C4'},{key:'O',code:'KeyO',midi:62,note:'D4'},{key:'P',code:'KeyP',midi:64,note:'E4'}].map(Object.freeze));
  const BY_FAMILY = new Map(FAMILIES.map(f=>[f.id,f]));
  const ATTACK = .004, VELOCITY = .8, MAX_PREVIEW_VOICES = 6;
  const hashes = Object.freeze({
    catalog:'9dcb945da32168ff3b11d69ca4ea1ad01ba70bdb4d04fdc420553f54ffecc7fe',
    calibration:'755ee6dc514b5d9fcb6975073b17f1324b1362bd5210c803bc740d82f756760c',
    engine:'f9638650499db94bec712a78bc39fd65aa1058027bdce63d90d3e7f34e864670'
  });
  const cards = new Map(), active = new Set(), inputs = new Map(), keyboardOwners = new Map(), history = [];
  let selected = profileStore.getProfile();
  let phase='loading',generation=0,ready=false,pageActive=true,engine=null,context=null,master=null,manualGain=null,animation=0,lastAudition=null,formalProfile=null;

  function family(id){const f=BY_FAMILY.get(id);if(!f)throw new RangeError('Unknown release curve');return f;}
  const curveValue=profileStore.curveValue,curveSamples=profileStore.curveSamples;
  const sampledCurves = new Map(FAMILIES.map(f=>[f.id,curveSamples(f.id)]));
  function keyFor(familyId,durationMs){return familyId+'/'+durationMs;}
  function labelFor(value=selected){return family(value.familyId).label+' · '+value.durationMs+'ms';}
  function element(tag,className,text){const n=document.createElement(tag);if(className)n.className=className;if(text!==undefined)n.textContent=text;return n;}
  function svgElement(tag,attributes={}){const n=document.createElementNS(SVG,tag);for(const [key,value]of Object.entries(attributes))n.setAttribute(key,String(value));return n;}
  function setStatus(state,text){phase=state;$('labStatus').textContent=text;$('labStatus').parentElement.dataset.state=state;}
  function setSelected(familyId,durationMs){
    family(familyId);if(!DURATIONS.includes(durationMs))throw new RangeError('Unknown release duration');
    if(selected.familyId!==familyId||selected.durationMs!==durationMs)stop(false);
    selected=Object.freeze({familyId,durationMs});
    for(const entry of cards.values()){
      const isSelected=entry.familyId===familyId&&entry.durationMs===durationMs;
      entry.card.dataset.selected=String(isSelected);entry.pick.setAttribute('aria-pressed',String(isSelected));
    }
    $('selectedCurve').textContent=labelFor();
    if(ready)refreshStatus('已選擇 '+labelFor()+'；按住／放開 I / O / P 試聽。');
    return selected;
  }
  function plot(f,durationMs){
    const total=durationMs/1000,x=time=>28+124*time/total,y=value=>78-64*value;
    const svg=svgElement('svg',{viewBox:'0 0 160 104',role:'img','aria-label':f.label+'，放鍵當下為 0 毫秒，再於 '+durationMs+' 毫秒由 100% 增益收至 0%'});
    const title=svgElement('title');title.textContent=f.label+' / '+durationMs+'ms；圖形為正規化增益，不是錄音響度。';svg.append(title);
    svg.append(svgElement('path',{d:'M28 12V78H154',class:'axis'}));
    for(const [text,yy]of [['1',20],['0',82]]){const label=svgElement('text',{x:8,y:yy,class:'axis-label'});label.textContent=text;svg.append(label);}
    svg.append(svgElement('line',{x1:28,x2:28,y1:10,y2:82,class:'release-marker'}));
    let d='M28 14';
    if(f.steps){
      for(let step=1;step<=f.steps;step++)d+='H'+x(step/f.steps*total).toFixed(4)+'V'+y(1-step/f.steps).toFixed(4);
    }else sampledCurves.get(f.id).forEach((value,i,values)=>{d+='L'+x(i/(values.length-1)*total).toFixed(4)+' '+y(value).toFixed(4);});
    svg.append(svgElement('path',{d,class:'curve-path'}));
    return {svg,total};
  }
  function renderMatrix(){
    const head=document.createElement('thead'),headRow=document.createElement('tr');
    const corner=element('th','', '曲線家族 / 時間');corner.scope='col';headRow.append(corner);
    for(const duration of DURATIONS){const th=element('th','',duration+'ms');th.scope='col';headRow.append(th);}
    head.append(headRow);
    const body=document.createElement('tbody');
    for(const f of FAMILIES){
      const row=document.createElement('tr'),th=element('th');th.scope='row';th.append(element('b','',f.label),element('span','',f.description));row.append(th);
      for(const durationMs of DURATIONS){
        const td=document.createElement('td'),card=element('div','curve-card');
        card.dataset.familyId=f.id;card.dataset.durationMs=String(durationMs);card.dataset.playing='false';card.dataset.held='false';card.dataset.tailing='false';card.dataset.formalCurrent='false';
        const formalBadge=element('span','formal-current-badge','正式琴鍵目前使用');formalBadge.hidden=true;
        const apply=element('button','apply-curve','套用');apply.type='button';apply.disabled=true;apply.setAttribute('aria-label','套用 '+f.label+'，'+durationMs+' 毫秒到正式琴鍵');
        apply.addEventListener('click',()=>applySelection(f.id,durationMs));
        const pick=element('button','curve-select');pick.type='button';pick.setAttribute('aria-label','選擇 '+f.label+'，'+durationMs+' 毫秒');
        const visual=plot(f,durationMs);pick.append(visual.svg);
        const time=element('div','plot-time');time.append(element('span','','放鍵 0'),element('span','',durationMs+'ms'));pick.append(time);
        pick.addEventListener('click',()=>setSelected(f.id,durationMs));
        const keys=element('div','card-keys');
        const stateLabel=element('div','card-state','');stateLabel.setAttribute('aria-hidden','true');
        const entry={familyId:f.id,durationMs,card,pick,apply,svg:visual.svg,total:visual.total,formalBadge,stateLabel,buttons:new Map()};
        for(const n of NOTES){
          const b=element('button','audition-key',n.key);b.append(element('small','',n.note));b.type='button';b.disabled=true;
          b.dataset.midi=String(n.midi);b.dataset.key=n.key;b.setAttribute('aria-label','試聽 '+f.label+' '+durationMs+' 毫秒，'+n.key+' '+n.note);
          const pointerInputs=new Map();
          b.addEventListener('pointerdown',event=>{
            if(event.button!==0||b.disabled)return;event.preventDefault();b.focus({preventScroll:true});
            setSelected(f.id,durationMs);const owner='pointer:'+event.pointerId;
            try{b.setPointerCapture(event.pointerId);}catch(_){}press(n.midi,owner);pointerInputs.set(event.pointerId,inputs.get(owner));
          });
          b.addEventListener('pointerup',event=>{event.preventDefault();const owner='pointer:'+event.pointerId,item=pointerInputs.get(event.pointerId);if(item&&inputs.get(owner)===item)releaseOwner(owner);pointerInputs.delete(event.pointerId);try{b.releasePointerCapture(event.pointerId);}catch(_){}});
          for(const type of ['pointercancel','lostpointercapture'])b.addEventListener(type,event=>{const owner='pointer:'+event.pointerId,item=pointerInputs.get(event.pointerId);pointerInputs.delete(event.pointerId);if(item&&inputs.get(owner)===item)cancelItem(item,'pointer-cancel');});
          keys.append(b);entry.buttons.set(n.midi,b);
        }
        card.append(apply,formalBadge,pick,stateLabel,keys);td.append(card);row.append(td);cards.set(keyFor(f.id,durationMs),entry);
      }
      body.append(row);
    }
    $('curveMatrix').append(head,body);setSelected(selected.familyId,selected.durationMs);
  }
  function refreshCards(){
    for(const entry of cards.values()){
      const entries=[...active].filter(item=>!item.cleaned&&item.entry===entry);
      const held=entries.filter(item=>inputs.get(item.ownerId)===item),tailing=entries.filter(item=>item.state==='tailing');
      entry.card.dataset.held=String(held.length>0);entry.card.dataset.tailing=String(tailing.length>0);entry.card.dataset.playing=String(held.length+tailing.length>0);
      entry.stateLabel.textContent=tailing.length?'正在收尾'+(held.length?' · 另有按住音':''):held.length?'按住中，尚未收尾':'';
      for(const [midi,button]of entry.buttons){const down=held.some(item=>item.midi===midi);button.classList.toggle('is-playing',down);button.setAttribute('aria-pressed',String(down));}
    }
  }
  function refreshStatus(idleText='試聽就緒；按住／放開 I / O / P 比較尾音。'){
    if(!ready)return;
    const held=[...inputs.values()].filter(item=>item.state==='held'),pending=[...inputs.values()].filter(item=>item.state==='preparing'),tailing=[...active].filter(item=>item.state==='tailing');
    if(held.length)setStatus('held','按住中，尚未收尾 · '+held.map(item=>NOTES.find(n=>n.midi===item.midi).key).join(' + ')+(tailing.length?' · 另有 '+tailing.length+' 個尾音收音中':''));
    else if(pending.length)setStatus('preparing','取樣載入中，請保持按住；放開會取消，不會延遲發聲。');
    else if(tailing.length)setStatus('tailing','正在收尾 · '+labelFor(tailing[tailing.length-1].choice)+' · '+tailing.length+' 個尾音；金色格為實際收尾曲線。');
    else setStatus('ready',idleText);
  }
  function refreshFormalProfile(){
    if($('labPreset').selectedOptions[0]?.disabled)$('labPreset').value='yamaha-c5-accurate-z';
    formalProfile=engine?.getReleaseProfile?.($('labPreset').value)||null;
    const snapshot=profileStore.getSnapshot(),memoryOnly=!snapshot.persisted&&(snapshot.source==='apply'||snapshot.source==='storage'&&snapshot.errorCode==='STORAGE_UNAVAILABLE');
    for(const entry of cards.values()){
      const current=!!formalProfile&&entry.familyId===formalProfile.familyId&&entry.durationMs===formalProfile.durationMs;
      entry.card.dataset.formalCurrent=String(current);entry.formalBadge.hidden=!current;entry.formalBadge.textContent=memoryOnly?'本頁設定 · 同步未確認':'正式琴鍵目前使用';
      entry.apply.textContent=current?(memoryOnly?'已套用本頁':'已套用'):'套用';entry.apply.setAttribute('aria-pressed',String(current));
    }
    $('formalCurrentCurve').textContent=formalProfile?(memoryOnly?'本頁設定：':'正式琴鍵目前使用：')+labelFor(formalProfile):'目前音色沒有鋼琴收音曲線設定';
    $('applyStatus').dataset.state=memoryOnly||snapshot.errorCode?'warning':'ready';
    $('applyStatus').textContent=memoryOnly?'本頁保留目前設定，但未能確認儲存及跨分頁同步；請勿假設其他鋼琴分頁已更新。':snapshot.errorCode==='INVALID_SAVED_PROFILE'?'儲存的設定無效，暫用 Power · 0.5 / 350ms；按「套用」才會覆寫，未自動遷移舊值。':snapshot.errorCode?'無法讀取本機儲存，暫用預設設定；如需套用，會再嘗試儲存。':snapshot.persisted?'已讀取已儲存設定；套用後會同步相同來源的鋼琴分頁並暫停演奏。':'目前使用預設 Power · 0.5 / 350ms；按「套用」才會儲存設定。';
  }
  function applySelection(familyId,durationMs){
    if(!ready)return null;
    try{setSelected(familyId,durationMs);const result=engine.setReleaseProfile({familyId,durationMs});refreshFormalProfile();refreshStatus('已套用 '+labelFor(result.profile)+'；演奏已停止，按住琴鍵才會再發聲。');return result;}
    catch(_){$('applyStatus').dataset.state='warning';$('applyStatus').textContent='未能套用這個設定；正式琴鍵保留原有設定。';return null;}
  }
  function cleanup(item,disconnectDelay=0,refresh=true){
    if(item.cleaned)return;item.cleaned=true;clearTimeout(item.endTimer);
    if(inputs.get(item.ownerId)===item)inputs.delete(item.ownerId);
    active.delete(item);item.playhead?.remove();
    const disconnect=()=>{try{item.curveGain?.disconnect();}catch(_){}};
    if(disconnectDelay)setTimeout(disconnect,disconnectDelay);else disconnect();
    if(refresh){refreshCards();refreshStatus();}
  }
  function cancelItem(item,reason='cancel',refresh=true){
    if(item.cleaned)return;
    item.cancelled=true;item.record.cancelReason=reason;
    if(item.record.inputHeldSeconds===null)item.record.inputHeldSeconds=Math.max(0,(performance.now()-item.downAt)/1000);
    if(item.on!==null&&item.record.heldSeconds===null)item.record.heldSeconds=Math.max(0,(context?.currentTime||item.on)-item.on);
    const now=context?.currentTime||0;
    if(item.curveGain){
      try{
        const gain=item.curveGain.gain;
        if(typeof gain.cancelAndHoldAtTime==='function')gain.cancelAndHoldAtTime(now);
        else {gain.cancelScheduledValues(0);gain.setValueAtTime(item.release===null?1:curveValue(item.choice.familyId,(now-item.release)/(item.choice.durationMs/1000)),now);}
        gain.linearRampToValueAtTime(0,now+.008);
      }catch(_){}
    }
    try{item.voice?.release(.008);}catch(_){}
    cleanup(item,item.voice?25:0,refresh);
  }
  function stop(announce=true){
    generation++;cancelAnimationFrame(animation);animation=0;
    for(const item of [...active])cancelItem(item,'stop',false);
    inputs.clear();keyboardOwners.clear();engine?.cancelAll?.(.008);refreshCards();
    if(announce)setStatus(ready?'stopped':'loading',ready?'已停止全部試聽；按住／放開 I / O / P 再試。':'已取消播放要求；正在核對音色資料。');
    else if(ready)phase='stopped';
  }
  function checkMidi(midi){if(!NOTES.some(n=>n.midi===midi))throw new RangeError('Preview notes are MIDI60,62,64 only');}
  function ownerFor(midi,ownerId){const owner=ownerId===undefined?'api:'+midi:ownerId;if(typeof owner!=='string'||!owner||owner.length>160)throw new TypeError('Input owner must be a nonempty short string');return owner;}
  function recordSnapshot(item){return Object.freeze({...item.record,state:item.state,heldSeconds:item.state==='held'&&item.on!==null?Math.max(0,(context?.currentTime||item.on)-item.on):item.record.heldSeconds,inputHeldSeconds:inputs.get(item.ownerId)===item?Math.max(0,(performance.now()-item.downAt)/1000):item.record.inputHeldSeconds});}
  function setVolume(){
    const volume=Number($('labVolume').value);$('labVolumeValue').value=volume+'%';$('labVolume').setAttribute('aria-valuetext',volume+'%');
    if(master)master.gain.setTargetAtTime((volume/100)**1.5,context.currentTime,.02);
  }
  async function ensureAudio(){
    if(!context){
      const Audio=global.AudioContext||global.webkitAudioContext;if(!Audio)throw new Error('Web Audio unavailable');
      context=new Audio({latencyHint:'interactive'});master=context.createGain();master.gain.value=(Number($('labVolume').value)/100)**1.5;
      const common=context.createGain();common.gain.value=10**(5/20);manualGain=context.createGain();manualGain.gain.value=10**(5/20);manualGain.connect(common).connect(master);
      const compressor=context.createDynamicsCompressor();compressor.threshold.value=-15;compressor.ratio.value=6;
      const guard=context.createWaveShaper();guard.curve=Float32Array.from({length:4097},(_,i)=>{const value=i/2048-1,a=Math.abs(value);return a<=.8?value:Math.sign(value)*(.8-.15*Math.expm1(-(a-.8)/.15));});
      master.connect(compressor).connect(guard).connect(context.destination);
    }
    if(context.state!=='running')await context.resume();
    if(context.state!=='running')throw new Error('Audio context is not running');
    return context;
  }
  function animate(){
    let tailing=false;
    for(const item of active)if(item.state==='tailing'){
      tailing=true;const fraction=Math.max(0,Math.min(1,(context.currentTime-item.release)/(item.choice.durationMs/1000))),x=28+124*fraction;
      item.playhead?.setAttribute('x1',String(x));item.playhead?.setAttribute('x2',String(x));
    }
    animation=tailing?requestAnimationFrame(animate):0;
  }
  async function press(midi,ownerId){
    checkMidi(midi);const owner=ownerFor(midi,ownerId);
    if(inputs.has(owner))return false;
    if(!ready){setStatus('loading','音色資料尚未準備好；請稍後再按一次。');return false;}
    if($('labPreset').selectedOptions[0]?.disabled){setStatus('error','此音色未於公開版提供。');return false;}
    while(active.size>=MAX_PREVIEW_VOICES){const oldest=[...active].find(item=>item.state==='tailing')||active.values().next().value;cancelItem(oldest,'voice-cap',false);}
    const choice=selected,preset=$('labPreset').value,token=generation,entry=cards.get(keyFor(choice.familyId,choice.durationMs));
    const record={ownerId:owner,midi,preset,familyId:choice.familyId,durationMs:choice.durationMs,velocity:VELOCITY,on:null,release:null,end:null,heldSeconds:null,inputHeldSeconds:null,attackSeconds:ATTACK,curveSampleCount:129,automation:family(choice.familyId).steps?'setValueAtTime/8steps':'setValueCurveAtTime',volume:Number($('labVolume').value),commonBoostDb:5,manualBoostDb:5,cancelledBeforeReady:false};
    const item={ownerId:owner,midi,preset,choice,entry,token,downAt:performance.now(),state:'preparing',on:null,release:null,end:null,voice:null,curveGain:null,playhead:null,cleaned:false,cancelled:false,endTimer:0,record};
    inputs.set(owner,item);active.add(item);lastAudition=record;history.push(record);while(history.length>20)history.shift();refreshCards();refreshStatus();
    try{
      const audio=await ensureAudio();
      if(item.cleaned||item.cancelled||inputs.get(owner)!==item||token!==generation||!pageActive)return false;
      await engine.prepare(audio,preset,NOTES.map(n=>n.midi));
      if(item.cleaned||item.cancelled||inputs.get(owner)!==item||token!==generation||!pageActive||audio.state!=='running')return false;
      if(!engine.warm(preset,NOTES.map(n=>n.midi)))throw new Error('Samples not ready');
      const on=audio.currentTime,curveGain=audio.createGain();curveGain.gain.setValueAtTime(1,on);curveGain.connect(manualGain);
      const voice=engine.voice(audio,curveGain,midi,on,VELOCITY,preset);
      if(voice.error){curveGain.disconnect();throw voice.error;}
      item.on=on;item.voice=voice;item.curveGain=curveGain;item.state='held';record.on=on;
      // No release automation is scheduled while this input remains held.
      // The unchanged sampler may naturally decay/end; no loop is invented.
      refreshCards();refreshStatus();return true;
    }catch(error){
      if(!item.cleaned){cancelItem(item,'sample-error');if(token===generation)setStatus('error','未能載入或播放取樣，這個按音已保持靜音。請檢查本機頁面後再試。');}
      return false;
    }
  }
  function releaseOwner(owner){
    const item=inputs.get(owner);if(!item)return false;
    // The input owner is released immediately, independently of other notes.
    // Old tail cleanup cannot remove a newer press reusing the same owner.
    if(inputs.get(owner)===item)inputs.delete(owner);
    item.record.inputHeldSeconds=Math.max(0,(performance.now()-item.downAt)/1000);
    if(!item.voice){
      item.record.cancelledBeforeReady=true;cancelItem(item,'released-before-ready');
      refreshStatus('已放鍵；取樣未就緒的按音已取消，不會延遲發聲。');return true;
    }
    const release=context.currentTime,duration=item.choice.durationMs/1000,end=release+duration,f=family(item.choice.familyId);
    const gain=item.curveGain.gain;gain.setValueAtTime(1,release);
    if(f.steps){for(let step=1;step<=f.steps;step++)gain.setValueAtTime(1-step/f.steps,release+step/f.steps*duration);}
    else gain.setValueCurveAtTime(Float32Array.from(sampledCurves.get(f.id)),release,duration);
    item.voice.releaseAt(end,.008);item.release=release;item.end=end;item.state='tailing';
    item.record.release=release;item.record.end=end;item.record.heldSeconds=Math.max(0,release-item.on);
    item.playhead=svgElement('line',{x1:28,x2:28,y1:9,y2:82,class:'playhead','data-midi':item.midi,'data-owner':owner});item.entry.svg.append(item.playhead);
    item.endTimer=setTimeout(()=>cleanup(item,25),Math.max(0,(end-context.currentTime)*1000));
    refreshCards();refreshStatus();if(!animation)animation=requestAnimationFrame(animate);return true;
  }
  function release(midi,ownerId){checkMidi(midi);return releaseOwner(ownerFor(midi,ownerId));}
  // Compatibility alias: down only, never a timed press-and-release.
  const audition=press;
  async function verifiedJson(file,expected){
    const url=new URL(file,location.href);if(url.origin!==location.origin)throw new Error('Same-origin data required');
    const response=await fetch(url,{credentials:'omit',redirect:'error'});if(!response.ok)throw new Error('Data HTTP '+response.status);
    const bytes=await response.arrayBuffer();if(bytes.byteLength>2*1024*1024)throw new Error('Data too large');
    const actual=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
    if(actual!==expected)throw new Error('Data integrity mismatch');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  }
  function loadEngine(){return new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('yamaha-audio.js?v='+hashes.engine,location.href).href;
    script.integrity='sha256-'+btoa(hashes.engine.match(/../g).map(v=>String.fromCharCode(parseInt(v,16))).join(''));script.crossOrigin='anonymous';
    script.onload=resolve;script.onerror=()=>reject(new Error('Sample engine failed integrity/load'));document.head.append(script);
  });}
  async function boot(){
    try{
      const [catalog,calibration]=await Promise.all([verifiedJson('local-sounds-catalog.json?v='+hashes.catalog,hashes.catalog),verifiedJson('volume-calibration.json?v='+hashes.calibration,hashes.calibration)]);
      if(catalog.presets.length!==109||calibration.sourceCatalogSha256!==hashes.catalog)throw new Error('Unexpected catalogue');
      $('sampleBankCatalog').textContent=JSON.stringify(catalog);$('volumeCalibration').textContent=JSON.stringify(calibration);
      const pianos=catalog.presets.filter(p=>p.category==='Piano');if(pianos.length!==21)throw new Error('Unexpected piano count');
      $('labPreset').replaceChildren(...pianos.map(p=>{const option=new Option(p.name,p.id);option.disabled=p.available===false;return option;}));
      const requested=new URLSearchParams(location.search).get('preset');$('labPreset').value=pianos.some(p=>p.id===requested&&p.available!==false)?requested:'yamaha-c5-accurate-z';
      await loadEngine();engine=global.NocturneAudio;if(!engine?.sampled||typeof engine.prepare!=='function'||typeof engine.getReleaseProfile!=='function'||typeof engine.setReleaseProfile!=='function')throw new Error('Sample engine unavailable');
      engine.setVolumeAlignment(true);ready=true;$('labPreset').disabled=false;
      document.querySelectorAll('.audition-key').forEach(b=>{b.disabled=false;});
      document.querySelectorAll('.apply-curve').forEach(b=>{b.disabled=false;});
      $('returnToPiano').href='index.html?panel=sounds';
      refreshFormalProfile();setSelected(formalProfile.familyId,formalProfile.durationMs);setStatus('ready','已核對 21 個鋼琴音色及 81 個組合；按住／放開 I / O / P，放鍵才開始尾音。');
    }catch(error){setStatus('error','音色資料核對失敗，試聽已停用。請使用本機 HTTP 頁面，不要直接開啟檔案。');}
  }
  renderMatrix();
  $('labVolume').addEventListener('input',setVolume);setVolume();
  $('labStop').addEventListener('click',()=>stop());
  $('labPreset').addEventListener('change',event=>{if($('labPreset').selectedOptions[0]?.disabled){event.stopImmediatePropagation();stop(false);$('labPreset').value='yamaha-c5-accurate-z';refreshFormalProfile();refreshStatus('此音色未於公開版提供，已返回可用音色。');}},true);
  $('labPreset').addEventListener('change',()=>{stop(false);refreshFormalProfile();setStatus('ready','已切換至 '+$('labPreset').selectedOptions[0].textContent+'；按住／放開 I / O / P 試聽。');});
  document.addEventListener('keydown',event=>{
    if(event.code==='Escape'){event.preventDefault();stop();return;}
    if(event.repeat||keyboardOwners.has(event.code)||event.ctrlKey||event.metaKey||event.altKey||event.isComposing||event.target?.closest?.('input,select,textarea,[contenteditable=true]'))return;
    const note=NOTES.find(n=>n.code===event.code);
    if(note&&ready){event.preventDefault();const owner='key:'+event.code;keyboardOwners.set(event.code,owner);press(note.midi,owner);return;}
    const button=event.target?.closest?.('.audition-key');
    if((event.code==='Enter'||event.code==='Space')&&button&&!button.disabled&&ready){
      event.preventDefault();const card=button.closest('.curve-card');setSelected(card.dataset.familyId,Number(card.dataset.durationMs));
      const owner='button-key:'+event.code;keyboardOwners.set(event.code,owner);press(Number(button.dataset.midi),owner);
    }
  });
  // Always release an owned key-up, even if focus/modifiers changed while held.
  document.addEventListener('keyup',event=>{const owner=keyboardOwners.get(event.code);if(!owner)return;keyboardOwners.delete(event.code);event.preventDefault();releaseOwner(owner);});
  global.addEventListener('blur',()=>stop());
  global.addEventListener('pagehide',()=>{pageActive=false;stop(false);});
  global.addEventListener('pageshow',()=>{pageActive=true;});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  profileStore.onChange(()=>{if(!engine)return;stop(false);refreshFormalProfile();refreshStatus('正式琴鍵尾音設定已更新；本頁試聽已停止，不會自動繼續。');});
  global.NocturneReleaseCurves=Object.freeze({
    families:FAMILIES,durations:DURATIONS,curveValue,curveSamples,select:setSelected,apply:applySelection,press,release,audition,stop,
    snapshot:()=>Object.freeze({selected,preset:$('labPreset').value,volume:Number($('labVolume').value),state:phase,ready,requestGeneration:generation,activeVoices:active.size,voices:Object.freeze([...active].map(recordSnapshot)),heldMidi:Object.freeze([...inputs.values()].filter(item=>item.state==='held').map(item=>item.midi)),pendingInputs:Object.freeze([...inputs.values()].filter(item=>item.state==='preparing').map(item=>item.ownerId)),tailingCount:[...active].filter(item=>item.state==='tailing').length,formalProfile,lastAudition:lastAudition?Object.freeze({...lastAudition}):null,history:Object.freeze(history.map(record=>Object.freeze({...record}))),engineCache:engine?.cacheStats?.()||null,contextState:context?.state||null,alignmentEnabled:engine?.getVolumeAlignment?.()||false})
  });
  boot();
})(window);
