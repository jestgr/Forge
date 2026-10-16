// Exercise history ("last 10 times") and a one-line progression suggestion. Pure.
import { repsNumber, fmtClock } from './util.js';
import { effectiveTargets } from './generator.js';

/** @typedef {import('./model.js').LoggedSet} LoggedSet */

const r1 = (n) => Math.round(n * 10) / 10;

/** Compact text for a list of sets: "3 × 8 @ 135 lb", "135×8, 145×6", "2 × 1:00", "25:00 · 3.5 mph · 8%". */
export function summarizeSets(sets) {
  if (!sets.length) return '—';
  const same = (k) => sets.every((s) => s[k] === sets[0][k]);
  const n = sets.length;
  const extras = (s) => [s.distance ? `${r1(s.distance)} mi` : '', s.speed ? `${r1(s.speed)} mph` : '', s.incline ? `${r1(s.incline)}%` : '', s.hr ? `${s.hr} bpm` : '']
    .filter(Boolean).join(' · ');
  if (sets.some((s) => s.weight)) {
    if (same('weight') && same('reps')) return `${n} × ${sets[0].reps ?? '?'} @ ${sets[0].weight} lb`;
    return sets.map((s) => `${s.weight ?? 0}×${s.reps ?? '?'}`).join(', ') + ' lb';
  }
  if (sets.some((s) => s.timeSec)) {
    const t = same('timeSec') ? `${n > 1 ? `${n} × ` : ''}${fmtClock(sets[0].timeSec || 0)}` : sets.map((s) => fmtClock(s.timeSec || 0)).join(', ');
    const x = n === 1 ? extras(sets[0]) : '';
    return x ? `${t} · ${x}` : t;
  }
  if (sets.some((s) => s.reps)) return same('reps') ? `${n} × ${sets[0].reps}` : sets.map((s) => s.reps ?? '?').join(', ') + ' reps';
  const x = extras(sets[0]);
  return x || `${n} set${n > 1 ? 's' : ''}`;
}

/**
 * Last `limit` times an exercise was done (newest first), from finished sessions.
 * @returns {{ at: number, sessionId: string, sets: LoggedSet[], text: string }[]}
 */
export function exerciseHistory(exerciseId, sessions, limit = 10, excludeSessionId = null) {
  const out = [];
  const sorted = [...sessions].filter((s) => s.status === 'done' && s.id !== excludeSessionId).sort((a, b) => b.startedAt - a.startedAt);
  for (const s of sorted) {
    for (const sec of s.sections) for (const it of sec.items) {
      if (it.exerciseId === exerciseId && it.sets.length) out.push({ at: s.startedAt, sessionId: s.id, sets: it.sets, text: summarizeSets(it.sets) });
    }
    if (out.length >= limit) break;
  }
  return out.slice(0, limit);
}

/** Did a session's sets meet the targets? */
function hitTargets(sets, t) {
  const need = t.sets || 1;
  if (t.durationSec && !t.reps) return sets.filter((s) => (s.timeSec || 0) >= t.durationSec).length >= need;
  const reps = typeof t.reps === 'string' && /\d+\s*-\s*\d+/.test(t.reps)
    ? Number(t.reps.split('-')[1]) : repsNumber(t.reps);
  if (!reps) return false;
  return sets.filter((s) => (s.reps || 0) >= reps).length >= need;
}

const topWeight = (sets) => Math.max(0, ...sets.map((s) => s.weight || 0));

/**
 * Progression suggestion from recent history.
 * @param {{ sets: LoggedSet[] }[]} hist newest first
 * @param {any} targets exercise targets
 * @param {string} category
 * @returns {{ text: string, weight?: number }}
 */
export function suggest(hist, targets, category) {
  if (!hist.length) return { text: 'First time: start light and find a weight you can do with good form.' };
  const t = effectiveTargets(targets, category);
  const [last, prev] = hist;
  const lastRpe = Math.max(0, ...last.sets.map((s) => s.rpe || 0));
  if (lastRpe >= 9) return { text: `Hold: last time was very hard (RPE ${lastRpe}). Repeat ${summarizeSets(last.sets)}.`, weight: topWeight(last.sets) || undefined };
  const w = topWeight(last.sets);
  if (w > 0) {
    if (hitTargets(last.sets, t) && prev && topWeight(prev.sets) === w && hitTargets(prev.sets, t)) {
      const next = w + (w >= 100 ? 5 : 2.5);
      return { text: `Hit the target twice at ${w} lb — try ${next} lb.`, weight: next };
    }
    if (hitTargets(last.sets, t)) return { text: `Hit the target at ${w} lb — repeat it once more, then add weight.`, weight: w };
    return { text: `Repeat ${w} lb and aim for all ${t.sets} × ${t.reps ?? '?'}.`, weight: w };
  }
  if (t.durationSec && !t.reps && last.sets.some((s) => s.timeSec)) {
    if (hitTargets(last.sets, t)) return { text: `Held the target — try ${fmtClock(Math.round(t.durationSec * 1.1 / 5) * 5)} per set.` };
    return { text: `Repeat: ${summarizeSets(last.sets)}.` };
  }
  if (last.sets.some((s) => s.reps)) {
    if (hitTargets(last.sets, t)) return { text: 'Hit the target — try 1–2 more reps per set.' };
    return { text: `Repeat: ${summarizeSets(last.sets)}.` };
  }
  return { text: `Last time: ${summarizeSets(last.sets)}.` };
}
