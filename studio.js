(function (global) {
  'use strict';
  const scriptURL = document.currentScript && document.currentScript.src || location.href;
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const number = (n, def) => Number.isFinite(n) ? n : def;
  // Each hand-tuned row: label, oscillator pair, low-pass cutoff, attack, decay,
  // sustain, release, layer ratio, second layer blend, detune, noise, vibrato.
  const bank = {
    'Piano & Keys': [
      ['Concert Grand','tt',3900,.005,.85,.27,.32,2,.35,1,.025,0],
      ['Felt Piano','ts',1300,.015,1.1,.13,.28,2,.22,0,.09,0],
      ['Honky Tonk','tw',3350,.006,.62,.22,.18,1,.42,16,.028,0],
      ['Glass Grand','ts',6300,.003,1.5,.15,.63,3,.30,4,.007,0],
      ['Electric Tines','st',3000,.008,.65,.32,.30,5,.26,1,0,2],
      ['Reed Piano','tq',2700,.009,.42,.43,.23,1,.35,8,.016,5],
      ['Harpsichord','wq',5500,.002,.27,.09,.07,2,.27,1,.021,0],
      ['Clavinet','qw',2400,.003,.18,.21,.09,.5,.21,3,.015,0]
    ],
    'Organs': [
      ['Drawbar Organ','st',4000,.015,.13,.92,.16,2,.46,1,0,2],
      ['Cathedral Organ','sw',2650,.10,.20,.87,.52,.5,.46,0,0,0],
      ['Theatre Organ','tt',3600,.040,.32,.75,.25,3,.37,8,0,12],
      ['Reed Organ','qt',1900,.075,.33,.72,.29,1,.43,4,.01,4],
      ['Harmonium','qw',1500,.14,.27,.76,.38,1,.32,9,.028,7],
      ['Bandstand Organ','sq',5200,.012,.20,.86,.12,2,.34,7,0,9],
      ['Transistor Organ','wq',7000,.006,.11,.81,.055,1,.44,2,0,1],
      ['Flute Stops','ss',1850,.055,.22,.9,.44,4,.32,2,0,3]
    ],
    'Guitars': [
      ['Nylon Guitar','ts',2600,.005,.44,.18,.16,3,.24,0,.04,0],
      ['Steel Guitar','tw',4900,.003,.50,.18,.26,2,.46,4,.032,0],
      ['Jazz Guitar','st',1400,.010,.43,.33,.12,2,.16,0,.02,2],
      ['Twelve String','wt',5500,.006,.49,.20,.36,2,.51,9,.038,1],
      ['Clean Electric','tw',3200,.007,.62,.34,.19,1,.36,4,.018,4],
      ['Muted Electric','qw',1650,.003,.12,.08,.065,2,.18,5,.08,0],
      ['Fuzz Guitar','ww',2450,.015,.41,.60,.23,1,.45,13,.018,8],
      ['Resonator Guitar','wt',3700,.005,.32,.23,.24,3,.37,2,.10,0]
    ],
    'Basses': [
      ['Upright Bass','ts',830,.014,.47,.32,.18,.5,.30,0,.043,0],
      ['Finger Bass','tw',1050,.009,.45,.43,.17,.5,.47,1,.02,0],
      ['Picked Bass','wq',1550,.004,.38,.39,.13,1,.34,2,.032,0],
      ['Fretless Bass','st',940,.04,.52,.55,.23,.5,.45,0,.01,6],
      ['Slap Bass','qw',2700,.002,.19,.24,.095,.5,.37,2,.08,0],
      ['Sub Bass','ss',650,.018,.25,.83,.16,.5,.56,0,0,0],
      ['Acid Bass','wq',750,.003,.22,.28,.11,2,.35,3,0,0],
      ['Rubber Bass','tq',1140,.026,.30,.52,.23,.5,.53,10,0,5]
    ],
    'Bowed Strings': [
      ['Solo Violin','wt',2850,.11,.28,.82,.32,2,.20,1,.013,10],
      ['Solo Viola','wt',2050,.14,.29,.79,.34,1,.38,3,.014,9],
      ['Solo Cello','tw',1450,.18,.22,.73,.42,.5,.38,4,.027,8],
      ['Bowed Double Bass','wt',860,.25,.38,.71,.43,.5,.51,4,.039,3],
      ['Chamber Strings','ww',3000,.15,.31,.69,.46,1,.56,14,.013,6],
      ['Film Strings','wt',2200,.34,.42,.82,.74,2,.54,12,.016,6],
      ['Tremolo Strings','wq',3450,.08,.18,.66,.32,2,.24,4,.019,21],
      ['Pizzicato Strings','ts',1900,.008,.22,.10,.15,2,.37,5,.034,0]
    ],
    'Brass': [
      ['Trumpet','qw',3800,.035,.28,.75,.16,2,.33,1,.013,5],
      ['Muted Trumpet','qt',1600,.023,.23,.64,.14,3,.31,1,.022,8],
      ['Trombone','wt',1950,.055,.28,.78,.21,.5,.31,4,.021,3],
      ['French Horn','tt',2050,.12,.35,.73,.31,2,.53,2,.019,4],
      ['Flugelhorn','ts',1680,.059,.39,.78,.24,3,.34,2,.012,5],
      ['Tuba','tq',900,.096,.31,.78,.25,.5,.47,2,.021,2],
      ['Brass Section','ww',3350,.065,.28,.77,.28,1,.58,15,.015,6],
      ['Synth Brass','wq',2800,.019,.25,.66,.31,1,.51,11,0,2]
    ],
    'Woodwinds': [
      ['Concert Flute','ss',3000,.067,.23,.84,.22,2,.29,0,.048,8],
      ['Piccolo','st',5100,.025,.18,.87,.18,2,.40,1,.045,7],
      ['Clarinet','qt',1900,.065,.28,.80,.16,3,.29,2,.013,3],
      ['Bass Clarinet','tq',1270,.098,.28,.69,.27,.5,.46,2,.022,5],
      ['Oboe','qw',2750,.079,.24,.83,.20,2,.24,3,.027,4],
      ['Bassoon','qt',1000,.095,.32,.72,.25,1,.49,3,.030,2],
      ['Pan Pipe','ss',2500,.036,.26,.57,.27,3,.25,2,.095,9],
      ['Ocarina','st',1500,.042,.20,.86,.25,2,.15,0,.012,7]
    ],
    'World & Plucked': [
      ['Harp','ss',3300,.006,.88,.11,.43,3,.40,0,.014,0],
      ['Koto','tq',4200,.003,.42,.17,.23,2,.37,5,.023,2],
      ['Kalimba','st',4150,.003,.48,.12,.27,2.76,.23,0,.009,0],
      ['Sitar','qw',3500,.008,.74,.38,.32,2.02,.37,9,.024,4],
      ['Oud','tw',2100,.006,.41,.22,.16,3,.27,4,.036,0],
      ['Dulcimer','ts',5400,.002,.86,.15,.41,2.49,.47,2,.02,0],
      ['Banjo','wq',5700,.003,.24,.11,.12,3,.32,3,.042,0],
      ['Mandolin','tw',4600,.012,.32,.22,.18,1,.52,16,.029,11]
    ],
    'Mallets & Bells': [
      ['Warm Marimba','st',2020,.004,.30,.02,.17,4,.35,1,.028,0],
      ['Xylophone','ts',4800,.003,.20,.025,.12,3.76,.33,1,.031,0],
      ['Vibraphone','ss',3400,.006,1.3,.20,.69,4,.34,1,.004,12],
      ['Glockenspiel','ss',10500,.003,.94,.12,.67,5.42,.40,0,.008,0],
      ['Tubular Bells','st',7250,.015,1.48,.13,.95,2.76,.48,1,.014,0],
      ['Temple Bell','ts',2850,.019,2.1,.17,1,1.51,.57,2,.022,4],
      ['Steel Pan','tt',4200,.005,.57,.16,.31,2.52,.38,4,.026,1],
      ['Toy Chimes','sq',6400,.003,.78,.12,.53,3.13,.23,7,.008,2]
    ],
    'Synth Leads': [
      ['Square Arcade','qs',5200,.006,.19,.82,.10,2,.17,2,0,3],
      ['Saw Hero','ww',4800,.011,.31,.72,.24,1,.51,17,0,6],
      ['Octave Pulse','qq',4250,.004,.26,.66,.13,.5,.42,6,0,4],
      ['Sine Glide','st',3450,.10,.27,.72,.36,2,.27,3,0,18],
      ['Digital Brass Lead','qw',5500,.013,.29,.63,.18,2,.50,9,0,8],
      ['Fifth Stack','wt',4600,.016,.24,.85,.25,1.5,.54,5,0,3],
      ['Soft Triangle','tt',1950,.047,.31,.81,.26,1,.45,12,0,3],
      ['Chip Whistle','qs',6600,.003,.13,.84,.067,3,.34,1,0,14]
    ],
    'Pads & Atmosphere': [
      ['Warm Ensemble','ww',1650,.49,.51,.81,.82,1,.56,15,.007,5],
      ['Air Choir','ts',2050,.36,.31,.78,.79,2,.48,8,.058,7],
      ['Velvet Pad','tt',1000,.52,.67,.71,.98,.5,.47,12,.002,4],
      ['Starlight','ss',6100,.31,.64,.65,.94,3.01,.37,10,.008,11],
      ['Evolving Fifth','wt',2250,.63,.49,.69,.99,1.5,.54,10,.012,9],
      ['Aurora Strings','wt',3400,.41,.69,.74,.88,2,.35,20,.018,8],
      ['Deep Ocean','ss',720,.65,.57,.83,1,.5,.54,12,.044,3],
      ['Crystalline Choir','st',3900,.24,.58,.62,.81,4.02,.40,15,.035,12]
    ],
    'Electronic Percussion': [
      ['Deep Kick','ss',530,.002,.14,.015,.12,.5,.54,1,.032,0],
      ['Snare Pop','tq',3800,.002,.11,.015,.10,1.72,.27,1,.46,0],
      ['Closed Hat','qq',8200,.002,.058,.015,.05,3.77,.31,5,.54,0],
      ['Open Hat','qw',9500,.002,.32,.04,.11,4.79,.35,3,.60,0],
      ['Low Tom','st',1080,.003,.19,.025,.14,.5,.38,5,.15,0],
      ['Wood Block','ts',3300,.002,.074,.018,.07,2.65,.44,4,.11,0],
      ['Cowbell','qq',4850,.003,.20,.046,.14,1.48,.51,0,.04,0],
      ['Splash','wq',11600,.004,.46,.04,.32,5.62,.45,10,.49,0]
    ]
  };
  const wave = {s:'sine',t:'triangle',q:'square',w:'sawtooth'};
  const drumShapes = [
    ['lowpass', 92, 2.4], ['bandpass',177,1.25], ['highpass',6300,1],
    ['highpass',5150,1], ['lowpass',138,1.7], ['bandpass',575,1.13],
    ['bandpass',330,1], ['highpass',3950,1]
  ];
  const patches = new Map();
  const presets = Object.freeze(Object.entries(bank).flatMap(([category, rows], family) =>
    rows.map(([name, waves, cutoff, attack, decay, sustain, release, ratio, mix, detune, noise, vibrato], index) => {
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-$/,'');
      patches.set(id, {waves, cutoff, attack, decay, sustain, release, ratio, mix, detune, noise, vibrato,
        family, index, drum:family === 11 ? drumShapes[index] : null});
      return Object.freeze({id,name,category});
    })));
  const noiseBuffers = new WeakMap();
  const maxSecs = 180;
  function noiseFor(ctx) {
    if (noiseBuffers.has(ctx)) return noiseBuffers.get(ctx);
    const len = Math.ceil(ctx.sampleRate * 2), buf = ctx.createBuffer(1,len,ctx.sampleRate), data = buf.getChannelData(0);
    let x = 68394831;
    for (let i=0; i<len; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; data[i] = (x >>> 0) / 2147483648 - 1; }
    noiseBuffers.set(ctx,buf);
    return buf;
  }
  function makeVoice(ctx, destination, midi, time, velocity, presetId, endTime) {
    const p = patches.get(presetId) || patches.get(presets[0].id);
    const when = Math.max(ctx.currentTime, number(time,ctx.currentTime));
    const hit = clamp(number(velocity,.8),.03,1);
    const freq = 440 * Math.pow(2,(clamp(number(midi,60),0,127)-69)/12);
    const hz = p.drum ? p.drum[1] * Math.pow(2,(clamp(number(midi,60),0,127)-60)/24) : freq;
    const vca = ctx.createGain(), filter = ctx.createBiquadFilter();
    const sources = [], nodes = [vca, filter];
    const ceiling = ctx.sampleRate * .46;
    const cut = Math.min(ceiling, p.cutoff * Math.pow(2,(clamp(number(midi,60),0,127)-60)/40) * (.71 + hit*.40));
    filter.type = p.drum ? p.drum[0] : 'lowpass';
    filter.Q.value = p.drum ? (p.index < 2 ? .75 : .35) : p.family === 3 && p.index === 6 ? 5 : .40;
    filter.frequency.setValueAtTime(Math.min(ceiling, cut * (p.family === 3 && p.index === 6 ? 3.4 : 1.4)), when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20,cut),when + Math.max(.024,p.attack+p.decay*.65));
    filter.connect(vca).connect(destination);
    // A conservative per-voice peak keeps stacked notes and tracks from clipping.
    const peak = (p.family === 3 ? .17 : .13) * hit, low = Math.max(.00005,peak*p.sustain);
    vca.gain.setValueAtTime(.00001, when);
    vca.gain.linearRampToValueAtTime(peak, when+p.attack);
    vca.gain.exponentialRampToValueAtTime(low,when+p.attack+p.decay);
    const fundamental = p.drum ? hz * p.drum[2] : hz;
    const layer = (shape,h,amt,detune) => {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = wave[shape]; osc.frequency.setValueAtTime(Math.min(ceiling,h),when);
      if (p.drum && p.drum[2] > 1) osc.frequency.exponentialRampToValueAtTime(Math.min(ceiling,h/p.drum[2]),when+.11);
      osc.detune.value = detune;
      gain.gain.value = amt;
      osc.connect(gain).connect(filter); osc.start(when);
      sources.push(osc); nodes.push(osc,gain);
      return osc;
    };
    const main = layer(p.waves[0],fundamental,1-p.mix,0);
    const overtone = layer(p.waves[1],fundamental*p.ratio,p.mix,p.detune);
    if (p.vibrato) {
      const lfo = ctx.createOscillator(), depth = ctx.createGain();
      lfo.frequency.value = p.family === 4 && p.index === 6 ? 11 : 4.1+(p.index%4)*.60;
      depth.gain.setValueAtTime(0,when);
      depth.gain.linearRampToValueAtTime(p.vibrato,when+p.attack+.10);
      lfo.connect(depth); depth.connect(main.detune); depth.connect(overtone.detune); lfo.start(when);
      sources.push(lfo); nodes.push(lfo,depth);
    }
    if (p.noise) {
      const src = ctx.createBufferSource(), ng = ctx.createGain();
      src.buffer = noiseFor(ctx); src.loop = true;
      ng.gain.setValueAtTime(p.noise,when);
      ng.gain.exponentialRampToValueAtTime(Math.max(.00001,p.noise*(p.family === 6 ? .30 : .035)),when+Math.max(.024,p.attack+p.decay*.35));
      src.connect(ng).connect(filter); src.start(when,(clamp(number(midi,60),0,127)%19)/23);
      sources.push(src); nodes.push(src,ng);
    }
    let releaseAt = Infinity;
    function releaseAtTime(t, fade) {
      if (t >= releaseAt) return;
      releaseAt = t;
      if(t<when){
        // A stopped/seeked lookahead voice must never attack in the next transport position.
        vca.gain.cancelScheduledValues(t);vca.gain.setValueAtTime(.00001,t);
        sources.forEach(src=>{try{src.stop(t);}catch(_){}});
        return;
      }
      const span = clamp(number(fade,p.release),.015,1.5);
      const now = Math.max(when+.001,t);
      // Evaluate the known attack/decay ramp, including browsers without cancelAndHold.
      let val = low;
      const age = now-when;
      if (age < p.attack) val = .00001 + (peak-.00001)*age/p.attack;
      else if (age < p.attack+p.decay) val = peak * Math.pow(low/peak,(age-p.attack)/p.decay);
      vca.gain.cancelScheduledValues(now);
      if (age < p.attack) vca.gain.linearRampToValueAtTime(Math.max(.00001,val),now);
      else if (age < p.attack+p.decay) vca.gain.exponentialRampToValueAtTime(Math.max(.00001,val),now);
      else vca.gain.setValueAtTime(Math.max(.00001,val),now);
      vca.gain.exponentialRampToValueAtTime(.00001,now+span);
      sources.forEach(src => { try { src.stop(now+span+.015); } catch (_) {} });
    }
    if (endTime != null) releaseAtTime(endTime);
    else releaseAtTime(when+45);
    main.onended = () => { nodes.forEach(node => { try { node.disconnect(); } catch (_) {} }); };
    return {release(fade) { releaseAtTime(ctx.currentTime,fade); },releaseAt(time,fade){releaseAtTime(time,fade);}};
  }
  function voice(ctx,destination,midi,time,velocity,presetId) {
    return makeVoice(ctx,destination,midi,time,velocity,presetId,null);
  }
  function loadEncoder() {
    if (global.lamejs && global.lamejs.Mp3Encoder) return Promise.resolve(global.lamejs.Mp3Encoder);
    if (!loadEncoder.pending) loadEncoder.pending = new Promise((resolve,reject) => {
      const el = document.createElement('script');
      el.src = new URL('vendor/lame.min.js',scriptURL).href;
      el.onload = () => global.lamejs && global.lamejs.Mp3Encoder
        ? resolve(global.lamejs.Mp3Encoder) : reject(new Error('MP3 encoder did not initialize.'));
      el.onerror = () => { el.remove(); reject(new Error('Could not load the bundled MP3 encoder.')); };
      document.head.appendChild(el);
    }).catch(error => { loadEncoder.pending = null; throw error; });
    return loadEncoder.pending;
  }
  async function exportMp3(tracks, {volume=.85,onProgress}={}) {
    const parts = (Array.isArray(tracks) ? tracks : []).slice(0,4).flatMap(track => {
      if (!track || track.muted || track.mute) return [];
      const gain = clamp(number(track.gain,1),0,1.5);
      const entries = track.events || track.notes;
      if (!gain || !Array.isArray(entries)) return [];
      if (entries.length > 4096) throw new Error('MP3 export supports up to 4,096 notes per track.');
      return entries.filter(e => e && Number.isFinite(e.midi) && e.midi>=0 && e.midi<=127 &&
        Number.isFinite(e.start) && Number.isFinite(e.duration) && e.start>=0 && e.duration>0)
        .map(e => ({...e,gain}));
    });
    if (!parts.length) throw new Error('No audible notes to export. Record a track or unmute one first.');
    if (parts.length > 6000) throw new Error('MP3 export supports up to 6,000 audible notes per mix.');
    const duration = Math.max(...parts.map(e => e.start+e.duration))/1000;
    if (duration > maxSecs) throw new Error('MP3 export supports recordings up to 3 minutes.');
    const Offline = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!Offline) throw new Error('This browser does not support offline audio rendering.');
    const sampleRate = 44100;
    const offline = new Offline(2,Math.ceil((duration+1.22)*sampleRate),sampleRate);
    const master = offline.createGain(), compressor = offline.createDynamicsCompressor();
    master.gain.value = clamp(number(volume,.85),0,1);
    compressor.threshold.value = -12;
    compressor.knee.value = 15;
    compressor.ratio.value = 4;
    compressor.attack.value = .004;
    compressor.release.value = .16;
    master.connect(compressor).connect(offline.destination);
    const gains = new Map();
    parts.forEach(e => {
      if (!gains.has(e.gain)) {
        const node = offline.createGain(); node.gain.value = e.gain; node.connect(master);
        gains.set(e.gain,node);
      }
      const start = e.start/1000+.008;
      makeVoice(offline,gains.get(e.gain),e.midi,start,number(e.velocity,.8),e.presetId,start+Math.max(.012,e.duration/1000));
    });
    if (onProgress) onProgress(0);
    const [audio, Encoder] = await Promise.all([offline.startRendering(),loadEncoder()]);
    const encoder = new Encoder(2,sampleRate,128), chunks = [];
    const left = audio.getChannelData(0), right = audio.getChannelData(1);
    const pcm = v => { const n = clamp(v,-1,1); return n < 0 ? n*32768 : n*32767; };
    for (let i=0; i<left.length; i+=1152) {
      const len = Math.min(1152,left.length-i), l = new Int16Array(len), r = new Int16Array(len);
      for (let j=0; j<len; j++) { l[j]=pcm(left[i+j]); r[j]=pcm(right[i+j]); }
      const block = encoder.encodeBuffer(l,r);
      if (block.length) chunks.push(block);
      if (i%(1152*24)===0) {
        if (onProgress) onProgress(.32+.66*i/left.length);
        await new Promise(resolve => setTimeout(resolve,0));
      }
    }
    const tail = encoder.flush();
    if (tail.length) chunks.push(tail);
    const header = chunks[0];
    if (!header || (header[0]&255)!==255 || (header[1]&224)!==224) throw new Error('MP3 encoder did not return an MPEG audio stream.');
    if (onProgress) onProgress(1);
    return new Blob(chunks,{type:'audio/mpeg'});
  }
  global.NocturneAudio = Object.freeze({presets,voice,exportMp3});
})(window);
