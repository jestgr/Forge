/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  Plus, 
  Dumbbell, 
  History, 
  LayoutDashboard, 
  Users, 
  CheckCircle2, 
  Minus, 
  Timer,
  Zap,
  Flame,
  Heart,
  TrendingUp,
  BrainCircuit,
  X,
  Settings,
  ChevronRight,
  ChevronLeft,
  Settings2,
  Trash2,
  Play,
  RotateCcw,
  Pause,
  BookOpen,
  PlusCircle,
  Dumbbell as DumbbellIcon,
  Search,
  RefreshCw,
  Award,
  Zap as ZapIcon,
  Flame as FlameIcon,
  Sparkles,
  MessageSquare,
  TrendingDown,
  Download,
  Upload,
  Database,
  Activity
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { BASE_EXERCISES, PROGRESSION_PLANS } from './constants';
import { 
  WorkoutSession, 
  ExerciseTemplate, 
  ActiveExercise, 
  WorkoutSet, 
  EquipmentMode, 
  ExerciseCategory,
  TrackingField,
  SessionType,
  ProgressionPlan
} from './types';

// Storage keys
const STORAGE_KEY = 'forge_workout_state';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SESSION_TYPES = [
  'Lower Body',
  'Chest/Shoulders',
  'Back/Biceps',
  'Core',
  'Pure Cardio'
] as const;

const TRACKING_FIELDS: TrackingField[] = ['Weight', 'Reps', 'Time', 'Speed', 'Incline', 'Distance', 'HeartRate', 'RPE'];

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

export default function App() {
  // Global State
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [equipmentMode, setEquipmentMode] = useState<EquipmentMode>('Full Gym');
  const [activePlanId, setActivePlanId] = useState<string | null>(null);
  const [planStartDate, setPlanStartDate] = useState<number | null>(null);
  const [customExercises, setCustomExercises] = useState<ExerciseTemplate[]>([]);
  const [history, setHistory] = useState<WorkoutSession[]>([]);
  
  // UI State
  const [showBuilder, setShowBuilder] = useState(false);
  const [selectedType, setSelectedType] = useState<typeof SESSION_TYPES[number]>('Lower Body');
  const [includeCardio, setIncludeCardio] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [swappingExId, setSwappingExId] = useState<string | null>(null);
  const [addingToCategory, setAddingToCategory] = useState<ExerciseCategory | null>(null);
  const [expandedHistoryExId, setExpandedHistoryExId] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'Dashboard' | 'Calendar' | 'Plans'>('Dashboard');
  const [viewingPastSession, setViewingPastSession] = useState<WorkoutSession | null>(null);
  const [viewingDayDetails, setViewingDayDetails] = useState<string | null>(null); // Date string
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [aiAdvice, setAiAdvice] = useState<{ [exId: string]: string }>({});
  const [isAnalyzing, setIsAnalyzing] = useState<{ [exId: string]: boolean }>({});
  
  // Google Fit Integration State
  const [isGoogleConnected, setIsGoogleConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingWorkouts, setPendingWorkouts] = useState<any[]>([]);
  
  // Timer States
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);

  // Interval Training State
  const [intervalMode, setIntervalMode] = useState<'none' | '4x4' | 'fallback'>('none');
  const [intervalSegment, setIntervalSegment] = useState(0); // 0-indexed
  const [intervalTimeLeft, setIntervalTimeLeft] = useState(0);
  const [showRepeatDialog, setShowRepeatDialog] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fallback Workout Config
  const FALLBACK_MOVEMENTS = [
    { name: 'Squats', duration: 45 },
    { name: 'Push-ups', duration: 45 },
    { name: 'Bodyweight Rows', duration: 45 },
    { name: 'Hinges (Deadlift Movement)', duration: 45 },
    { name: 'Carry (Loaded Walk)', duration: 45 },
    { name: 'Plank', duration: 45 }
  ];

  // 4x4 VO2 Max Config
  const VO2_MAX_SEGMENTS = [
    { name: 'Warmup', duration: 180, type: 'rest' },
    { name: 'Near-Max Effort (1/4)', duration: 240, type: 'work' },
    { name: 'Active Rest', duration: 180, type: 'rest' },
    { name: 'Near-Max Effort (2/4)', duration: 240, type: 'work' },
    { name: 'Active Rest', duration: 180, type: 'rest' },
    { name: 'Near-Max Effort (3/4)', duration: 240, type: 'work' },
    { name: 'Active Rest', duration: 180, type: 'rest' },
    { name: 'Near-Max Effort (4/4)', duration: 240, type: 'work' },
    { name: 'Cool Down', duration: 180, type: 'rest' }
  ];

  // Logging Form State
  const [loggingExId, setLoggingExId] = useState<string | null>(null);
  const [logFormData, setLogFormData] = useState<Partial<WorkoutSet>>({});

  // Custom Exercise Form State
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState<ExerciseCategory>('Resistance');
  const [newExFields, setNewExFields] = useState<TrackingField[]>(['Weight', 'Reps']);
  const [newExSplits, setNewExSplits] = useState<SessionType[]>([]);
  const [newExNotes, setNewExNotes] = useState('');
  const [newExVideoUrl, setNewExVideoUrl] = useState('');
  
  // Daily Steps Tracking
  const [dailySteps, setDailySteps] = useState<{ [dateKey: string]: number }>({});
  const [showStepLogger, setShowStepLogger] = useState(false);
  const [stepInput, setStepInput] = useState('');
  
  // Load State
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCustomExercises(parsed.customExercises || []);
        setHistory(parsed.history || []);
        setDailySteps(parsed.dailySteps || {});
        setActivePlanId(parsed.activePlanId || null);
        setPlanStartDate(parsed.planStartDate || null);
        if (parsed.activeSession) {
          setSession(parsed.activeSession);
          setTimerRunning(true);
          const elapsed = Math.floor((Date.now() - parsed.activeSession.startTime) / 1000);
          setTotalSeconds(elapsed);
        }
      } catch (e) {
        console.error("Storage parse error", e);
      }
    }
  }, []);

  // Sync State
  useEffect(() => {
    const state = {
      activeSession: session,
      customExercises,
      history,
      dailySteps,
      activePlanId,
      planStartDate
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [session, customExercises, history, dailySteps, activePlanId, planStartDate]);

  // Timers Effect
  useEffect(() => {
    // Check if we already have a session
    const checkAuth = async () => {
      try {
        const statusResp = await fetch('/api/fit/status');
        const status = await statusResp.json();
        
        if (!status.configured) {
          console.warn("Google Fit is NOT configured: Missing Client ID or Secret in environment.");
        }

        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const end = now.getTime();
        const resp = await fetch(`/api/fit/sync?startTime=${start}&endTime=${end}`);
        if (resp.ok) {
          setIsGoogleConnected(true);
          // Auto-sync on load if connected
          handleSyncFit();
        }
      } catch (err) {
        // Silent fail - just means not connected
      }
    };
    checkAuth();

    const handleMessage = (event: MessageEvent) => {
      if (event.data === 'OAUTH_AUTH_SUCCESS') {
        setIsGoogleConnected(true);
        handleSyncFit();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleConnectFit = async () => {
    try {
      const resp = await fetch('/api/auth/google/url');
      const { url, debug_redirect_uri } = await resp.json();
      console.log("App attempting OAuth with Redirect URI:", debug_redirect_uri);
      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      window.open(url, 'google-fit-auth', `width=${width},height=${height},left=${left},top=${top}`);
    } catch (err) {
      console.error("Failed to get auth URL", err);
    }
  };

  const handleSyncFit = async () => {
    setIsSyncing(true);
    try {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      const end = now.getTime();
      const resp = await fetch(`/api/fit/sync?startTime=${start}&endTime=${end}`);
      if (!resp.ok) {
        if (resp.status === 401) {
          setIsGoogleConnected(false);
          return;
        }
        throw new Error("Sync failed");
      }
      setIsGoogleConnected(true);
      const data = await resp.json();
      
      // Update steps for today
      if (data.steps > 0) {
        const todayKey = new Date().toDateString();
        setDailySteps(prev => ({ ...prev, [todayKey]: data.steps }));
      }
      
      // Matching Logic
      const matched: any[] = [];
      const unmatched: any[] = [];

      (data.workouts || []).forEach((gfWorkout: any) => {
        // Try to find a match in history
        const match = history.find(session => {
          // If already synced, skip
          if (session.googleFitSessionId === gfWorkout.id) return false;
          
          const timeDiff = Math.abs(session.startTime - gfWorkout.startTime);
          return timeDiff < (30 * 60 * 1000); // 30 minutes window for matching
        });

        if (match) {
          matched.push({ ...gfWorkout, appSessionId: match.id });
        } else {
          // Only add to unmatched if not already synced in history
          if (!history.some(h => h.googleFitSessionId === gfWorkout.id)) {
            unmatched.push(gfWorkout);
          }
        }
      });

      setPendingWorkouts(unmatched);

      if (matched.length > 0) {
        setHistory(prev => prev.map(session => {
          const m = matched.find(match => match.appSessionId === session.id);
          if (m) {
            return {
              ...session,
              googleFitSessionId: m.id,
              calories: m.calories,
              avgHeartRate: m.avgHeartRate,
              distance: m.distance
            };
          }
          return session;
        }));
      }

    } catch (err) {
      console.error(err);
    } finally {
      setIsSyncing(false);
    }
  };

  const importUnmatchedWorkout = (workout: any, bucket: 'Heavy' | 'Zone 2' | 'HIIT') => {
    const sessionType: SessionType = bucket === 'Heavy' ? 'Lower Body' : 'Pure Cardio';
    
    // Check if duplicate
    if (history.some(h => h.googleFitSessionId === workout.id)) {
      setPendingWorkouts(prev => prev.filter(w => w.id !== workout.id));
      return;
    }

    const newSession: WorkoutSession = {
      id: `gf_${workout.id}_${Date.now()}`,
      name: `Synced: ${workout.name || 'Workout'}`,
      type: sessionType,
      hasCardio: bucket !== 'Heavy',
      startTime: workout.startTime,
      endTime: workout.endTime,
      status: 'completed',
      exercises: [], 
      calories: workout.calories,
      avgHeartRate: workout.avgHeartRate,
      distance: workout.distance,
      googleFitSessionId: workout.id,
      estimatedDuration: Math.round((workout.endTime - workout.startTime) / 60000)
    };

    setHistory([newSession, ...history]);
    setPendingWorkouts(prev => prev.filter(w => w.id !== workout.id));
  };

  useEffect(() => {
    let interval: any;
    if (timerRunning) {
      interval = setInterval(() => {
        setTotalSeconds(prev => prev + 1);
        
        if (intervalMode !== 'none') {
          setIntervalTimeLeft(prev => {
            if (prev <= 1) {
              // Time's up for current segment
              handleNextIntervalSegment();
              return 0;
            }
            return prev - 1;
          });
        } else {
          if (isResting) setRestSeconds(prev => prev + 1);
        }
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, isResting, intervalMode, intervalSegment]);

  const handleNextIntervalSegment = () => {
    if (intervalMode === 'fallback') {
      const isCurrentlyWork = intervalTimeLeft === 0 || intervalTimeLeft > 0; // Simplified for finding next
      // Sequence: Work (45s) -> Transition (15s) -> Work ...
      // In fallback, we have 6 segments. Each segment has 45s work + 15s rest.
      // So 12 sub-segments: Work, Rest, Work, Rest ...
      
      const newSegment = intervalSegment + 1;
      if (newSegment >= 12) {
        // Workout finished
        setTimerRunning(false);
        setShowRepeatDialog(true);
        return;
      }
      
      const isRest = newSegment % 2 !== 0;
      setIntervalSegment(newSegment);
      setIntervalTimeLeft(isRest ? 15 : 45);
    } else if (intervalMode === '4x4') {
      const newSegment = intervalSegment + 1;
      if (newSegment >= VO2_MAX_SEGMENTS.length) {
        // Session complete
        setTimerRunning(false);
        setIntervalMode('none');
        return;
      }
      setIntervalSegment(newSegment);
      setIntervalTimeLeft(VO2_MAX_SEGMENTS[newSegment].duration);
    }
  };

  const start4x4Session = () => {
    setIntervalMode('4x4');
    setIntervalSegment(0);
    setIntervalTimeLeft(VO2_MAX_SEGMENTS[0].duration);
    setTimerRunning(true);
  };

  const startFallbackWorkout = () => {
    setIntervalMode('fallback');
    setIntervalSegment(0);
    setIntervalTimeLeft(45); // First 45s work
    setTotalSeconds(0);
    setTimerRunning(true);
    setShowBuilder(false);
    setCurrentView('Dashboard');
  };

  const allTemplates = useMemo(() => [...BASE_EXERCISES, ...customExercises], [customExercises]);

  const getCurrentPlanDetails = () => {
    if (!activePlanId || !planStartDate) return null;
    const plan = PROGRESSION_PLANS.find(p => p.id === activePlanId);
    if (!plan) return null;
    
    const diffTime = Math.abs(Date.now() - planStartDate);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const weekIndex = Math.floor(diffDays / 7);
    
    if (weekIndex >= plan.durationWeeks) return null;
    return { plan, weekIndex, weekData: plan.weeks[weekIndex] };
  };

  const startNewSession = (type: SessionType, hasCardio: boolean) => {
    const candidates = allTemplates.filter(t => t.equipment.includes(equipmentMode));
    
    // Check for Plan Override/Suggestion
    const planDetails = getCurrentPlanDetails();
    let planExercises: ActiveExercise[] = [];
    
    if (planDetails) {
      const planSession = planDetails.weekData.sessions.find(s => s.type === type || (s.type === 'Custom' && ((type as any) === 'Pure Cardio' || (hasCardio && (type as any) !== 'Pure Cardio'))));
      if (planSession) {
        planExercises = planSession.templateIds.map(tid => {
          const t = candidates.find(c => c.id === tid);
          if (!t) return null;
          return {
            id: Math.random().toString(36).substr(2, 9),
            templateId: t.id,
            name: t.name,
            category: t.category,
            targetSets: t.suggestedSets || (t.category === 'Cardio' || t.category === 'Mobility' ? 1 : 3),
            targetReps: t.suggestedReps,
            targetDuration: t.suggestedDuration,
            targetRest: t.suggestedRest,
            notes: t.notes,
            videoUrl: t.videoUrl,
            sets: []
          };
        }).filter(Boolean) as ActiveExercise[];
      }
    }

    // Filter by split logic
    const splitFilter = (t: ExerciseTemplate) => {
      // If it doesn't have splits defined, default to 'All' or just allow it if it's mobility/posture/cardio
      if (!t.targetSplits || t.targetSplits.includes('All')) return true;
      if (t.category !== 'Resistance') return true; 
      return t.targetSplits.includes(type);
    };

    const mobility = candidates.filter(t => t.category === 'Mobility' && splitFilter(t)).slice(0, 4);
    const posture = candidates.filter(t => t.category === 'Posture' && splitFilter(t)).slice(0, 2);
    
    let resistanceCount = hasCardio ? 2 : 4; 
    let cardioCount = hasCardio ? 1 : 0;

    if (type === 'Pure Cardio') {
      resistanceCount = 0;
      cardioCount = 3;
    }
    
    const resTemplates = candidates.filter(t => t.category === 'Resistance' && splitFilter(t));
    const cardTemplates = candidates.filter(t => t.category === 'Cardio' && splitFilter(t));
    
    let resistance = resTemplates.slice(0, resistanceCount);
    let cardio = cardTemplates.slice(0, cardioCount);

    // Integrate plan exercises
    if (planExercises.length > 0) {
      const planCardio = planExercises.filter(e => e.category === 'Cardio');
      const planResistance = planExercises.filter(e => e.category === 'Resistance');
      
      if (planCardio.length > 0) {
        const planCardioTemplates = planCardio.map(pc => cardTemplates.find(ct => ct.id === pc.templateId)).filter(Boolean) as ExerciseTemplate[];
        // Filter out those already in planCardio from cardio list to avoid duplicates
        const otherCardio = cardio.filter(c => !planCardio.some(pc => pc.templateId === c.id));
        cardio = [...planCardioTemplates, ...otherCardio].slice(0, Math.max(cardioCount, planCardioTemplates.length));
      }
      
      if (planResistance.length > 0) {
        const planResTemplates = planResistance.map(pr => resTemplates.find(rt => rt.id === pr.templateId)).filter(Boolean) as ExerciseTemplate[];
        const otherRes = resistance.filter(r => !planResistance.some(pr => pr.templateId === r.id));
        resistance = [...planResTemplates, ...otherRes].slice(0, Math.max(resistanceCount, planResTemplates.length));
      }
    }

    const exercises: ActiveExercise[] = [...mobility, ...posture, ...resistance, ...cardio].map(t => ({
      id: Math.random().toString(36).substr(2, 9),
      templateId: t.id,
      name: t.name,
      category: t.category,
      targetSets: t.suggestedSets || (t.category === 'Cardio' || t.category === 'Mobility' ? 1 : 3),
      targetReps: t.suggestedReps,
      targetDuration: t.suggestedDuration,
      targetRest: t.suggestedRest,
      notes: t.notes,
      videoUrl: t.videoUrl,
      sets: []
    }));

    const newSession: WorkoutSession = {
      id: Date.now().toString(),
      name: `${type} ${hasCardio ? '+ Cardio' : ''}`,
      type,
      hasCardio,
      startTime: Date.now(),
      status: 'active',
      exercises,
      estimatedDuration: 60
    };

    setSession(newSession);
    setTotalSeconds(0);
    setRestSeconds(0);
    setIsResting(false);
    setTimerRunning(false); // Initialized in pause mode
    setShowBuilder(false);
  };

  const initiateAddSet = (exerciseId: string) => {
    if (!session) return;
    const ex = session.exercises.find(e => e.id === exerciseId);
    if (!ex) return;

    const template = allTemplates.find(t => t.id === ex.templateId);
    const lastSet = ex.sets[ex.sets.length - 1];

    // Smart Progression Logic
    let suggestedWeight = lastSet?.weight ?? 0;
    let suggestedReps = lastSet?.reps ?? (typeof template?.suggestedReps === 'number' ? template.suggestedReps : 10);
    
    if (lastSet && lastSet.rpe !== undefined) {
      if (lastSet.rpe <= 6) {
        // Feeling easy - push weight or reps
        if (suggestedWeight > 0) suggestedWeight += (suggestedWeight >= 100 ? 5 : 2.5);
        else if (typeof suggestedReps === 'number') suggestedReps += 2;
      } else if (lastSet.rpe >= 9) {
        // Very heavy - hold weight to stabilize form
      }
    }

    const initialData: Partial<WorkoutSet> = {
      weight: suggestedWeight,
      reps: suggestedReps,
      time: lastSet?.time ?? template?.suggestedDuration ?? 0,
      speed: lastSet?.speed ?? 0,
      incline: lastSet?.incline ?? 0,
      distance: lastSet?.distance ?? 0,
      heartRate: lastSet?.heartRate ?? 0,
      rpe: lastSet?.rpe ?? 7
    };

    setLoggingExId(exerciseId);
    setLogFormData(initialData);
  };

  const submitSet = () => {
    if (!session || !loggingExId) return;

    const newSession = { ...session };
    const ex = newSession.exercises.find(e => e.id === loggingExId);
    if (!ex) return;

    const newSet: WorkoutSet = {
      id: Date.now().toString(),
      reps: logFormData.reps,
      weight: logFormData.weight,
      time: logFormData.time,
      speed: logFormData.speed,
      incline: logFormData.incline,
      distance: logFormData.distance,
      heartRate: logFormData.heartRate,
      rpe: logFormData.rpe,
      completed: true,
      timestamp: Date.now()
    };

    ex.sets.push(newSet);
    setSession(newSession);
    setLoggingExId(null);
    setLogFormData({});
    
    // Auto-rest only for resistance or if specific rest is defined
    if (ex.category === 'Resistance' || ex.targetRest) {
      setRestSeconds(0);
      setIsResting(true);
    }
  };

  const stopRest = () => {
    setIsResting(false);
    setRestSeconds(0);
  };

  const addToSession = (template: ExerciseTemplate) => {
    if (!session) return;
    const newSession = { ...session };

    if (swappingExId) {
      // Handle Swap
      const index = newSession.exercises.findIndex(e => e.id === swappingExId);
      if (index !== -1) {
        newSession.exercises[index] = {
          ...newSession.exercises[index],
          templateId: template.id,
          name: template.name,
          category: template.category,
          targetSets: template.suggestedSets || 3,
          targetReps: template.suggestedReps,
          targetDuration: template.suggestedDuration,
          targetRest: template.suggestedRest,
          notes: template.notes,
          videoUrl: template.videoUrl,
          sets: [] // Reset sets when swapping
        };
      }
      setSwappingExId(null);
    } else {
      // Handle Add
      const newEx: ActiveExercise = {
        id: Math.random().toString(36).substr(2, 9),
        templateId: template.id,
        name: template.name,
        category: template.category,
        targetSets: template.suggestedSets || 3,
        targetReps: template.suggestedReps,
        targetDuration: template.suggestedDuration,
        targetRest: template.suggestedRest,
        notes: template.notes,
        videoUrl: template.videoUrl,
        sets: []
      };
      newSession.exercises.push(newEx);
      setAddingToCategory(null);
    }
    
    setSession(newSession);
    setShowLibrary(false);
  };

  const handleCreateCustom = () => {
    if (!newExName) return;
    const newTemplate: ExerciseTemplate = {
      id: `custom_${Date.now()}`,
      name: newExName,
      category: newExCategory,
      targetSplits: newExSplits.length > 0 ? newExSplits : ['All'],
      equipment: ['Full Gym', 'Travel', 'Bodyweight'], 
      trackingFields: newExFields,
      notes: newExNotes,
      videoUrl: newExVideoUrl
    };
    setCustomExercises([...customExercises, newTemplate]);
    setNewExName('');
    setNewExSplits([]);
    setNewExNotes('');
    setNewExVideoUrl('');
    setShowAddCustom(false);
  };

  const finishSession = () => {
    if (!session) return;
    const completed = { ...session, status: 'completed' as const, endTime: Date.now() };
    setHistory([completed, ...history]);
    setSession(null);
    setTimerRunning(false);
    setIsResting(false);
    setRestSeconds(0);
  };

  const exportData = () => {
    const data = {
      history,
      customExercises,
      version: '1.0',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forge_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportLibrary = () => {
    const data = {
      customExercises,
      version: '1.0',
      type: 'library_only',
      exportedAt: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `forge_library_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importData = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        if (json.history && Array.isArray(json.history)) {
          setHistory(json.history);
        }
        if (json.customExercises && Array.isArray(json.customExercises)) {
          setCustomExercises(json.customExercises);
        }
      } catch (err) {
        console.error('Import failed', err);
      }
    };
    reader.readAsText(file);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const getExerciseHistory = (templateId: string) => {
    const historicalSets: { value: number; date: number; display: string }[] = [];
    
    // Filter history to last 3 months
    const threeMonthsAgo = Date.now() - (90 * 24 * 60 * 60 * 1000);
    const recentHistory = history.filter(s => s.startTime >= threeMonthsAgo);

    recentHistory.forEach(session => {
      const ex = session.exercises.find(e => e.templateId === templateId);
      if (ex) {
        ex.sets.forEach(set => {
          const val = set.weight || set.time || set.distance || set.heartRate || 0;
          const display = set.weight ? `${set.weight} lb` : 
                          set.distance ? `${set.distance} mi` :
                          set.heartRate ? `${set.heartRate} bpm` :
                          formatTime(set.time || 0);
          historicalSets.push({
            value: val,
            date: set.timestamp || session.startTime,
            display: display
          });
        });
      }
    });

    if (session) {
      const ex = session.exercises.find(e => e.templateId === templateId);
      if (ex) {
        ex.sets.forEach(set => {
          const val = set.weight || set.time || set.distance || set.heartRate || 0;
          const display = set.weight ? `${set.weight} lb` : 
                          set.distance ? `${set.distance} mi` :
                          set.heartRate ? `${set.heartRate} bpm` :
                          formatTime(set.time || 0);
          historicalSets.push({
            value: val,
            date: set.timestamp || Date.now(),
            display: display
          });
        });
      }
    }

    return historicalSets.sort((a, b) => a.date - b.date).slice(-50);
  };

  const handleLogSteps = () => {
    const steps = parseInt(stepInput);
    if (isNaN(steps)) return;
    const todayKey = new Date().toDateString();
    setDailySteps({ ...dailySteps, [todayKey]: steps });
    setShowStepLogger(false);
  };

  const calculateFourBucketProgress = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklySessions = history.filter(s => s.startTime >= startOfWeek.getTime() && s.status === 'completed');

    // 1. Heavy Lifts: 2 sessions, 30-45 min
    const heavyLifts = weeklySessions.filter(s => {
      const isLift = ['Lower Body', 'Chest/Shoulders', 'Back/Biceps'].includes(s.type);
      const duration = s.endTime ? (s.endTime - s.startTime) / 60000 : 0;
      return isLift && duration >= 30;
    }).length;

    // 2. Zone 2 Cardio: 2-3 sessions, 50-60 min
    const zone2Sessions = weeklySessions.filter(s => {
      const isCardio = s.type === 'Pure Cardio' || s.hasCardio;
      const duration = s.endTime ? (s.endTime - s.startTime) / 60000 : 0;
      // We assume Pure Cardio sessions > 45m are Zone 2 unless they are marked as HIIT
      return isCardio && duration >= 45;
    }).length;

    // 3. HIIT / VO2 Max: 1 session, ~30 min
    const hiitSessions = weeklySessions.filter(s => {
      const isCardio = s.type === 'Pure Cardio';
      const duration = s.endTime ? (s.endTime - s.startTime) / 60000 : 0;
      // Assume Cardio < 40m or specific HIIT templates are HIIT
      return isCardio && duration < 40 && duration >= 15;
    }).length;

    // 4. Daily Steps: 7k-10k
    // Count how many days this week met the step goal
    let stepDaysMet = 0;
    const dayKeys = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      dayKeys.push(d.toDateString());
    }
    
    dayKeys.forEach(key => {
      if ((dailySteps[key] || 0) >= 7000) stepDaysMet++;
    });

    return {
      heavy: { current: heavyLifts, target: 2 },
      zone2: { current: zone2Sessions, target: 2 }, // Target 2-3, we'll use 2 as baseline
      hiit: { current: hiitSessions, target: 1 },
      steps: { current: stepDaysMet, target: 7 } // Daily target, but shown as days met in week
    };
  };

  const calculateInsights = () => {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    const weeklySessions = history.filter(s => s.startTime >= startOfWeek.getTime());
    const weeklyVolume = weeklySessions.reduce((acc, s) => {
      return acc + s.exercises.reduce((exAcc, ex) => {
        return exAcc + ex.sets.reduce((setAcc, set) => setAcc + ((set.weight || 0) * (set.reps || 0)), 0);
      }, 0);
    }, 0);

    // PR Detection: Compare every set in last week to all-time before that week
    const lastWeekSessions = history.filter(s => s.startTime >= startOfWeek.getTime());
    const prs: string[] = [];

    lastWeekSessions.forEach(session => {
      session.exercises.forEach(ex => {
        const historyBefore = history.filter(s => s.startTime < startOfWeek.getTime());
        let maxWeightBefore = 0;
        historyBefore.forEach(s => {
          const pastEx = s.exercises.find(e => e.templateId === ex.templateId);
          if (pastEx) {
            pastEx.sets.forEach(set => {
              if ((set.weight || 0) > maxWeightBefore) maxWeightBefore = set.weight || 0;
            });
          }
        });

        const currentMax = Math.max(...ex.sets.map(s => s.weight || 0));
        if (currentMax > maxWeightBefore && maxWeightBefore > 0) {
          if (!prs.includes(ex.name)) prs.push(ex.name);
        }
      });
    });

    // Heatmap: Last 28 days
    const heatmap = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const ds = d.toDateString();
      const hasWorkout = history.some(s => new Date(s.startTime).toDateString() === ds);
      const hasSteps = (dailySteps[ds] || 0) >= 5000;
      heatmap.push({ date: d, active: hasWorkout || hasSteps });
    }

    let totalCardioSets = 0;
    let sumHeartRate = 0;
    let totalCardioTime = 0;
    const weeklyDistance = weeklySessions.reduce((acc, s) => {
      let sessionDistance = s.distance || 0;
      let sessionTime = s.endTime ? (s.endTime - s.startTime) / 1000 : 0;
      
      // If we have session level metrics (GF)
      if (s.avgHeartRate) {
        sumHeartRate += s.avgHeartRate;
        totalCardioSets++;
      }

      // Aggregate from sets if present
      const setsDistance = s.exercises.reduce((exAcc, ex) => {
        return exAcc + ex.sets.reduce((setAcc, set) => {
          if (set.heartRate) {
            sumHeartRate += set.heartRate;
            totalCardioSets++;
          }
          if (set.time) totalCardioTime += set.time;
          return setAcc + (set.distance || 0);
        }, 0);
      }, 0);

      if (setsDistance > 0) {
        return acc + setsDistance;
      } else {
        totalCardioTime += sessionTime;
        return acc + sessionDistance;
      }
    }, 0);

    const avgHeartRate = totalCardioSets > 0 ? Math.round(sumHeartRate / totalCardioSets) : 0;
    const avgSpeed = totalCardioTime > 0 ? (weeklyDistance / (totalCardioTime / 3600)) : 0;
    const efficiencyRatio = (avgHeartRate > 0 && avgSpeed > 0) ? (avgSpeed / avgHeartRate * 100).toFixed(2) : '0.00';

    const lastCardioSession = history.find(s => 
      s.type === 'Pure Cardio' || 
      s.exercises.some(e => e.templateId === 'card_v1' || e.templateId === 'card_v2' || e.templateId === 'card_v3')
    );
    const daysSinceCardio = lastCardioSession ? Math.floor((Date.now() - lastCardioSession.startTime) / (1000 * 60 * 60 * 24)) : 99;
    const shouldSuggestVO2 = daysSinceCardio > 4;

    return { weeklyVolume, weeklyDistance, avgHeartRate, avgSpeed, efficiencyRatio, prs, heatmap, daysSinceCardio, shouldSuggestVO2 };
  };

  const getAIAdvice = async (ex: ActiveExercise) => {
    if (isAnalyzing[ex.id]) return;
    setIsAnalyzing(prev => ({ ...prev, [ex.id]: true }));
    
    try {
      const hist = getExerciseHistory(ex.templateId);
      const dataStr = hist.map(h => `{date: ${new Date(h.date).toLocaleDateString()}, value: ${h.display}}`).join(', ');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this exercise data for "${ex.name}" and provide 1-2 sentences of specific coaching advice (plateau detection, progression tips, VO2 max optimization, or form cues). Data: [${dataStr}]. ${ex.targetSets ? `Goal: ${ex.targetSets} sets` : ''} ${ex.targetReps ? `of ${ex.targetReps} reps` : ''} ${ex.targetDuration ? `target ${formatTime(ex.targetDuration)}` : ''}. Keep it professional and concise.`,
      });
      
      setAiAdvice(prev => ({ ...prev, [ex.id]: response.text }));
    } catch (err) {
      console.error("AI Error:", err);
      setAiAdvice(prev => ({ ...prev, [ex.id]: "Unable to analyze at this moment. Keep pushing!" }));
    } finally {
      setIsAnalyzing(prev => ({ ...prev, [ex.id]: false }));
    }
  };

  const getSplitColor = (type: SessionType) => {
    switch (type) {
      case 'Lower Body': return 'bg-orange-500';
      case 'Chest/Shoulders': return 'bg-blue-500';
      case 'Back/Biceps': return 'bg-emerald-500';
      case 'Core': return 'bg-purple-500';
      case 'Pure Cardio': return 'bg-rose-500';
      default: return 'bg-slate-500';
    }
  };

  const getSplitTextColor = (type: SessionType) => {
    switch (type) {
      case 'Lower Body': return 'text-orange-600';
      case 'Chest/Shoulders': return 'text-blue-600';
      case 'Back/Biceps': return 'text-emerald-600';
      case 'Core': return 'text-purple-600';
      case 'Pure Cardio': return 'text-rose-600';
      default: return 'text-slate-600';
    }
  };

  const getBucketForSession = (s: WorkoutSession): 'Heavy' | 'Zone 2' | 'HIIT' | 'Other' => {
    const duration = s.endTime ? (s.endTime - s.startTime) / 60000 : 0;
    if (['Lower Body', 'Chest/Shoulders', 'Back/Biceps'].includes(s.type) && duration >= 30) return 'Heavy';
    if ((s.type === 'Pure Cardio' || s.hasCardio) && duration >= 45) return 'Zone 2';
    if (s.type === 'Pure Cardio' && duration < 40 && duration >= 15) return 'HIIT';
    return 'Other';
  };

  const DaySummaryModal = ({ dateStr, onClose }: { dateStr: string, onClose: () => void }) => {
    const sessionsOnDay = history.filter(s => new Date(s.startTime).toDateString() === dateStr);
    const stepsOnDay = dailySteps[dateStr] || 0;
    const date = new Date(dateStr);

    return (
      <div className="fixed inset-0 bg-slate-900/60 z-[80] backdrop-blur-md flex items-center justify-center p-4">
        <motion.div 
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col"
        >
          <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
            <div>
              <h3 className="text-xl font-bold text-slate-800 tracking-tight">{date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Daily Summary</p>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          
          <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
            {/* Steps Card */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white rounded-xl text-indigo-600 shadow-sm">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest mb-0.5">Total Movement</p>
                  <p className="text-2xl font-black text-slate-900">{stepsOnDay.toLocaleString()} <span className="text-xs font-bold text-slate-400">steps</span></p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Goal</p>
                <p className={`text-xs font-black ${stepsOnDay >= 10000 ? 'text-green-600' : 'text-slate-500'}`}>{Math.round((stepsOnDay/10000)*100)}%</p>
              </div>
            </div>

            {/* Sessions List */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Completed Blocks</h4>
              {sessionsOnDay.length > 0 ? (
                sessionsOnDay.map(s => {
                  const bucket = getBucketForSession(s);
                  return (
                    <div key={s.id} className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center justify-between hover:border-blue-500 transition-colors cursor-pointer group" onClick={() => { onClose(); setViewingPastSession(s); }}>
                      <div className="flex items-center gap-4">
                        <div className={`w-2 h-10 rounded-full ${getSplitColor(s.type)}`} />
                        <div>
                          <div className="flex items-center gap-2">
                             <h5 className="font-bold text-slate-800 text-sm">{s.name}</h5>
                             <span className="text-[8px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase">{bucket}</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {Math.round(((s.endTime || Date.now()) - s.startTime)/60000)}m
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                  );
                })
              ) : (
                <p className="text-xs text-slate-400 italic text-center py-4">No workout sessions recorded for this day.</p>
              )}
            </div>
          </div>
        </motion.div>
      </div>
    );
  };

  const SessionDetailModal = ({ session: s, onClose }: { session: WorkoutSession, onClose: () => void }) => (
    <div className="fixed inset-0 bg-slate-900/60 z-[80] backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold text-white uppercase tracking-wider ${getSplitColor(s.type)}`}>
                {s.type}
              </span>
              {s.hasCardio && <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-white uppercase tracking-wider">Cardio</span>}
            </div>
            <h3 className="text-xl font-bold text-slate-800">{new Date(s.startTime).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</h3>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {s.calories !== undefined && (
              <div className="bg-orange-50 p-4 rounded-2xl border border-orange-100">
                <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest mb-1">Calories Burned</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900">{Math.round(s.calories)}</span>
                  <span className="text-xs font-bold text-slate-400">kcal</span>
                </div>
              </div>
            )}
            {s.avgHeartRate !== undefined && (
              <div className="bg-rose-50 p-4 rounded-2xl border border-rose-100">
                <p className="text-[10px] font-black text-rose-600 uppercase tracking-widest mb-1">Avg Heart Rate</p>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-slate-900">{Math.round(s.avgHeartRate)}</span>
                  <span className="text-xs font-bold text-slate-400">bpm</span>
                </div>
              </div>
            )}
          </div>

          {s.exercises.map(ex => (
            <div key={ex.id} className="space-y-3">
              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{ex.name}</h4>
                  {ex.notes && <p className="text-[10px] text-slate-400 italic mt-0.5">{ex.notes}</p>}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-[10px] text-slate-400 font-bold uppercase">{ex.category}</p>
                  {ex.videoUrl && (
                    <a 
                      href={ex.videoUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-[8px] font-black text-blue-600 uppercase tracking-widest hover:underline"
                    >
                      Coaching Video
                    </a>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ex.sets.map((set, idx) => (
                  <div key={set.id} className="flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg text-xs border border-slate-100">
                    <span className="font-bold text-slate-400">S{idx+1}</span>
                    <div className="flex gap-2 font-medium text-slate-700">
                      {set.weight !== undefined && set.weight > 0 && <span>{set.weight} lb</span>}
                      {set.reps !== undefined && set.reps > 0 && <span>{set.reps} reps</span>}
                      {set.time !== undefined && set.time > 0 && <span>{formatTime(set.time)}</span>}
                      {set.distance !== undefined && set.distance > 0 && <span>{set.distance} mi</span>}
                      {set.heartRate !== undefined && set.heartRate > 0 && <span>{set.heartRate} bpm</span>}
                      {set.speed !== undefined && set.speed > 0 && <span>{set.speed} mph</span>}
                    </div>
                  </div>
                ))}
                {ex.sets.length === 0 && <p className="text-[10px] text-slate-400 italic">No sets recorded.</p>}
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );

  const PendingWorkoutsModal = () => (
    <div className="fixed inset-0 bg-slate-900/60 z-[90] backdrop-blur-md flex items-center justify-center p-4">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="bg-white rounded-3xl w-full max-w-lg shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div>
            <h3 className="text-xl font-bold text-slate-800 tracking-tight">Unlogged Activities</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Detected from your Google Fit Sync</p>
          </div>
          <button onClick={() => setPendingWorkouts([])} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {pendingWorkouts.map(w => (
            <div key={w.id} className="bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-4">
              <div className="flex justify-between items-start">
                <div>
                  <h4 className="font-bold text-slate-800">{w.name || 'External Workout'}</h4>
                  <p className="text-[10px] text-slate-400">{new Date(w.startTime).toLocaleString()} • {Math.round((w.endTime - w.startTime)/60000)} min</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black text-rose-500">{Math.round(w.calories)} kcal</p>
                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{Math.round(w.avgHeartRate)} bpm avg</p>
                </div>
              </div>
              
              <div className="grid grid-cols-3 gap-2">
                {(['Heavy', 'Zone 2', 'HIIT'] as const).map(bucket => (
                  <button 
                    key={bucket}
                    onClick={() => importUnmatchedWorkout(w, bucket)}
                    className="py-2 bg-white border border-slate-200 hover:border-blue-500 hover:text-blue-600 rounded-xl text-[10px] font-black uppercase transition-all"
                  >
                    {bucket}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6 bg-slate-50 border-t border-slate-100">
           <button 
            onClick={() => setPendingWorkouts([])}
            className="w-full py-4 text-slate-500 font-bold hover:bg-white rounded-2xl border border-transparent hover:border-slate-200 transition-all text-sm"
           >
             Dismiss All
           </button>
        </div>
      </motion.div>
    </div>
  );

  const PlansView = () => {
    return (
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="flex justify-between items-end">
          <div>
            <h2 className="text-3xl font-black text-slate-900 tracking-tight">Structured Plans</h2>
            <p className="text-slate-500 font-medium tracking-tight">Scientifically back progressions for elite performance.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {PROGRESSION_PLANS.map(plan => {
            const isActive = activePlanId === plan.id;
            const details = getCurrentPlanDetails();
            
            return (
              <div key={plan.id} className={`bg-white rounded-[2rem] p-8 border-2 transition-all ${isActive ? 'border-blue-600 shadow-xl shadow-blue-50' : 'border-slate-100'}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className={`p-3 rounded-2xl ${isActive ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
                    <Dumbbell className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900 leading-tight">{plan.name}</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{plan.durationWeeks} Weeks</p>
                  </div>
                </div>
                <p className="text-sm text-slate-500 font-medium mb-6 leading-relaxed">{plan.description}</p>
                
                {isActive && details ? (
                  <div className="bg-blue-50 rounded-2xl p-4 mb-6 border border-blue-100">
                    <div className="flex justify-between items-center mb-2">
                       <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Active Progress</span>
                       <span className="text-xs font-black text-blue-700">Week {details.weekIndex + 1} of {plan.durationWeeks}</span>
                    </div>
                    <div className="w-full bg-blue-100 h-2 rounded-full overflow-hidden">
                       <div className="bg-blue-600 h-full" style={{ width: `${((details.weekIndex + 1) / plan.durationWeeks) * 100}%` }}></div>
                    </div>
                    <p className="mt-3 text-xs font-bold text-blue-800">Current Focus: {details.weekData.focus}</p>
                  </div>
                ) : null}

                <div className="flex gap-3">
                  {!isActive ? (
                    <button 
                      onClick={() => {
                        setActivePlanId(plan.id);
                        setPlanStartDate(Date.now());
                        setCurrentView('Dashboard');
                      }}
                      className="flex-1 bg-slate-900 text-white font-black py-4 rounded-xl text-sm transition-all hover:bg-blue-600"
                    >
                      Initialize Plan
                    </button>
                  ) : (
                    <button 
                      onClick={() => {
                        setActivePlanId(null);
                        setPlanStartDate(null);
                      }}
                      className="flex-1 bg-slate-100 text-slate-400 font-black py-4 rounded-xl text-sm transition-all hover:bg-rose-50 hover:text-rose-600"
                    >
                      Terminate Plan
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const CalendarView = () => {
    const startOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
    const endOfMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
    const startDay = startOfMonth.getDay();
    const daysInMonth = endOfMonth.getDate();
    
    const prevMonth = () => {
      const d = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
      d.setMonth(d.getMonth() - 1);
      
      const limit = new Date();
      limit.setMonth(limit.getMonth() - 3);
      limit.setDate(1);
      
      if (d >= limit) {
        setCalendarMonth(d);
      }
    };
    
    const nextMonth = () => {
      const d = new Date(calendarMonth);
      d.setMonth(d.getMonth() + 1);
      setCalendarMonth(d);
    };

    const days = [];
    for (let i = 0; i < startDay; i++) {
       days.push(<div key={`pad-${i}`} className="h-24 bg-slate-50/20 border border-slate-100/50" />);
    }
       for (let day = 1; day <= daysInMonth; day++) {
        const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
        const dateStr = date.toDateString();
        const sessionsOnDay = history.filter(s => new Date(s.startTime).toDateString() === dateStr);
        const stepsOnDay = dailySteps[dateStr] || 0;
        const isToday = new Date().toDateString() === dateStr;

        days.push(
          <div 
            key={day} 
            onClick={() => setViewingDayDetails(dateStr)}
            className={`h-24 p-2 border border-slate-100 relative group overflow-hidden bg-white hover:bg-slate-50 transition-colors cursor-pointer ${isToday ? 'bg-blue-50/10' : ''}`}
          >
            <div className="flex justify-between items-start">
              <span className={`text-[10px] font-bold ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{day}</span>
              {stepsOnDay > 0 && (
                <div className="flex items-center gap-0.5 text-[7px] font-black text-indigo-500 bg-indigo-50 px-1 rounded">
                  <Activity className="w-1.5 h-1.5" />
                  {(stepsOnDay/1000).toFixed(1)}k
                </div>
              )}
            </div>
            
            <div className="mt-1 flex flex-wrap gap-1">
              {sessionsOnDay.map(s => {
                const bucket = getBucketForSession(s);
                return (
                  <div 
                    key={s.id}
                    title={`${s.name} (${bucket})`}
                    className={`w-1.5 h-1.5 rounded-full ${getSplitColor(s.type)}`}
                  />
                );
              })}
            </div>
            
            <div className="mt-1 space-y-0.5">
              {sessionsOnDay.slice(0, 2).map(s => (
                <div 
                  key={s.id}
                  className={`text-[6px] font-bold text-white px-1 py-0.5 rounded truncate leading-none ${getSplitColor(s.type)}`}
                >
                  {s.type.split('/')[0]}
                </div>
              ))}
              {sessionsOnDay.length > 2 && <p className="text-[6px] text-slate-300 font-bold">+{sessionsOnDay.length - 2} more</p>}
            </div>
          </div>
        );
      }

    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Activity Graph</h2>
            <p className="text-sm text-slate-500 mt-1 font-medium italic">Visualization of the last 90 days.</p>
          </div>
          <div className="flex items-center gap-2 bg-white p-1 rounded-xl border border-slate-200 self-start sm:self-auto">
            <button 
              onClick={prevMonth} 
              disabled={(() => {
                const limit = new Date();
                limit.setMonth(limit.getMonth() - 3);
                limit.setDate(1);
                const current = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
                return current <= limit;
              })()}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-bold text-slate-700 min-w-[120px] text-center">
              {calendarMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 disabled:opacity-30" disabled={calendarMonth >= new Date()}><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-1 shadow-2xl shadow-slate-200/50 overflow-hidden">
          <div className="grid grid-cols-7 bg-slate-50/50 border-b border-slate-100">
             {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
               <div key={`${d}-${i}`} className="text-center py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">{d}</div>
             ))}
          </div>
          <div className="grid grid-cols-7">
            {days}
          </div>
        </div>
      </motion.div>
    );
  };

  return (
    <div id="app-root" className="bg-slate-50 text-slate-900 font-sans min-h-screen flex flex-col overflow-hidden">
      {/* Header */}
      <header id="app-header" className="h-16 bg-white border-b border-slate-200 px-4 md:px-6 flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="md:hidden p-2 -ml-2 text-slate-500"
          >
            <LayoutDashboard className="w-5 h-5" />
          </button>
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold shadow-sm shadow-blue-200">F</div>
          <h1 className="text-lg md:text-xl font-bold tracking-tight text-slate-800 uppercase">FORGE</h1>
        </div>
        
        <div className="hidden lg:flex items-center bg-slate-100 p-1 rounded-lg">
          {(['Full Gym', 'Travel', 'Bodyweight'] as EquipmentMode[]).map(mode => (
            <button
              key={mode}
              onClick={() => setEquipmentMode(mode)}
              className={`px-4 py-1.5 text-xs font-bold rounded-md transition-all ${equipmentMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              {mode}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <div className="text-right hidden sm:block">
            <p className="text-xs font-bold text-slate-900">Alex Johnson</p>
            <p className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">{equipmentMode}</p>
          </div>
          <button 
            onClick={() => setShowAddCustom(true)}
            className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center hover:bg-white transition-colors"
          >
            <Settings2 className="w-5 h-5 text-slate-500" />
          </button>
        </div>
      </header>

      {/* Timer Bar (Active Only) - Sticky at top of viewport for focus */}
      <AnimatePresence>
        {(session || intervalMode !== 'none') && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="sticky top-0 bg-slate-900 text-white px-4 py-3 border-b border-slate-800 z-[60] flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-2xl"
          >
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Session Timer</span>
                  <span className="text-sm font-mono font-bold leading-none">{formatTime(totalSeconds)}</span>
                </div>
                <button 
                  onClick={() => setTimerRunning(!timerRunning)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  title={timerRunning ? "Pause" : "Resume"}
                >
                  {timerRunning ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                </button>
              </div>

              {intervalMode === 'none' && isResting && (
                <div className="flex items-center gap-3 pl-6 border-l border-slate-700">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest leading-none mb-1">Auto-Rest</span>
                    <span className="text-sm font-mono font-bold leading-none text-blue-400">{formatTime(restSeconds)}</span>
                  </div>
                  <button 
                    onClick={stopRest}
                    className="p-1.5 px-3 bg-blue-600 rounded-lg text-[10px] font-bold uppercase hover:bg-blue-700 transition-colors"
                  >
                    Skip
                  </button>
                </div>
              )}

              {intervalMode === '4x4' && (
                <div className="flex items-center gap-6 pl-6 border-l border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-amber-500 uppercase tracking-[0.2em] mb-1">VO2 Max Block</span>
                    <span className="text-xs font-black text-white uppercase">{VO2_MAX_SEGMENTS[intervalSegment].name}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Interval Time</span>
                    <span className={`text-xl font-mono font-black ${VO2_MAX_SEGMENTS[intervalSegment].type === 'work' ? 'text-amber-500' : 'text-emerald-400'}`}>
                      {formatTime(intervalTimeLeft)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    {VO2_MAX_SEGMENTS.map((_, i) => (
                      <div key={i} className={`w-3 h-1 rounded-full ${i < intervalSegment ? 'bg-amber-500' : i === intervalSegment ? 'bg-white animate-pulse' : 'bg-slate-700'}`} />
                    ))}
                  </div>
                </div>
              )}

              {intervalMode === 'fallback' && (
                <div className="flex items-center gap-6 pl-6 border-l border-white/10">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Fallback 6-Min Block</span>
                    <span className="text-xs font-black text-white uppercase">
                      {intervalSegment % 2 === 0 ? FALLBACK_MOVEMENTS[Math.floor(intervalSegment/2)].name : 'Transition'}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest mb-1">Time Left</span>
                    <span className={`text-xl font-mono font-black ${intervalSegment % 2 === 0 ? 'text-indigo-400' : 'text-emerald-400'}`}>
                      {formatTime(intervalTimeLeft)}
                    </span>
                  </div>
                  <div className="text-[10px] font-black text-slate-500">
                    MOVE {Math.floor(intervalSegment/2) + 1} / 6
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {session && (
                <>
                   <span className="text-[10px] font-bold text-slate-500 uppercase hidden lg:block tracking-widest">{session.name}</span>
                   <button 
                    onClick={finishSession}
                    className="bg-red-600 hover:bg-red-700 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest transition-all shadow-lg shadow-red-900/20"
                  >
                    Finish Session
                  </button>
                </>
              )}
              {intervalMode !== 'none' && !session && (
                <button 
                  onClick={() => {
                    setIntervalMode('none');
                    setTimerRunning(false);
                  }}
                  className="bg-white/10 hover:bg-white/20 text-white text-[10px] font-black px-4 py-2 rounded-xl uppercase tracking-widest transition-all"
                >
                  Exit Workout
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <main className="flex-1 flex overflow-hidden relative">
        {/* Sidebar - responsive overlay on mobile */}
        <aside className={`
          fixed inset-y-0 left-0 w-72 bg-white border-r border-slate-200 z-40 transition-transform duration-300 md:relative md:translate-x-0
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          flex flex-col shrink-0
        `}>
          <div className="p-5 md:hidden flex justify-end">
            <button onClick={() => setSidebarOpen(false)} className="p-2 -mr-2">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>

          <div className="p-5">
            {!session && (
              <button 
                onClick={() => setShowBuilder(true)}
                className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 group"
              >
                <Zap className="w-4 h-4 group-hover:animate-pulse" />
                New Session
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4">
            <div className="flex flex-col gap-1 mb-6">
              <button 
                onClick={() => {
                  setCurrentView('Dashboard');
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'Dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </button>
              <button 
                onClick={() => {
                  setCurrentView('Calendar');
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'Calendar' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <History className="w-4 h-4" /> Calendar
              </button>

              <button 
                onClick={() => {
                  setCurrentView('Plans');
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'Plans' ? 'bg-rose-50 text-rose-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <BookOpen className="w-4 h-4" /> Training Plans
              </button>
            </div>

            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-bold px-1 mb-4">History</p>
            <div className="space-y-3 pb-8">
              {history.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-slate-400 italic">No activity recorded.</p>
                </div>
              ) : history.map(h => (
                <button 
                  key={h.id} 
                  onClick={() => setViewingPastSession(h)}
                  className="w-full text-left bg-slate-50 border border-slate-100 rounded-lg p-3 group hover:border-blue-200 hover:bg-white transition-all"
                >
                  <div className="flex justify-between items-start">
                    <p className={`text-xs font-bold ${getSplitTextColor(h.type)}`}>{h.name}</p>
                    <CheckCircle2 className="w-3 h-3 text-green-500" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1">{new Date(h.startTime).toLocaleDateString()} • {h.exercises.length} Exercises</p>
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Split Status</span>
                <span className="text-[10px] font-bold text-blue-600">{history.length % 4} / 4</span>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className={`h-1.5 w-full rounded-full ${(history.length % 4) > i ? 'bg-blue-600' : 'bg-slate-200'}`} />
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2 border-t border-slate-200/50">
              <button 
                onClick={exportData}
                title="Full Backup (History + Exercises)"
                className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mb-1" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Backup</span>
              </button>

              <button 
                onClick={exportLibrary}
                title="Export Exercises Only (Safe to Share)"
                className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <Database className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mb-1" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Library</span>
              </button>
              
              <label className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group cursor-pointer text-center">
                <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mb-1" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Restore</span>
                <input type="file" accept=".json" onChange={importData} className="hidden" />
              </label>
            </div>
          </div>
        </aside>

        {/* Mobile Backdrop */}
        {sidebarOpen && (
          <div 
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/40 z-30 md:hidden backdrop-blur-sm"
          />
        )}

        {/* Dynamic Content Area */}
        <div className="flex-1 overflow-y-auto bg-slate-50/30 p-4 md:p-8">
          {currentView === 'Calendar' ? (
            <CalendarView />
          ) : currentView === 'Plans' ? (
            <PlansView />
          ) : session ? (
            <div className="max-w-4xl mx-auto space-y-6 md:space-y-8">
              <div className="flex flex-col sm:flex-row sm:justify-between sm:items-end gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded uppercase tracking-wider">Active</span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-slate-100 px-2 py-0.5 rounded">Target: {session.estimatedDuration}m</span>
                  </div>
                  <h2 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight">{session.type} Block</h2>
                </div>
                <div className="flex gap-2 sm:gap-4">
                  <button 
                    onClick={() => setShowLibrary(true)}
                    className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-slate-400 text-slate-600 font-bold px-4 py-2.5 rounded-xl transition-all flex items-center justify-center gap-2 text-sm"
                  >
                    <BookOpen className="w-4 h-4" /> Swap/Add
                  </button>
                </div>
              </div>

              {(['Mobility', 'Posture', 'Resistance', 'Cardio'] as ExerciseCategory[]).map(cat => {
                const group = session.exercises.filter(e => e.category === cat);
                if (group.length === 0) return null;
                
                return (
                  <section key={cat} className="space-y-4">
                    <div className="flex items-center gap-4">
                      <h3 className="text-[10px] uppercase tracking-[0.2em] font-bold text-slate-400 shrink-0">{cat}</h3>
                      <div className="h-[1px] flex-1 bg-slate-200"></div>
                      <div className="flex items-center gap-4">
                        <span className="text-[10px] font-bold text-slate-400 shrink-0">
                          {cat === 'Mobility' ? '10m' : cat === 'Posture' ? '5m' : cat === 'Cardio' ? '20-30m' : '25-45m'}
                        </span>
                        <button 
                          onClick={() => {
                            setAddingToCategory(cat);
                            setShowLibrary(true);
                          }}
                          className="flex items-center gap-1 text-[10px] font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-2 py-1 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" /> Add
                        </button>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-4">
                      {group.map(ex => {
                          const isExpanded = expandedHistoryExId === ex.id;
                          const exHistory = getExerciseHistory(ex.templateId);
                          
                          return (
                            <motion.div 
                              layout
                              key={ex.id}
                              onClick={() => setExpandedHistoryExId(isExpanded ? null : ex.id)}
                              className={`bg-white border border-slate-200 rounded-2xl p-4 md:p-5 shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden cursor-pointer ${isExpanded ? 'ring-2 ring-blue-500/20 md:col-span-2' : ''}`}
                            >
                              <div className="flex justify-between items-start mb-4">
                                <div className="max-w-[85%]">
                                  <h4 className="font-bold text-slate-800 text-base md:text-lg group-hover:text-blue-600 transition-colors truncate">{ex.name}</h4>
                                  <div className="flex items-center gap-2 mt-1">
                                    <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                                      Goal: {ex.targetSets} Sets 
                                      {ex.targetReps ? ` × ${ex.targetReps}${typeof ex.targetReps === 'number' ? ' Reps' : ''}` : ''}
                                      {ex.targetDuration ? ` × ${formatTime(ex.targetDuration)}` : ''}
                                      {ex.targetRest && <span className="text-slate-300 mx-1">|</span>}
                                      {ex.targetRest && `Rest: ${ex.targetRest}s`}
                                    </p>
                                    <span className="text-slate-300">•</span>
                                    <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">{ex.sets.length} / {ex.targetSets} Work</p>
                                  </div>
                                  {ex.category === 'Cardio' && intervalMode === 'none' && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        start4x4Session();
                                      }}
                                      className="mt-3 flex items-center gap-2 bg-amber-50 text-amber-600 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-amber-100 transition-all border border-amber-100 group shadow-sm"
                                    >
                                      <Zap className="w-3 h-3 fill-current group-hover:scale-125 transition-transform" />
                                      Begin 4x4 Protocol
                                    </button>
                                  )}
                                  {(ex.notes || ex.videoUrl) && (
                                    <div className="mt-3 flex flex-wrap gap-3 items-center">
                                      {ex.notes && (
                                        <p className="text-[10px] text-slate-500 font-medium italic border-l-2 border-blue-200 pl-2 leading-relaxed">
                                          {ex.notes}
                                        </p>
                                      )}
                                      {ex.videoUrl && (
                                        <a 
                                          href={ex.videoUrl} 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          onClick={(e) => e.stopPropagation()}
                                          className="flex items-center gap-1.5 bg-blue-50 text-blue-600 px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest hover:bg-blue-100 transition-colors"
                                        >
                                          <Play className="w-2.5 h-2.5 fill-current" /> Coaching Video
                                        </a>
                                      )}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSwappingExId(ex.id);
                                      setShowLibrary(true);
                                    }}
                                    className="text-slate-300 hover:text-blue-500 transition-colors p-1"
                                    title="Swap Exercise"
                                  >
                                    <RefreshCw className="w-3.5 h-3.5" />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const newSession = {...session};
                                      newSession.exercises = newSession.exercises.filter(e => e.id !== ex.id);
                                      setSession(newSession);
                                    }}
                                    className="text-slate-300 hover:text-red-400 transition-colors p-1"
                                    title="Remove"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div 
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="mb-4 overflow-hidden"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-4 rounded-xl border border-slate-100 mb-4">
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Performance Trend (Last 50 Sets)</p>
                                        <div className="h-40 w-full">
                                          {exHistory.length > 1 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                              <AreaChart data={exHistory}>
                                                <defs>
                                                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                                                    <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                                                    </linearGradient>
                                                  </defs>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                <XAxis hide dataKey="date" />
                                                <YAxis hide domain={['auto', 'auto']} />
                                                <Tooltip 
                                                  content={({ active, payload }) => {
                                                    if (active && payload && payload.length) {
                                                      return (
                                                        <div className="bg-white p-2 border border-slate-200 rounded shadow-lg text-[10px] font-bold">
                                                          {payload[0].payload.display}
                                                        </div>
                                                      );
                                                    }
                                                    return null;
                                                  }}
                                                />
                                                <Area type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={2} fillOpacity={1} fill="url(#colorValue)" />
                                              </AreaChart>
                                            </ResponsiveContainer>
                                          ) : (
                                            <div className="h-full flex items-center justify-center text-[10px] text-slate-400 italic">
                                              Insufficient data for trends.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                      
                                      <div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Last 5 Logs</p>
                                        <div className="space-y-1.5">
                                          {exHistory.slice(-5).reverse().map((h, i) => (
                                            <div key={i} className="flex justify-between items-center text-[10px] bg-white p-2 rounded border border-slate-100 font-medium">
                                              <span className="text-slate-400">{new Date(h.date).toLocaleDateString()}</span>
                                              <span className="text-blue-600 font-bold">{h.display}</span>
                                            </div>
                                          ))}
                                          {exHistory.length === 0 && <p className="text-[10px] text-slate-400 italic">No history available.</p>}
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row gap-4">
                                      <button 
                                        onClick={() => getAIAdvice(ex)}
                                        disabled={isAnalyzing[ex.id]}
                                        className="flex-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 group border border-blue-100"
                                      >
                                        <Sparkles className={`w-4 h-4 ${isAnalyzing[ex.id] ? 'animate-spin' : 'group-hover:scale-110 transition-transform'}`} />
                                        {isAnalyzing[ex.id] ? "Analyzing Trends..." : "AI Coach Advice"}
                                      </button>
                                      {aiAdvice[ex.id] && (
                                        <motion.div 
                                          initial={{ opacity: 0, x: 10 }}
                                          animate={{ opacity: 1, x: 0 }}
                                          className="flex-2 bg-slate-900 text-white p-4 rounded-xl text-xs leading-relaxed relative"
                                        >
                                          <div className="absolute -top-2 left-4 w-4 h-4 bg-slate-900 rotate-45" />
                                          <p className="relative z-10"><span className="text-blue-400 font-bold mr-1">COACH:</span> {aiAdvice[ex.id]}</p>
                                        </motion.div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>

                              <div className="space-y-2 mb-4">
                                {ex.sets.map((set, idx) => (
                                  <div key={set.id} className="flex items-center gap-2 md:gap-3 bg-slate-50 p-2 md:p-2.5 rounded-lg border border-slate-100 text-xs md:text-sm font-medium text-slate-600">
                                    <span className="w-5 text-[10px] font-bold text-slate-400">S{idx+1}</span>
                                    <div className="flex gap-2 flex-wrap">
                                      {set.weight !== undefined && set.weight > 0 && <span>{set.weight} lb</span>}
                                      {set.reps !== undefined && set.reps > 0 && <span>{set.reps} reps</span>}
                                      {set.time !== undefined && set.time > 0 && <span>{formatTime(set.time)}</span>}
                                      {set.distance !== undefined && set.distance > 0 && <span>{set.distance} mi</span>}
                                      {set.heartRate !== undefined && set.heartRate > 0 && <span>{set.heartRate} bpm</span>}
                                    </div>
                                    <CheckCircle2 className="w-4 h-4 text-green-500 ml-auto shrink-0" />
                                  </div>
                                ))}
                              </div>

                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  initiateAddSet(ex.id);
                                }}
                                className="w-full py-3 bg-slate-50 hover:bg-blue-600 hover:text-white border border-slate-200 rounded-xl text-[10px] md:text-xs font-bold text-slate-600 flex items-center justify-center gap-2 transition-all"
                              >
                                <Plus className="w-3 h-3" /> Mark Performance Set
                              </button>
                            </motion.div>
                          );
                        })}
                    </div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="max-w-6xl mx-auto space-y-8">
              {(() => {
                const insights = calculateInsights();
                const buckets = calculateFourBucketProgress();
                const todayKey = new Date().toDateString();
                const todaySteps = dailySteps[todayKey] || 0;

                return (
                  <>
                    {/* Performance Buckets Widget */}
                    <div className="grid grid-cols-4 gap-2 md:gap-4">
                      {[
                        { label: 'Heavy', icon: <Dumbbell className="w-3 h-3 md:w-4 md:h-4" />, data: buckets.heavy, color: 'text-blue-600', bg: 'bg-blue-50' },
                        { label: 'Zone 2', icon: <Activity className="w-3 h-3 md:w-4 md:h-4" />, data: buckets.zone2, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                        { label: 'HIIT', icon: <Zap className="w-3 h-3 md:w-4 md:h-4" />, data: buckets.hiit, color: 'text-amber-600', bg: 'bg-amber-50' },
                        { label: 'Steps', icon: <TrendingUp className="w-3 h-3 md:w-4 md:h-4" />, data: buckets.steps, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                      ].map((b, i) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          key={b.label} 
                          className="bg-white border border-slate-100 p-2.5 md:p-5 rounded-2xl md:rounded-[2rem] shadow-sm flex flex-col justify-between"
                        >
                          <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-2 md:mb-4 gap-1">
                            <div className={`w-fit p-1.5 ${b.bg} ${b.color} rounded-lg`}>{b.icon}</div>
                            <span className="text-[7px] md:text-[9px] font-black uppercase tracking-tighter md:tracking-widest text-slate-400">{b.label}</span>
                          </div>
                          <div>
                            <div className="flex items-baseline gap-0.5 md:gap-1">
                              <span className="text-sm md:text-2xl font-black text-slate-900">{b.data.current}</span>
                              <span className="text-[8px] md:text-xs font-bold text-slate-300">/{b.data.target}</span>
                            </div>
                          </div>
                        </motion.div>
                      ))}
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                      {insights.shouldSuggestVO2 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="flex-1 bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl">
                              <Activity className="w-5 h-5" />
                            </div>
                            <div>
                              <h3 className="font-black text-slate-900 tracking-tight">Performance Insight</h3>
                              <p className="text-xs text-slate-500 font-medium leading-relaxed max-w-lg">
                                It's been {insights.daysSinceCardio} days since your last intensity block. Intervals are suggested to maintain your aerobic ceiling.
                              </p>
                            </div>
                          </div>
                          <button 
                            onClick={() => {
                              startNewSession('Pure Cardio', true);
                              setShowBuilder(false);
                            }}
                            className="w-full md:w-auto border border-slate-200 text-slate-900 px-6 py-3 rounded-xl font-black text-xs hover:bg-slate-50 transition-all"
                          >
                            Add Interval Session
                          </button>
                        </motion.div>
                      )}

                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-sm flex items-center justify-between gap-6"
                      >
                        <div className="flex items-center gap-4">
                          <div className={`p-3 rounded-2xl ${isGoogleConnected ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                            <TrendingUp className="w-5 h-5" />
                          </div>
                          <div>
                            <h3 className="font-black text-slate-900 tracking-tight">Daily Steps</h3>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-slate-500 font-bold uppercase tracking-widest">{todaySteps.toLocaleString()} / 10,000</p>
                              {isGoogleConnected && <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" title="Google Fit Connected" />}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button 
                            onClick={() => {
                              setStepInput(todaySteps > 0 ? todaySteps.toString() : '');
                              setShowStepLogger(true);
                            }}
                            className="bg-slate-100 text-slate-600 px-4 py-3 rounded-xl font-bold text-xs hover:bg-slate-200 transition-all"
                          >
                            Log
                          </button>
                          <button 
                            onClick={isGoogleConnected ? handleSyncFit : handleConnectFit}
                            disabled={isSyncing}
                            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-black text-xs transition-all shadow-lg ${isGoogleConnected ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-slate-200'}`}
                          >
                            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                            {isGoogleConnected ? 'Sync Fit' : 'Connect Fit'}
                          </button>
                        </div>
                      </motion.div>
                    </div>

                    {/* Forge Insights Bento Dashboard */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Main Hero Card */}
                    <div className="flex flex-col lg:flex-row gap-6">
                      <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex-1 bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between relative overflow-hidden group"
                      >
                        <div className="absolute top-0 right-0 -mr-12 -mt-12 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl group-hover:scale-110 transition-transform duration-1000"></div>
                        <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-6">
                            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
                              <ZapIcon className="w-6 h-6 fill-current" />
                            </div>
                            <span className="text-xs font-black text-blue-600 uppercase tracking-widest">Active Status</span>
                          </div>
                          <h2 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight mb-4 tracking-tighter">Forge Your Strength.</h2>
                          <p className="text-slate-500 text-lg max-w-md leading-relaxed mb-10">
                            Your persistence is being calculated. Initialize your next training block to continue the progression.
                          </p>
                          <div className="flex flex-wrap gap-4">
                            <button 
                              onClick={() => setShowBuilder(true)}
                              className="bg-slate-900 text-white font-bold py-5 px-10 rounded-2xl shadow-xl hover:bg-blue-600 hover:-translate-y-1 transition-all flex items-center gap-3 w-full sm:w-auto"
                            >
                              <Play className="w-4 h-4 fill-current" /> Begin Next Session
                            </button>
                            <button 
                              onClick={startFallbackWorkout}
                              className="bg-white text-slate-600 border border-slate-200 font-bold py-5 px-10 rounded-2xl hover:bg-slate-50 transition-all flex items-center gap-3 w-full sm:w-auto"
                            >
                              <RotateCcw className="w-4 h-4" /> 6-Min Fallback
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    </div>

                {/* Tracking Stats */}
                <div className="space-y-6">
                  {(() => {
                    const insights = calculateInsights();
                    return (
                      <>
                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.1 }}
                          className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-xl shadow-slate-100"
                        >
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Weekly Volume</span>
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><TrendingUp className="w-4 h-4" /></div>
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-3xl font-black text-slate-900">{insights.weeklyVolume.toLocaleString()}</span>
                            <span className="text-xs font-bold text-slate-400 uppercase">lb moved</span>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Total cumulative weight across all resistance blocks this week.</p>
                        </motion.div>

                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.15 }}
                          className="bg-white border border-slate-100 rounded-[2rem] p-6 shadow-xl shadow-slate-100"
                        >
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Aerobic Engine</span>
                            <div className="p-2 bg-rose-50 text-rose-600 rounded-lg"><Heart className="w-4 h-4" /></div>
                          </div>
                          <div className="space-y-4">
                            <div className="flex items-baseline justify-between">
                              <div className="flex items-baseline gap-2">
                                <span className="text-3xl font-black text-slate-900">{insights.weeklyDistance.toFixed(1)}</span>
                                <span className="text-xs font-bold text-slate-400 uppercase">mi total</span>
                              </div>
                              <div className="text-right">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Efficiency Index</p>
                                <p className="text-sm font-black text-blue-600">{insights.efficiencyRatio}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em] mb-0.5">Avg HR</p>
                                <p className="text-sm font-black text-slate-800">{insights.avgHeartRate > 0 ? `${insights.avgHeartRate} bpm` : '--'}</p>
                              </div>
                              <div className="flex-1 bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-[0.1em] mb-0.5">Avg Speed</p>
                                <p className="text-sm font-black text-emerald-600">{insights.avgSpeed > 0 ? `${insights.avgSpeed.toFixed(1)} mph` : '--'}</p>
                              </div>
                            </div>
                          </div>
                          <p className="text-[10px] text-slate-400 mt-3 font-medium italic">Efficiency Index: Tracking your heart rate vs output (speed/weight) over 12 weeks.</p>
                        </motion.div>

                        <motion.div 
                          initial={{ opacity: 0, x: 20 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: 0.2 }}
                          className="bg-slate-900 rounded-[2rem] p-6 shadow-xl"
                        >
                          <div className="flex justify-between items-center mb-4">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consistency Heatmap</span>
                            <TrendingUp className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="grid grid-cols-7 gap-1.5">
                            {insights.heatmap.map((d, i) => (
                              <div 
                                key={i} 
                                title={d.date.toDateString()}
                                className={`aspect-square rounded-sm border ${d.active ? 'bg-blue-500 border-blue-400' : 'bg-slate-800 border-slate-700'}`} 
                              />
                            ))}
                          </div>
                          <p className="text-[9px] text-slate-500 mt-4 uppercase tracking-widest font-black">28-Day Activity Burst</p>
                        </motion.div>
                      </>
                    );
                  })()}
                </div>
              </div>

              {/* Second Row Bento */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.3 }}
                   className="md:col-span-1 bg-white border border-slate-100 rounded-[2rem] p-8 shadow-xl shadow-slate-100"
                >
                  <div className="flex items-center gap-3 mb-6 font-black text-[10px] uppercase tracking-widest text-slate-400">
                    <Award className="w-4 h-4 text-orange-500" /> Recent PR Alerts
                  </div>
                  <div className="space-y-3">
                    {(() => {
                      const insights = calculateInsights();
                      if (insights.prs.length === 0) return <p className="text-xs text-slate-400 italic">No PRs detected this week. Keep pushing!</p>;
                      return insights.prs.map((p, i) => (
                        <div key={i} className="flex items-center justify-between p-3 bg-orange-50 rounded-xl border border-orange-100">
                          <span className="text-sm font-bold text-slate-800">{p}</span>
                          <span className="text-[10px] font-black text-orange-600 uppercase">Weight PR</span>
                        </div>
                      ));
                    })()}
                  </div>
                </motion.div>

                <motion.div 
                   initial={{ opacity: 0, y: 20 }}
                   animate={{ opacity: 1, y: 0 }}
                   transition={{ delay: 0.4 }}
                   className="md:col-span-2 bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-8 md:p-10 text-white relative overflow-hidden"
                >
                   <div className="relative z-10">
                     <h3 className="text-2xl font-bold mb-2">Smart Progression Active</h3>
                     <p className="text-blue-100 text-sm leading-relaxed max-w-sm mb-6">
                        System automatically scales suggested weight and repetitions based on your Rate of Perceived Exertion (RPE).
                     </p>
                     <div className="flex gap-4">
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10 flex-1">
                           <p className="text-[10px] font-bold text-blue-200 uppercase mb-1">Scale Up</p>
                           <p className="text-lg font-black">RPE 1-6</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10 flex-1">
                           <p className="text-[10px] font-bold text-blue-200 uppercase mb-1">Stabilize</p>
                           <p className="text-lg font-black">RPE 7-8</p>
                        </div>
                        <div className="bg-white/10 rounded-2xl p-4 border border-white/10 flex-1">
                           <p className="text-[10px] font-bold text-blue-200 uppercase mb-1">Maintain</p>
                           <p className="text-lg font-black">RPE 9-10</p>
                        </div>
                     </div>
                   </div>
                </motion.div>
                    </div>
                  </>
                );
              })()}
            </div>
          )}
        </div>
      </main>

      {/* Initialize Session Modal */}
      <AnimatePresence>
        {showBuilder && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 30 }}
              className="bg-white rounded-[2rem] p-6 md:p-10 w-full max-w-xl shadow-3xl relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 -mr-20 -mt-20 w-80 h-80 bg-blue-600/5 rounded-full blur-3xl"></div>
              
              <div className="flex justify-between items-start mb-8 md:mb-10 relative">
                <div>
                  <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">Target Drill</h3>
                  <p className="text-slate-500 text-sm mt-1">Configure your professional split block.</p>
                </div>
                <button onClick={() => setShowBuilder(false)} className="p-3 bg-slate-100 hover:bg-white rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6 md:space-y-8 relative">
                <div>
                  <label className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-bold mb-4 block">SELECT PORTION</label>
                  <div className="grid grid-cols-2 gap-3">
                    {SESSION_TYPES.map(type => (
                      <button 
                        key={type}
                        onClick={() => setSelectedType(type)}
                        className={`py-4 md:py-6 rounded-2xl font-bold text-xs md:text-sm transition-all border-2 ${selectedType === type ? 'bg-slate-900 border-slate-900 text-white shadow-xl translate-y-[-2px]' : 'bg-slate-50 border-transparent text-slate-500 hover:bg-slate-100'}`}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
                
                <div className="flex items-center justify-between bg-slate-50 p-4 md:p-6 rounded-3xl border border-slate-100">
                  <div>
                    <h4 className="font-bold text-slate-800 text-sm md:text-base">Include Cardio</h4>
                    <p className="text-[10px] md:text-xs text-slate-400">Adds 20-30m aerobic block.</p>
                  </div>
                  <button 
                    onClick={() => setIncludeCardio(!includeCardio)}
                    className={`w-12 h-7 md:w-14 md:h-8 rounded-full transition-colors relative flex items-center px-1 ${includeCardio ? 'bg-blue-600' : 'bg-slate-300'}`}
                  >
                    <motion.div 
                      layout
                      className="w-5 h-5 md:w-6 md:h-6 bg-white rounded-full shadow-md"
                      style={{ marginLeft: includeCardio ? (isMobile() ? 20 : 24) : 0 }}
                    />
                  </button>
                </div>

                <div className="flex flex-col gap-4">
                  <button 
                    onClick={() => startNewSession(selectedType, includeCardio)}
                    className="w-full bg-blue-600 text-white font-bold py-4 md:py-5 rounded-[1.25rem] shadow-2xl shadow-blue-200 hover:bg-blue-700 transition-all flex items-center justify-center gap-3 text-base md:text-lg"
                  >
                    <Zap className="w-5 h-5" /> Initialize Training
                  </button>
                  <p className="text-center text-[9px] md:text-[10px] text-slate-400 uppercase tracking-widest font-semibold italic">Split will autopopulate Mobility & Posture blocks.</p>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exercise Library Drawer */}
      <AnimatePresence>
        {showLibrary && (
          <div className="fixed inset-0 z-[60] flex justify-end">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowLibrary(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="relative w-full max-w-lg bg-white h-screen shadow-3xl flex flex-col"
            >
              <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-white z-10">
                <div>
                  <h3 className="text-xl font-bold text-slate-900">
                    {swappingExId ? 'Swap Drill' : addingToCategory ? `Add ${addingToCategory}` : 'Exercise Library'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                    {swappingExId ? 'Choose a variation' : addingToCategory ? 'Expand your block' : `Filtered for ${equipmentMode} Mode`}
                  </p>
                </div>
                <button 
                  onClick={() => {
                    setShowLibrary(false);
                    setSwappingExId(null);
                    setAddingToCategory(null);
                  }} 
                  className="p-2 hover:bg-slate-100 rounded-full"
                >
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                 {(() => {
                   const categories: ExerciseCategory[] = swappingExId 
                     ? [session?.exercises.find(e => e.id === swappingExId)?.category as ExerciseCategory]
                     : addingToCategory 
                       ? [addingToCategory]
                       : ['Mobility', 'Posture', 'Resistance', 'Cardio'];

                   return categories.map(cat => {
                     const candidates = allTemplates.filter(t => {
                       const isRightCat = t.category === cat;
                       const isRightEquip = t.equipment.includes(equipmentMode);
                       const isRightSplit = !t.targetSplits || t.targetSplits.includes('All') || (session && t.targetSplits.includes(session.type));
                       return isRightCat && isRightEquip && isRightSplit;
                     });

                     if (candidates.length === 0) return null;
                     
                     return (
                       <div key={cat} className="space-y-4">
                         <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">{cat}</h4>
                         <div className="space-y-2">
                           {candidates.map(t => (
                             <div key={t.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-xl hover:border-blue-300 hover:bg-blue-50/30 transition-all cursor-default group">
                               <div>
                                 <p className="text-sm font-bold text-slate-800">{t.name}</p>
                                 <div className="flex gap-1 mt-1">
                                   {t.trackingFields.map(f => (
                                     <span key={f} className="text-[8px] px-1 bg-slate-200 text-slate-500 rounded font-bold">{f}</span>
                                   ))}
                                 </div>
                                 {t.notes && (
                                   <p className="text-[10px] text-slate-400 mt-2 italic max-w-[200px] leading-tight line-clamp-2">{t.notes}</p>
                                 )}
                                 {t.videoUrl && (
                                   <a 
                                     href={t.videoUrl} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="inline-flex items-center gap-1 mt-2 text-[8px] font-black uppercase tracking-widest text-blue-600 hover:text-blue-700 hover:underline"
                                   >
                                     <Play className="w-2 h-2" /> Watch Coaching
                                   </a>
                                 )}
                               </div>
                               <button 
                                 onClick={() => addToSession(t)}
                                 className="p-2 bg-white text-blue-600 rounded-lg shadow-sm border border-slate-200 hover:bg-blue-600 hover:text-white transition-all"
                               >
                                 {swappingExId ? <RefreshCw className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                               </button>
                             </div>
                           ))}
                         </div>
                       </div>
                     );
                   });
                 })()}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Add Custom Exercise Modal */}
      <AnimatePresence>
        {showAddCustom && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-50">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] p-10 w-full max-w-md shadow-3xl overflow-hidden"
            >
              <h3 className="text-2xl font-bold text-slate-900 mb-6">Create Custom Movement</h3>
              
              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">EXERCISE NAME</label>
                  <input 
                    type="text" 
                    value={newExName}
                    onChange={e => setNewExName(e.target.value)}
                    placeholder="e.g., Cable Hammer Curl"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">CATEGORY</label>
                  <div className="flex gap-2 flex-wrap">
                    {(['Mobility', 'Posture', 'Resistance', 'Cardio'] as ExerciseCategory[]).map(cat => (
                      <button 
                        key={cat}
                        onClick={() => setNewExCategory(cat)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${newExCategory === cat ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">TRACKING DATA POINTS</label>
                  <div className="grid grid-cols-3 gap-2">
                    {TRACKING_FIELDS.map(f => (
                      <button 
                        key={f}
                        onClick={() => {
                          if (newExFields.includes(f)) setNewExFields(newExFields.filter(x => x !== f));
                          else setNewExFields([...newExFields, f]);
                        }}
                        className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${newExFields.includes(f) ? 'bg-blue-50 border-blue-500 text-blue-600' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">TARGET SPLIT DAYS (Optional)</label>
                  <div className="flex gap-2 flex-wrap">
                    {SESSION_TYPES.map(split => (
                      <button 
                        key={split}
                        onClick={() => {
                          if (newExSplits.includes(split)) setNewExSplits(newExSplits.filter(s => s !== split));
                          else setNewExSplits([...newExSplits, split]);
                        }}
                        className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${newExSplits.includes(split) ? 'bg-slate-900 border-slate-900 text-white shadow-md' : 'bg-white border-slate-200 text-slate-400'}`}
                      >
                        {split}
                      </button>
                    ))}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-2 italic">Select specific days or leave empty for 'All'.</p>
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">NOTES / CUES</label>
                  <textarea 
                    value={newExNotes}
                    onChange={e => setNewExNotes(e.target.value)}
                    placeholder="e.g., Keep elbows tucked, pause at top..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm min-h-[80px]"
                  />
                </div>

                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">VIDEO LINK (URL)</label>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={newExVideoUrl}
                      onChange={e => setNewExVideoUrl(e.target.value)}
                      placeholder="https://..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:ring-2 focus:ring-blue-500/20 outline-none text-sm"
                    />
                    <Play className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button onClick={() => setShowAddCustom(false)} className="flex-1 py-4 text-slate-500 font-bold hover:bg-slate-50 rounded-2xl transition-colors">Cancel</button>
                  <button 
                    onClick={handleCreateCustom}
                    className="flex-1 py-4 bg-slate-900 text-white font-bold rounded-2xl hover:bg-slate-800 transition-colors shadow-lg"
                  >
                    Save to Library
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Performance Logging Modal */}
      <AnimatePresence>
        {loggingExId && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[70]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-3xl relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Log Performance</h3>
                  <p className="text-blue-600 text-[10px] font-bold uppercase tracking-widest mt-1">
                    {session?.exercises.find(e => e.id === loggingExId)?.name}
                  </p>
                </div>
                <button onClick={() => setLoggingExId(null)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-4">
                {(() => {
                   const ex = session?.exercises.find(e => e.id === loggingExId);
                   const template = allTemplates.find(t => t.id === ex?.templateId);
                   return template?.trackingFields.map(field => (
                     <div key={field}>
                       <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">{field}</label>
                       <div className="relative">
                         <input 
                           type="number" 
                           value={logFormData[field.toLowerCase() as keyof typeof logFormData] ?? 0}
                           onChange={e => setLogFormData({...logFormData, [field.toLowerCase()]: parseFloat(e.target.value) || 0})}
                           className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                         />
                         <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                           {field === 'Weight' ? 'lb' : field === 'Time' ? 'sec' : field === 'Distance' ? 'mi' : field === 'HeartRate' ? 'bpm' : field === 'Speed' ? 'mph' : ''}
                         </span>
                       </div>
                     </div>
                   ));
                })()}

                <button 
                  onClick={submitSet}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4"
                >
                  <CheckCircle2 className="w-5 h-5" /> Confirm Set
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showStepLogger && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 z-[70]">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-3xl relative overflow-hidden"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Step Integration</h3>
                  <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">
                    Manual Sync for {new Date().toLocaleDateString()}
                  </p>
                </div>
                <button onClick={() => setShowStepLogger(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X className="w-5 h-5 text-slate-400" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase mb-2 block">TOTAL STEPS TODAY</label>
                  <input 
                    type="number" 
                    autoFocus
                    value={stepInput}
                    onChange={e => setStepInput(e.target.value)}
                    placeholder="e.g., 8420"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-4 text-2xl font-black text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                  />
                  <p className="text-[10px] text-slate-400 mt-2 font-medium italic">Target: 7,000 - 10,000 steps for optimal metabolic health.</p>
                </div>

                <button 
                  onClick={handleLogSteps}
                  className="w-full bg-blue-600 text-white font-bold py-4 rounded-2xl shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-5 h-5" /> Sync Data
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {viewingPastSession && <SessionDetailModal session={viewingPastSession} onClose={() => setViewingPastSession(null)} />}
        {viewingDayDetails && <DaySummaryModal dateStr={viewingDayDetails} onClose={() => setViewingDayDetails(null)} />}
      </AnimatePresence>
      <AnimatePresence>
        {pendingWorkouts.length > 0 && <PendingWorkoutsModal />}
      </AnimatePresence>
      <AnimatePresence>
        {showRepeatDialog && (
          <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-xl flex items-center justify-center p-4 z-[100]">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-[3rem] p-10 w-full max-w-md text-center shadow-3xl"
            >
              <div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-6">
                <RotateCcw className="w-10 h-10" />
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tighter mb-2">Block Completed</h3>
              <p className="text-slate-500 font-medium leading-relaxed mb-8">
                Excellent efficiency. You've completed the full fallback sequence. Would you like to repeat the circuit?
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => {
                    setShowRepeatDialog(false);
                    startFallbackWorkout();
                  }}
                  className="w-full bg-slate-900 text-white font-black py-5 rounded-2xl shadow-xl hover:bg-indigo-600 transition-all flex items-center justify-center gap-3"
                >
                  <RotateCcw className="w-5 h-5" /> Repeat Circuit
                </button>
                <button 
                  onClick={() => {
                    setShowRepeatDialog(false);
                    setIntervalMode('none');
                    setTimerRunning(false);
                  }}
                  className="w-full bg-slate-100 text-slate-500 font-bold py-4 rounded-2xl hover:bg-slate-200 transition-all"
                >
                  I'm Done
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}


