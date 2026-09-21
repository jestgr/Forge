/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";

function getAiClient() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set.");
  return new GoogleGenAI({ apiKey: key });
}

export async function generateWorkout(goal: string, time: number) {
  const ai = getAiClient();
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a workout routine for "${goal}" that takes approximately ${time} minutes.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          exercises: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                targetSets: { type: Type.NUMBER },
                targetReps: { type: Type.NUMBER },
                weight: { type: Type.NUMBER, description: "Suggested starting weight in lbs" },
              },
              required: ["name", "targetSets", "targetReps", "weight"]
            }
          }
        },
        required: ["name", "exercises"]
      }
    }
  });

  return JSON.parse(response.text);
}
