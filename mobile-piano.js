/* UI-only phone layout: no score, pitch, audio, or judgment configuration writes. */
(() => {'use strict';if(!phonePianoLayout)return;
const root=document.documentElement,mast=document.querySelector('.mast-tools'),dock=document.querySelector('.piano-dock');
const more=document.createElement('details');more.id='mobileMore';more.innerHTML='<summary aria-label="更多演奏控制及診斷">更多</summary><div class="mobile-details-panel"><strong>演奏控制與詳細資料</strong><p>34 個原音高保持不變；大琴鍵以左右按鈕切換，窄視窗不能同時涵蓋所有跨音域和弦。</p><button id="mobileKeyboardSize" type="button" aria-pressed="false">改看全 34 鍵（較小）</button><label class="phone-setting"><input id="mobileAutoFollow" type="checkbox" checked>閒置時跟隨兩秒內提示</label></div>';mast.append(more);const panel=more.querySelector('.mobile-details-panel'),gradeDetails=document.createElement('div');gradeDetails.id='mobileGradeDetails';panel.append(gradeDetails);
const move=selector=>{const e=document.querySelector(selector);if(e)panel.append(e);};
for(const selector of ['.song-field','.masthead .key-select','.sequence-line','#progress','.poc-strip','#rhythmJudge','#rhythmAccuracy','#rhythmGauge','#rhythmCounts','.rhythm-help','#alongAttemptStatus','#backingStatus','#alongMix','#performanceFocus','#range','#endStatsCard']){
 let e=document.querySelector(selector);if(!e)continue;
 if(selector==='#rhythmAccuracy'||selector==='#rhythmGauge')e=e.closest('[data-stat]');
 if(['#rhythmJudge','#rhythmAccuracy','#rhythmGauge','#rhythmCounts','.rhythm-help'].includes(selector))gradeDetails.append(e);else panel.append(e);
}
// The actual paging controls remain native buttons, outside the musical surface.
dock.append(ui.keyNav);const label=document.createElement('span');label.id='mobileKeyRange';label.setAttribute('role','status');label.setAttribute('aria-live','polite');document.querySelector('.stage-sign').append(label);
const sizeButton=$('mobileKeyboardSize'),followControl=$('mobileAutoFollow');let allKeys=false,manualUntil=0,autoUntil=0,lastGoal='',autoEndOpen=false;
const now=()=>performance.now(),blocked=()=>pointers.size>0||active.size>0;
const mayAutoFollow=()=>!allKeys&&followControl.checked&&!blocked()&&now()>=manualUntil;
const userPan=()=>{manualUntil=now()+4000;lastGoal='';};
function rangeText(){const frame=ui.keyboardViewport.getBoundingClientRect(),visible=[...keyButtons].filter(([,k])=>{const r=k.getBoundingClientRect();return r.right>frame.left+1&&r.left<frame.right-1;}).map(([m])=>m);const text=visible.length?name(visible[0])+'–'+name(visible[visible.length-1])+' 可見 · '+(allKeys?'全 34 鍵':'34 鍵／左右切換'):'';if(label.textContent!==text)label.textContent=text;return visible;}
function follow(beat){if(!mayAutoFollow()||isHorizontalReader()||!modeScore.length)return;
 const state=lesson||pausedLesson,anchored=!!(pausedLesson||state?.retryGate||state?.hold),secPerBeat=60/tempo(),horizon=beat+2/secPerBeat;let at=anchored&&state.index>=0?state.index:stepAt(beat),goal=at;
 if(!anchored)for(let i=at;i<modeScore.length&&stepStarts[i]<=horizon;i++){if(stepStarts[i]>beat+1e-6&&modeScore[i].pitches.length){goal=i;break;}}
 // Do not preview a distant next group at the expense of a current unplayed key.
 const needed=(modeScore[at]?.pitches||[]).filter(m=>!state?.got?.has(m)),combined=[...needed,...(modeScore[goal]?.pitches||[])].map(m=>keyButtons.get(m)).filter(Boolean).map(k=>k.getBoundingClientRect());
 if(goal!==at&&needed.length&&combined.length&&Math.max(...combined.map(r=>r.right))-Math.min(...combined.map(r=>r.left))>ui.keyboardViewport.clientWidth-20)goal=at;
 const pitches=modeScore[goal]?.pitches||[];if(!pitches.length)return;const signature=goal+':'+pitches.join(',')+':'+ui.keyboardViewport.clientWidth;if(signature===lastGoal)return;lastGoal=signature;
 const frame=ui.keyboardViewport.getBoundingClientRect(),keys=pitches.map(m=>keyButtons.get(m)).filter(Boolean);if(!keys.length)return;const boxes=keys.map(k=>k.getBoundingClientRect()),left=Math.min(...boxes.map(r=>r.left)),right=Math.max(...boxes.map(r=>r.right)),pad=10;
 if(left>=frame.left+pad&&right<=frame.right-pad)return;autoUntil=now()+150;
 if(right-left<=frame.width-2*pad)ui.keyboardViewport.scrollLeft+=(left+right-frame.left-frame.right)/2;else revealKey(pitches[0],true);
 laneGeometryDirty=true;rangeText();}
for(const button of [ui.scrollLow,ui.scrollHigh])button.addEventListener('pointerdown',e=>{if(blocked()){e.preventDefault();e.stopImmediatePropagation();}else userPan();},{capture:true});
ui.keyboardViewport.addEventListener('wheel',userPan,{passive:true});ui.keyboardViewport.addEventListener('touchstart',e=>{if(e.target===ui.keyboardViewport)userPan();},{passive:true});
ui.keyboardViewport.addEventListener('scroll',()=>{rangeText();},{passive:true});
sizeButton.onclick=()=>{if(blocked())return;allKeys=!allKeys;root.dataset.mobileKeySize=allKeys?'all':'touch';sizeButton.setAttribute('aria-pressed',String(allKeys));sizeButton.textContent=allKeys?'改用大琴鍵（左右切換）':'改看全 34 鍵（較小）';userPan();requestAnimationFrame(()=>{onStageGeometry();rangeText();});};
followControl.onchange=()=>{lastGoal='';manualUntil=0;};
function orientation(){releaseLive(true);lastGoal='';requestAnimationFrame(()=>{onStageGeometry();rangeText();});}
if(screen.orientation?.addEventListener)screen.orientation.addEventListener('change',orientation);else window.addEventListener('orientationchange',orientation);
window.addEventListener('resize',()=>{lastGoal='';rangeText();});
more.addEventListener('toggle',()=>{if(more.open){if(controlsHidden)revealControls();drawer.open=false;if($('soundsPanel')&&!$('soundsPanel').hidden)$('soundsToggle').click();}});
drawer.addEventListener('toggle',()=>{if(drawer.open)more.open=false;});$('soundsToggle').addEventListener('click',()=>{if(!$('soundsPanel').hidden)more.open=false;});
document.addEventListener('pointerdown',e=>{if(more.open&&!more.contains(e.target))more.open=false;},{capture:true});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&more.open){e.preventDefault();more.open=false;more.querySelector('summary').focus();}});
const mirrorGrades=()=>{gradeDetails.hidden=$('rhythmHud').hidden;};mirrorGrades();new MutationObserver(mirrorGrades).observe($('rhythmHud'),{attributes:true,attributeFilter:['hidden']});
const end=$('endStatsCard');new MutationObserver(()=>{if(!end.hidden){autoEndOpen=true;revealControls();more.open=true;requestAnimationFrame(()=>{if(!end.hidden&&more.open){const box=end.getBoundingClientRect(),frame=panel.getBoundingClientRect();panel.scrollTop+=box.top-frame.top-8;}});}else if(autoEndOpen){autoEndOpen=false;more.open=false;}}).observe(end,{attributes:true,attributeFilter:['hidden']});
// Wall-clock inactivity, independent of transport, score updates, and animation frames.
const topRegions=[...document.querySelectorAll('.masthead,.song-bar,.guide-strip,.cue-line')],headerPointers=new Set();
let controlsHidden=false,hideTimer=0,hideDeadline=0,revealPointer=null,oldControlFocus=null;
const revealButton=document.createElement('button');revealButton.id='mobileRevealControls';revealButton.type='button';revealButton.textContent='顯示控制';revealButton.hidden=true;revealButton.setAttribute('aria-label','顯示演奏控制；點畫面頂部三成亦可顯示');document.querySelector('.note-runway').append(revealButton);
const headerTarget=target=>target instanceof Element&&topRegions.some(r=>r.contains(target));
const protectedControls=()=>more.open||drawer.open||!$('soundsPanel').hidden||!!$('pianoLoadingDialog')?.open||seeking||seekResumeState.gesture||headerPointers.size>0||document.hidden;
function armControls(){clearTimeout(hideTimer);hideTimer=0;if(controlsHidden)return;hideDeadline=now()+5000;hideTimer=setTimeout(()=>{hideTimer=0;if(protectedControls()){armControls();return;}setControlsHidden(true);},5000);}
function setControlsHidden(hidden){if(hidden===controlsHidden)return;controlsHidden=hidden;root.dataset.mobileControlsHidden=String(hidden);revealButton.hidden=!hidden;revealButton.setAttribute('aria-expanded',String(!hidden));
 if(hidden){clearTimeout(hideTimer);hideTimer=0;oldControlFocus=headerTarget(document.activeElement)?document.activeElement:null;}
 for(const region of topRegions){region.inert=hidden;if(hidden)region.setAttribute('aria-hidden','true');else region.removeAttribute('aria-hidden');}
 if(hidden&&oldControlFocus)revealButton.focus({preventScroll:true});
 if(!hidden)armControls();requestAnimationFrame(onStageGeometry);
}
function revealControls(keyboard=false){setControlsHidden(false);if(keyboard&&oldControlFocus?.isConnected)oldControlFocus.focus({preventScroll:true});armControls();}
revealButton.onclick=e=>{revealControls(e.detail===0);};
window.addEventListener('pointerdown',e=>{
 if(e.isTrusted&&revealPointer?.released)revealPointer=null;
 const height=window.visualViewport?.height||innerHeight;
 if(controlsHidden&&e.isTrusted&&e.button===0&&e.clientY>=0&&e.clientY<=height*.30){revealPointer={id:e.pointerId,x:e.clientX,y:e.clientY,at:now(),released:false};revealControls();e.preventDefault();e.stopImmediatePropagation();return;}
 if(headerTarget(e.target)){headerPointers.add(e.pointerId);armControls();}
},{capture:true});
for(const type of ['pointerup','pointercancel'])window.addEventListener(type,e=>{
 if(revealPointer?.id===e.pointerId){revealPointer.released=true;revealPointer.at=now();if(type==='pointercancel')revealPointer=null;e.preventDefault();e.stopImmediatePropagation();return;}
 if(headerPointers.delete(e.pointerId))armControls();
},{capture:true});
window.addEventListener('click',e=>{const pending=revealPointer;if(!pending)return;const samePointer=e.pointerId===pending.id&&now()-pending.at<800,legacyClick=(!('pointerId' in e)||e.pointerId===0)&&e.detail>0&&Math.abs(e.clientX-pending.x)<30&&Math.abs(e.clientY-pending.y)<30&&now()-pending.at<800;
 if(samePointer||legacyClick){revealPointer=null;e.preventDefault();e.stopImmediatePropagation();}
 else if(now()-pending.at>1000)revealPointer=null;
},{capture:true});
for(const type of ['input','change','keydown','wheel'])document.addEventListener(type,e=>{if(headerTarget(e.target))armControls();},{capture:true,passive:type==='wheel'});
for(const element of [more,drawer])element.addEventListener('toggle',armControls);
for(const element of [$('soundsPanel'),$('pianoLoadingDialog')])if(element)new MutationObserver(armControls).observe(element,{attributes:true,attributeFilter:['hidden','open']});
window.addEventListener('blur',()=>{headerPointers.clear();armControls();});window.addEventListener('pagehide',()=>{clearTimeout(hideTimer);hideTimer=0;});
window.addEventListener('pageshow',armControls);document.addEventListener('visibilitychange',()=>{if(document.hidden){clearTimeout(hideTimer);hideTimer=0;}else armControls();});
root.dataset.mobileControlsHidden='false';armControls();

const snapshot=()=>Object.freeze({mobile:true,controlsHidden,controlsHideInMs:controlsHidden?0:Math.max(0,hideDeadline-now()),view:$('scoreView').value,preferenceKey:'nocturne.scoreView.phone-v1',allKeys,autoFollow:followControl.checked,manualPanRemainingMs:Math.max(0,manualUntil-now()),held:blocked(),visibleMidi:Object.freeze(rangeText()),logicalKeys:keyButtons.size,runwayHeight:lane.getBoundingClientRect().height,keyboardHeight:ui.keybed.getBoundingClientRect().height,moreOpen:more.open});
window.NocturneMobilePiano=Object.freeze({snapshot,follow,mayAutoFollow,navigationBlocked:blocked,manualPan:userPan,followTarget:()=>{if(!blocked())follow(transportBeat());}});
root.dataset.mobileKeySize='touch';requestAnimationFrame(()=>{refreshKeyNavigation();rangeText();follow(guidePos);});
})();
