// Synthesized sound effects via WebAudio: no audio files, no network.
// All sounds are short oscillator/noise blips built on demand.
let ctx = null;
let muted = false;
let musicTimer = null;

function ensureCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

function tone(freq, dur, type, vol, slideTo) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
  gain.gain.setValueAtTime(vol || 0.12, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur, vol, filterFreq) {
  if (muted) return;
  const c = ensureCtx();
  if (!c) return;
  const t0 = c.currentTime;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq || 1200;
  const gain = c.createGain();
  gain.gain.setValueAtTime(vol || 0.1, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  shoot() { tone(880, 0.07, 'square', 0.03, 440); },
  hit() { noise(0.06, 0.06, 900); },
  enemyDie() { tone(220, 0.16, 'sawtooth', 0.07, 55); },
  gem() { tone(1320, 0.08, 'sine', 0.06, 1760); },
  levelup() {
    tone(523, 0.12, 'sine', 0.1); tone(659, 0.12, 'sine', 0.1);
    tone(784, 0.2, 'sine', 0.1); tone(1046, 0.28, 'sine', 0.09);
  },
  hurt() { tone(160, 0.2, 'sawtooth', 0.1, 60); noise(0.12, 0.08, 500); },
  nova() { noise(0.3, 0.12, 2400); tone(110, 0.3, 'sine', 0.12, 55); },
  dawn() {
    [523, 659, 784, 1046, 1318].forEach((f, i) => {
      setTimeout(() => tone(f, 0.35, 'sine', 0.09), i * 70);
    });
  },
  boss() { tone(98, 0.5, 'sawtooth', 0.12, 49); tone(147, 0.5, 'sawtooth', 0.08, 73); },
  win() {
    [523, 659, 784, 1046, 784, 1046, 1318].forEach((f, i) => {
      setTimeout(() => tone(f, 0.3, 'triangle', 0.1), i * 110);
    });
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => {
      setTimeout(() => tone(f, 0.4, 'triangle', 0.1), i * 160);
    });
  },
  click() { tone(660, 0.05, 'sine', 0.07); },
  toggleMute() {
    muted = !muted;
    return muted;
  },
  isMuted() { return muted; },
  // A quiet two-note lullaby loop while playing; started on first user gesture.
  startMusic() {
    if (musicTimer !== null) return;
    const notes = [262, 330, 392, 330, 294, 392, 440, 392];
    let i = 0;
    musicTimer = setInterval(() => {
      if (!muted) {
        tone(notes[i % notes.length], 0.9, 'triangle', 0.025);
        // A soft bass note every fourth beat, one octave down.
        if (i % 4 === 0) tone(notes[i % notes.length] / 2, 0.9, 'sine', 0.02);
      }
      i++;
    }, 620);
  },
};

export function unlockAudio() {
  ensureCtx();
}
