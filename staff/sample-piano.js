/* Offline sampled grand. No remote fetches. See samples/SOURCE.json and NOTICE.txt. */
(() => {
  'use strict';
  const roots=[42,48,54,60,66,72,75], banks=new WeakMap();
  function prepare(ctx) {
    if (banks.has(ctx)) return banks.get(ctx).loading;
    const buffers=new Map(), master=ctx.createGain(), limiter=ctx.createDynamicsCompressor();
    master.gain.value=.74;limiter.threshold.value=-7;limiter.knee.value=14;limiter.ratio.value=5;
    master.connect(limiter);limiter.connect(ctx.destination);
    const bank={buffers,master};
    bank.loading=Promise.allSettled(roots.map(async midi=>{
      const r=await fetch('samples/midi-'+midi+'.wav');
      if(!r.ok)throw Error('Missing sample '+midi);
      buffers.set(midi,await ctx.decodeAudioData(await r.arrayBuffer()));
    })).then(()=>{if(!buffers.size){banks.delete(ctx);throw Error('琴音取樣未載入');}return buffers.size;});
    banks.set(ctx,bank);return bank.loading;
  }
  function voice(ctx,midi,when,velocity=.75,output=null,elapsed=0){
    const b=banks.get(ctx);if(!b||!b.buffers.size)return null;
    const root=[...b.buffers.keys()].reduce((p,n)=>Math.abs(midi-n)<Math.abs(midi-p)?n:p);
    const src=ctx.createBufferSource(), env=ctx.createGain(), t=Math.max(ctx.currentTime,when);
    src.buffer=b.buffers.get(root);src.playbackRate.value=2**((midi-root)/12);
    const vol=.75*Math.max(.1,Math.min(1,velocity));env.gain.setValueAtTime(vol,t);
    src.connect(env);env.connect(output??b.master);src.onended=()=>{src.disconnect();env.disconnect();};
    // On seek/resume a held note is already decaying. Offset is measured in
    // source-buffer seconds, not transposed performance seconds.
    src.start(t,Math.min(src.buffer.duration,Math.max(0,elapsed)*src.playbackRate.value));
    let off=Infinity;
    return {release(at){if(!Number.isFinite(at)||at>=off)return;off=at;
      const end=Math.max(ctx.currentTime,at);
      if(end<t){src.stop(end);return;}
      env.gain.cancelScheduledValues(end);env.gain.setValueAtTime(vol,end);
      // Cancellable piecewise sqrt envelope: pause/seek may release an already scheduled voice early.
      for(let k=1;k<=12;k++)env.gain.linearRampToValueAtTime(vol*Math.sqrt(1-k/12),end+.35*k/12);
      src.stop(end+.352);
    }};
  }
  window.NocturnePiano=Object.freeze({prepare,voice,output:ctx=>banks.get(ctx)?.master});
})();
