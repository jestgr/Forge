// Sound (WebAudio beeps, no files) and vibration cues for timers.
// Audio must be unlocked by a tap; starting a session or runner does that.
import { state } from '../store.js';
import { plugin } from './native.js';

/** @type {AudioContext|null} */
let ctx = null;

export function unlockAudio() {
  try {
    ctx = ctx || new (window.AudioContext || /** @type {any} */ (window).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  } catch { ctx = null; }
}

function tone(freq, ms, at = 0, gain = 0.35) {
  if (!ctx || state.settings.sound === false) return;
  const t0 = ctx.currentTime + at / 1000;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'square';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + ms / 1000 + 0.02);
}

function buzz(pattern) {
  if (state.settings.vibrate === false) return;
  const haptics = plugin('Haptics');
  if (haptics) {
    // Native: play the pattern's "on" parts one after another.
    const p = Array.isArray(pattern) ? pattern : [pattern];
    let at = 0;
    p.forEach((ms, i) => { if (i % 2 === 0) setTimeout(() => haptics.vibrate({ duration: ms }).catch(() => {}), at); at += ms; });
    return;
  }
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}

/** @param {'count'|'work'|'rest'|'done'} kind */
export function cue(kind) {
  if (ctx?.state === 'suspended') ctx.resume();
  if (kind === 'count') { tone(880, 120); buzz(80); }
  if (kind === 'work') { tone(1320, 450); buzz([250, 80, 250]); }
  if (kind === 'rest') { tone(660, 450); buzz(400); }
  if (kind === 'done') { tone(880, 180); tone(1100, 180, 220); tone(1320, 400, 440); buzz([300, 100, 300, 100, 500]); }
}
