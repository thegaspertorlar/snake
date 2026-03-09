// Web Audio API based simple synthesizer for SFX
export default function createAudioEngine() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  let muted = false;

  // master gain so we can mute/unmute all sounds reliably (including
  // currently playing ones) and future nodes without needing to touch
  // individual oscillator/gain nodes.
  const master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);

  function gain(amount = 0.2) {
    const g = ctx.createGain();
    // individual nodes use their own gain but the master controls overall
    // output so we don't have to branch on muted all over the code.
    g.gain.value = amount;
    g.connect(master);
    return g;
  }

  function playOsc(type, freq, when = 0, duration = 0.1, volume = 0.15, detune = 0) {
    const o = ctx.createOscillator();
    const g = gain(volume);
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(g);
    o.start(ctx.currentTime + when);
    o.stop(ctx.currentTime + when + duration + 0.02);
  }

  function playEat() {
    // short blip with quick envelope
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.value = 0.12;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.12, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    o.start(now);
    o.stop(now + 0.13);
  }

  function playGameOver() {
    // descending tone
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(600, now);
    o.frequency.exponentialRampToValueAtTime(120, now + 0.8);
    g.gain.value = 0.18;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
    o.start(now);
    o.stop(now + 1);
  }

  function playHighScore() {
    // simple jingle
    const now = ctx.currentTime;
    const notes = [880, 1100, 1320];
    notes.forEach((n, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = i === 1 ? 'triangle' : 'sine';
      o.frequency.value = n;
      g.gain.value = 0.12;
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.0001, now + i * 0.12);
      g.gain.exponentialRampToValueAtTime(g.gain.value, now + i * 0.12 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.12 + 0.22);
      o.start(now + i * 0.12);
      o.stop(now + i * 0.12 + 0.24);
    });
  }

  function resume() {
    if (ctx.state === 'suspended') return ctx.resume();
    return Promise.resolve();
  }

  function toggleMute() {
    muted = !muted;
    // smooth/fallback ramp to avoid clicks
    try {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
      master.gain.exponentialRampToValueAtTime(muted ? 0.0001 : 1, ctx.currentTime + 0.02);
    } catch (e) {
      // some browsers may throw for exponential ramps to 0, fallback to linear
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, ctx.currentTime + 0.02);
    }
  }

  function isMuted() { return muted; }

  return {playEat, playGameOver, playHighScore, toggleMute, isMuted, resume};
}
