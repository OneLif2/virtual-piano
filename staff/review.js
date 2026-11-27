(() => {
  const $=id=>document.getElementById(id),aud=$('original'),floor=$('floor');
  let data,context,sounding;
  const clk=s=>Math.floor(s/60)+':'+(s%60).toFixed(2).padStart(5,'0');
  function draw(){
    if(!data)return;
    const pos=aud.currentTime,lo=Math.max(0,pos-.5),hi=Math.min(data.durationSec,pos+4);
    $('floorValue').value=Number(floor.value).toFixed(2);$('windowInfo').textContent=clk(lo)+' – '+clk(hi);
    const rows=data.notes.filter(n=>n.start>=lo&&n.start<hi&&n.confidence>=Number(floor.value));
    const table=$('notes');table.replaceChildren();
    for(const n of rows){
      const tr=table.insertRow();for(const v of [clk(n.start),n.duration.toFixed(2)+' s',n.label+'  ['+(n.key||'螢幕')+']',n.confidence.toFixed(2),n.anchorMatch?'同譜吻合':'未核實'])tr.insertCell().textContent=v;
      const b=document.createElement('button');b.type='button';b.textContent='♪ 單音';b.setAttribute('aria-label','試聽 '+n.label);
      b.onclick=async()=>{aud.pause();try{context??=new AudioContext();await context.resume();await NocturnePiano.prepare(context);sounding?.release(context.currentTime);
        sounding=NocturnePiano.voice(context,n.midi,context.currentTime,.72);sounding?.release(context.currentTime+Math.min(n.duration,2.5));$('notice').textContent='單音：'+n.label;
      }catch(e){$('notice').textContent='未能載入琴聲：'+e.message;}};
      tr.insertCell().append(b);
    }
    if(!rows.length){const td=table.insertRow().insertCell();td.colSpan=6;td.textContent='呢段冇符合門檻嘅候選。';}
  }
  for(const e of ['timeupdate','seeked','loadedmetadata'])aud.addEventListener(e,draw);
  aud.addEventListener('play',()=>{if(context)sounding?.release(context.currentTime);});
  floor.oninput=draw;
  fetch('analysis/canon-audio-notes.json').then(r=>{if(!r.ok)throw Error('辨音結果未就緒');return r.json();}).then(d=>{
    data=d;$('summary').textContent=`全段 ${d.durationSec.toFixed(1)} 秒 · ${d.notes.length} 個候選 · ${d.metrics.referenceMatches} 個同現有 ${d.metrics.referenceNotes} 音 Easy 譜嘅起音吻合。模型強度唔係正確率。`;draw();
  }).catch(e=>$('summary').textContent=e.message);
})();
