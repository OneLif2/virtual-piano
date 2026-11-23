/* Local A-reference volume comparison. Does not alter master/background controls. */
(() => {
  'use strict';
  function init() {
    const engine=window.NocturneAudio;
    const panel=document.getElementById('soundsPanel');
    const select=document.getElementById('preset');
    if(!panel||!select||document.getElementById('volumeAlignControls'))return;
    const foot=panel.querySelector('.sounds-foot:last-of-type');
    if(!foot)return;
    const group=document.createElement('span');
    group.id='volumeAlignControls';group.setAttribute('role','group');group.setAttribute('aria-label','音色音量校正');
    const label=document.createElement('label');label.className='volume-align-label';
    const toggle=document.createElement('input');toggle.type='checkbox';toggle.id='volumeAlignA';
    toggle.title='以 A 原裝作音量基準；切換時會暫停樂曲並放開正在發聲的琴鍵。';
    label.append(toggle,document.createTextNode(' 音量對齊 A 原裝'));
    const status=document.createElement('span');status.id='volumeAlignmentStatus';status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const note=document.createElement('small');note.className='volume-align-note';
    note.textContent='同音高／力度，完整音符最大 200ms RMS；保留起音衰減，設峰值保護。非 LUFS。';
    const report=document.createElement('a');report.href='volume-report.html';report.target='_blank';report.rel='noopener';report.textContent='109 音色量度表';group.append(label,status,note,report);foot.prepend(group);
    if(!engine||typeof engine.setVolumeAlignment!=='function'||typeof engine.getVolumeAlignment!=='function'||typeof engine.alignmentInfo!=='function') {
      toggle.disabled=true;status.textContent='音量校正未就緒';status.dataset.state='error';return;
    }
    let midi=60;
    const enabled=()=>{const value=engine.getVolumeAlignment();return typeof value==='object'?value?.enabled===true:value===true;};
    const pitch=n=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][((n%12)+12)%12]+(Math.floor(n/12)-1);
    const db=n=>(n>0?'+':'')+n.toFixed(1)+' dB';
    function refresh() {
      toggle.checked=enabled();
      const id=select.value;
      const info=engine.alignmentInfo(id,midi)||{};
      // db describes measured correction even when bypassed; effective level is explicit below.
      const correction=Number(info.db??info.gainDb);
      const median=Number(info.medianDb);
      const on=toggle.checked;
      status.dataset.enabled=String(on);status.dataset.preset=id;status.dataset.midi=String(midi);
      status.dataset.state='ready';
      if(info.calibrated===false||!Number.isFinite(correction)) {
        status.dataset.state='unavailable';status.textContent=(on?'對齊已開啟':'原始音量')+' · '+pitch(midi)+' 未有校正資料';return;
      }
      status.dataset.db=String(on?correction:0);
      status.textContent=(on?'對齊 A':'原始音量')+' · '+pitch(midi)+' '+db(on?correction:0)
        +(Number.isFinite(median)?' · 34 鍵校正中位 '+db(median):'')
        +(info.limited?' · 峰值保護限制':'')
        +(info.outOfRange?' · 鍵域外估計值':'');
    }
    toggle.addEventListener('change',()=>{
      try {
        engine.setVolumeAlignment(toggle.checked);
        // Reuse native sampleSelect pause/release/cancellation instead of mutating lesson state.
        select.dispatchEvent(new Event('change',{bubbles:true}));
        refresh();
      } catch(error) {
        toggle.checked=enabled();status.dataset.state='error';status.textContent='不能切換音量校正：'+String(error.message||error);
      }
    });
    select.addEventListener('change',()=>{midi=60;refresh();});
    if(typeof engine.onStatus==='function')engine.onStatus(s=>{if(s.id===select.value)refresh();});
    document.getElementById('keybed')?.addEventListener('pointerdown',event=>{
      const key=event.target.closest?.('[data-midi]');const next=Number(key?.dataset.midi);
      if(key&&Number.isInteger(next)){midi=next;refresh();}
    },{capture:true,passive:true});
    refresh();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
