/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ExerciseTemplate } from './types';

export const BASE_EXERCISES: ExerciseTemplate[] = [
  // MOBILITY (10m total target - 4-5 exercises)
  {
    id: 'mob_1',
    name: 'Spanish Squats',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time', 'RPE']
  },
  {
    id: 'mob_2',
    name: 'Shin Boxes (90/90)',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'mob_3',
    name: 'Thoracic Rotations',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'mob_4',
    name: 'Scapular Circles',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'mob_5',
    name: 'World’s Greatest Stretch',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 45,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'mob_6',
    name: 'Cat-Cow',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'mob_7',
    name: 'Adductor Rocks',
    category: 'Mobility',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedDuration: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },

  // POSTURE (5m total target - 3-4 exercises)
  {
    id: 'pos_1',
    name: 'Face Pulls (Cable/Band)',
    category: 'Posture',
    targetSplits: ['All'],
    suggestedSets: 3,
    suggestedReps: 15,
    suggestedRest: 30,
    equipment: ['Travel', 'Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'pos_2',
    name: 'Band Pull-Aparts',
    category: 'Posture',
    targetSplits: ['All'],
    suggestedSets: 3,
    suggestedReps: 20,
    suggestedRest: 30,
    equipment: ['Travel', 'Full Gym', 'Bodyweight'],
    trackingFields: ['Reps']
  },
  {
    id: 'pos_3',
    name: 'Chin Tucks',
    category: 'Posture',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedReps: 12,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps']
  },
  {
    id: 'pos_4',
    name: 'Wall Slides',
    category: 'Posture',
    targetSplits: ['All'],
    suggestedSets: 2,
    suggestedReps: 15,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps']
  },
  {
    id: 'pos_5',
    name: 'Bird Dog',
    category: 'Posture',
    targetSplits: ['All'],
    suggestedSets: 3,
    suggestedDuration: 45,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },

  // LOWER BODY
  {
    id: 'lb_1',
    name: 'Barbell Back Squat',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 8,
    suggestedRest: 120,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_2',
    name: 'Goblet Squat (DB/KB)',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 90,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_3',
    name: 'Deadlift (Barbell)',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 5,
    suggestedRest: 180,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_4',
    name: 'Bulgarian Split Squat',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedRest: 90,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_5',
    name: 'Leg Press (Machine)',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 90,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_6',
    name: 'Walking Lunges',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 20,
    suggestedRest: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_7',
    name: 'Leg Extension (Machine)',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 15,
    suggestedRest: 60,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'lb_8',
    name: 'Leg Curl (Machine)',
    category: 'Resistance',
    targetSplits: ['Lower Body'],
    suggestedSets: 3,
    suggestedReps: 15,
    suggestedRest: 60,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },

  // CHEST / SHOULDERS
  {
    id: 'cs_1',
    name: 'Barbell Bench Press',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 8,
    suggestedRest: 120,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'cs_2',
    name: 'Dumbbell Chest Press',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedRest: 90,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'cs_3',
    name: 'Push Ups',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 'Max',
    suggestedRest: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps']
  },
  {
    id: 'cs_4',
    name: 'Overhead Press (Barbell)',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 8,
    suggestedRest: 120,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'cs_5',
    name: 'Cable Chest Fly',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 60,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'cs_6',
    name: 'Lateral Raise (DB/Cable)',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 15,
    suggestedRest: 60,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'cs_7',
    name: 'Dips (Chest Focus)',
    category: 'Resistance',
    targetSplits: ['Chest/Shoulders'],
    suggestedSets: 3,
    suggestedReps: 'Max',
    suggestedRest: 90,
    equipment: ['Bodyweight', 'Full Gym'],
    trackingFields: ['Reps', 'Weight']
  },

  // BACK / BICEPS
  {
    id: 'bb_1',
    name: 'Barbell Row',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 8,
    suggestedRest: 90,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'bb_2',
    name: 'Lat Pulldown',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedRest: 90,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'bb_3',
    name: 'Single Arm Dumbbell Row',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedRest: 60,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'bb_4',
    name: 'Pull Ups',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 'Max',
    suggestedRest: 120,
    equipment: ['Bodyweight', 'Full Gym'],
    trackingFields: ['Reps', 'Weight']
  },
  {
    id: 'bb_5',
    name: 'Seated Cable Row',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 90,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'bb_6',
    name: 'Barbell Biceps Curl',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 10,
    suggestedRest: 60,
    equipment: ['Full Gym'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'bb_7',
    name: 'Hammer Curls (DB)',
    category: 'Resistance',
    targetSplits: ['Back/Biceps'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 60,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },

  // CORE
  {
    id: 'c_1',
    name: 'Plank',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedDuration: 60,
    suggestedRest: 60,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'c_2',
    name: 'Dead Bug',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps']
  },
  {
    id: 'c_3',
    name: 'Hanging Leg Raise',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedReps: 15,
    suggestedRest: 60,
    equipment: ['Bodyweight', 'Full Gym'],
    trackingFields: ['Reps']
  },
  {
    id: 'c_4',
    name: 'Cable Wood Chop',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedReps: 12,
    suggestedRest: 60,
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Weight', 'Reps']
  },
  {
    id: 'c_5',
    name: 'Russian Twists',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedReps: 20,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps', 'Weight']
  },
  {
    id: 'c_6',
    name: 'Bicycle Crunches',
    category: 'Resistance',
    targetSplits: ['Core'],
    suggestedSets: 3,
    suggestedReps: 20,
    suggestedRest: 30,
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Reps']
  },

  // CARDIO
  {
    id: 'card_1',
    name: 'Treadmill Run/Walk',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 1500, // 25 mins
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Time', 'Speed', 'Incline']
  },
  {
    id: 'card_2',
    name: 'Stationary Bike',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 1500, // 25 mins
    equipment: ['Full Gym', 'Travel'],
    trackingFields: ['Time', 'Speed']
  },
  {
    id: 'card_3',
    name: 'Rowing Machine',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 1200, // 20 mins
    equipment: ['Full Gym'],
    trackingFields: ['Time', 'Speed']
  },
  {
    id: 'card_4',
    name: 'Elliptical',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 1500, // 25 mins
    equipment: ['Full Gym'],
    trackingFields: ['Time', 'Speed', 'Incline']
  },
  {
    id: 'card_5',
    name: 'Jump Rope',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 600, // 10 mins (high intensity)
    equipment: ['Bodyweight', 'Travel', 'Full Gym'],
    trackingFields: ['Time']
  },
  {
    id: 'card_6',
    name: 'Stair Climber',
    category: 'Cardio',
    targetSplits: ['All'],
    suggestedDuration: 1200, // 20 mins
    equipment: ['Full Gym'],
    trackingFields: ['Time', 'Speed']
  }
];
