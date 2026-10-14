/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Calls the server, which holds GEMINI_API_KEY (see /api/ai/workout in server.ts).
export async function generateWorkout(goal: string, time: number) {
  const resp = await fetch("/api/ai/workout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal, time }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Workout generation failed (${resp.status}).`);
  return data;
}

// Returns null when the server has no GEMINI_API_KEY configured.
export async function getCoachAdvice(exerciseName: string, history: string, goal: string): Promise<string | null> {
  const resp = await fetch("/api/ai/advice", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ exerciseName, history, goal }),
  });
  if (resp.status === 503) return null;
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(data.error || `Advice request failed (${resp.status}).`);
  return data.advice;
}
