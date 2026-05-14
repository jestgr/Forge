/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ExerciseCategory = 'Mobility' | 'Posture' | 'Resistance' | 'Cardio';
export type EquipmentMode = 'Full Gym' | 'Travel' | 'Bodyweight';
export type TrackingField = 'Weight' | 'Reps' | 'Time' | 'Speed' | 'Incline' | 'Distance' | 'HeartRate' | 'RPE';
export type SessionType = 'Lower Body' | 'Chest/Shoulders' | 'Back/Biceps' | 'Core' | 'Pure Cardio';

export interface ExerciseTemplate {
  id: string;
  name: string;
  category: ExerciseCategory;
  targetSplits?: (SessionType | 'All')[]; // Which workout days this exercise is for
  suggestedDuration?: number; // in seconds
  suggestedSets?: number;
  suggestedReps?: number | string;
  suggestedRest?: number; // in seconds
  equipment: EquipmentMode[];
  trackingFields: TrackingField[];
  description?: string;
  notes?: string;
  videoUrl?: string;
}

export interface WorkoutSet {
  id: string;
  reps?: number;
  weight?: number;
  time?: number; // in seconds
  speed?: number;
  incline?: number;
  distance?: number;
  heartRate?: number;
  rpe?: number;
  completed: boolean;
  timestamp: number;
}

export interface ActiveExercise {
  id: string;
  templateId: string;
  name: string;
  category: ExerciseCategory;
  sets: WorkoutSet[];
  targetSets: number;
  targetReps?: number | string;
  targetDuration?: number;
  targetRest?: number;
  notes?: string;
  videoUrl?: string;
}

export interface WorkoutSession {
  id: string;
  name: string;
  type: SessionType;
  hasCardio: boolean;
  startTime: number;
  endTime?: number;
  exercises: ActiveExercise[];
  status: 'active' | 'completed';
  estimatedDuration: number; // minutes
}

export interface PlanSession {
  type: SessionType | 'Custom';
  templateIds: string[];
  label: string;
}

export interface PlanWeek {
  week: number;
  focus: string;
  sessions: PlanSession[];
}

export interface ProgressionPlan {
  id: string;
  name: string;
  description: string;
  durationWeeks: number;
  weeks: PlanWeek[];
}
