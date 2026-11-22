/* Rehearsal links only set the view, mode and time. They never start a voice. */
(() => {
  'use strict';
  const query=new URLSearchParams(location.search);
  const modes={practice:'modePractice',along:'modeAlong',demo:'modeDemo'};
  const mode=modes[query.get('mode')];if(mode)document.getElementById(mode)?.click();
  if(query.get('view')==='falling'){
    const view=document.getElementById('scoreView');view.value='falling';view.dispatchEvent(new Event('change'));
  }
  if(query.get('keys')==='34'){
    const keys=document.getElementById('keyView');keys.value=query.get('keys');keys.dispatchEvent(new Event('change'));
  }
  // Explicit local rehearsal link: park the score without starting audio.
  if(query.has('at')){
    const sec=Number(query.get('at')),seek=document.getElementById('seek');
    if(Number.isFinite(sec)&&sec>=0&&sec<Number(seek.max)){
      seek.value=String(sec);seek.dispatchEvent(new Event('change',{bubbles:true}));
    }
  }
})();
