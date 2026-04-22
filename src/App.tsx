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
  Search,
  MessageSquare,
  TrendingDown,
  Download,
  Upload,
  Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { BASE_EXERCISES } from './constants';
import { 
  WorkoutSession, 
  ExerciseTemplate, 
  ActiveExercise, 
  WorkoutSet, 
  EquipmentMode, 
  ExerciseCategory,
  TrackingField,
  SessionType
} from './types';

// Storage keys
const STORAGE_KEY = 'forge_workout_state';
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SESSION_TYPES = [
  'Lower Body',
  'Chest/Shoulders',
  'Back/Biceps',
  'Core'
] as const;

const TRACKING_FIELDS: TrackingField[] = ['Weight', 'Reps', 'Time', 'Speed', 'Incline', 'RPE'];

const isMobile = () => typeof window !== 'undefined' && window.innerWidth < 768;

export default function App() {
  // Global State
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [equipmentMode, setEquipmentMode] = useState<EquipmentMode>('Full Gym');
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
  const [currentView, setCurrentView] = useState<'Dashboard' | 'Calendar'>('Dashboard');
  const [viewingPastSession, setViewingPastSession] = useState<WorkoutSession | null>(null);
  const [calendarMonth, setCalendarMonth] = useState(new Date());
  const [aiAdvice, setAiAdvice] = useState<{ [exId: string]: string }>({});
  const [isAnalyzing, setIsAnalyzing] = useState<{ [exId: string]: boolean }>({});
  
  // Timer States
  const [totalSeconds, setTotalSeconds] = useState(0);
  const [restSeconds, setRestSeconds] = useState(0);
  const [isResting, setIsResting] = useState(false);
  const [timerRunning, setTimerRunning] = useState(false);

  // Logging Form State
  const [loggingExId, setLoggingExId] = useState<string | null>(null);
  const [logFormData, setLogFormData] = useState<Partial<WorkoutSet>>({});

  // Custom Exercise Form State
  const [newExName, setNewExName] = useState('');
  const [newExCategory, setNewExCategory] = useState<ExerciseCategory>('Resistance');
  const [newExFields, setNewExFields] = useState<TrackingField[]>(['Weight', 'Reps']);
  const [newExSplits, setNewExSplits] = useState<SessionType[]>([]);
  
  // Load State
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setCustomExercises(parsed.customExercises || []);
        setHistory(parsed.history || []);
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
      history
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [session, customExercises, history]);

  // Timers Effect
  useEffect(() => {
    let interval: any;
    if (timerRunning) {
      interval = setInterval(() => {
        setTotalSeconds(prev => prev + 1);
        if (isResting) setRestSeconds(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [timerRunning, isResting]);

  const allTemplates = useMemo(() => [...BASE_EXERCISES, ...customExercises], [customExercises]);

  const startNewSession = (type: SessionType, hasCardio: boolean) => {
    const candidates = allTemplates.filter(t => t.equipment.includes(equipmentMode));
    
    // Filter by split logic
    const splitFilter = (t: ExerciseTemplate) => {
      // If it doesn't have splits defined, default to 'All' or just allow it if it's mobility/posture/cardio
      if (!t.targetSplits || t.targetSplits.includes('All')) return true;
      if (t.category !== 'Resistance') return true; 
      return t.targetSplits.includes(type);
    };

    const mobility = candidates.filter(t => t.category === 'Mobility' && splitFilter(t)).slice(0, 4);
    const posture = candidates.filter(t => t.category === 'Posture' && splitFilter(t)).slice(0, 2);
    
    // Total 1hr target: 15m (pre) + 25m (cardio) + 20m (res) OR 15m (pre) + 45m (res)
    const resistanceCount = hasCardio ? 2 : 4; 
    
    const resistance = candidates.filter(t => t.category === 'Resistance' && splitFilter(t)).slice(0, resistanceCount);

    const cardio = hasCardio 
      ? candidates.filter(t => t.category === 'Cardio' && splitFilter(t)).slice(0, 1)
      : [];

    const exercises: ActiveExercise[] = [...mobility, ...posture, ...resistance, ...cardio].map(t => ({
      id: Math.random().toString(36).substr(2, 9),
      templateId: t.id,
      name: t.name,
      category: t.category,
      targetSets: t.suggestedSets || (t.category === 'Cardio' || t.category === 'Mobility' ? 1 : 3),
      targetReps: t.suggestedReps,
      targetDuration: t.suggestedDuration,
      targetRest: t.suggestedRest,
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
      trackingFields: newExFields
    };
    setCustomExercises([...customExercises, newTemplate]);
    setNewExName('');
    setNewExSplits([]);
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
        alert('Data successfully imported and restored.');
      } catch (err) {
        console.error('Import failed', err);
        alert('Invalid backup file. Please try again.');
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
          const val = set.weight || set.time || 0;
          historicalSets.push({
            value: val,
            date: set.timestamp || session.startTime,
            display: set.weight ? `${set.weight} lb` : formatTime(set.time || 0)
          });
        });
      }
    });

    if (session) {
      const ex = session.exercises.find(e => e.templateId === templateId);
      if (ex) {
        ex.sets.forEach(set => {
          const val = set.weight || set.time || 0;
          historicalSets.push({
            value: val,
            date: set.timestamp || Date.now(),
            display: set.weight ? `${set.weight} lb` : formatTime(set.time || 0)
          });
        });
      }
    }

    return historicalSets.sort((a, b) => a.date - b.date).slice(-50);
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
      heatmap.push({ date: d, active: hasWorkout });
    }

    return { weeklyVolume, prs, heatmap };
  };

  const getAIAdvice = async (ex: ActiveExercise) => {
    if (isAnalyzing[ex.id]) return;
    setIsAnalyzing(prev => ({ ...prev, [ex.id]: true }));
    
    try {
      const hist = getExerciseHistory(ex.templateId);
      const dataStr = hist.map(h => `{date: ${new Date(h.date).toLocaleDateString()}, value: ${h.display}}`).join(', ');
      
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze this exercise data for "${ex.name}" and provide 1-2 sentences of specific coaching advice (plateau detection, progression tips, or form cues). Data: [${dataStr}]. Current Goal: ${ex.targetSets} sets of ${ex.targetReps} reps. Keep it professional and concise.`,
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
      default: return 'bg-slate-500';
    }
  };

  const getSplitTextColor = (type: SessionType) => {
    switch (type) {
      case 'Lower Body': return 'text-orange-600';
      case 'Chest/Shoulders': return 'text-blue-600';
      case 'Back/Biceps': return 'text-emerald-600';
      case 'Core': return 'text-purple-600';
      default: return 'text-slate-600';
    }
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
          {s.exercises.map(ex => (
            <div key={ex.id} className="space-y-3">
              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                <h4 className="font-bold text-slate-800 text-sm">{ex.name}</h4>
                <p className="text-[10px] text-slate-400 font-bold uppercase">{ex.category}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {ex.sets.map((set, idx) => (
                  <div key={set.id} className="flex items-center gap-3 bg-slate-50 px-3 py-2 rounded-lg text-xs border border-slate-100">
                    <span className="font-bold text-slate-400">S{idx+1}</span>
                    <div className="flex gap-2 font-medium text-slate-700">
                      {set.weight !== undefined && <span>{set.weight} lb</span>}
                      {set.reps !== undefined && <span>{set.reps} reps</span>}
                      {set.time !== undefined && set.time > 0 && <span>{formatTime(set.time)}</span>}
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
      const isToday = new Date().toDateString() === dateStr;

      days.push(
        <div key={day} className={`h-24 p-2 border border-slate-100 relative group overflow-hidden bg-white hover:bg-slate-50 transition-colors ${isToday ? 'bg-blue-50/30' : ''}`}>
          <span className={`text-[10px] font-bold ${isToday ? 'text-blue-600' : 'text-slate-400'}`}>{day}</span>
          <div className="mt-1 space-y-1">
            {sessionsOnDay.map(s => (
              <button 
                key={s.id}
                onClick={() => setViewingPastSession(s)}
                className={`w-full text-[8px] font-bold text-white px-1.5 py-1 rounded truncate leading-none transition-transform active:scale-95 ${getSplitColor(s.type)}`}
              >
                {s.type.split('/')[0]} {s.hasCardio ? '⚡' : ''}
              </button>
            ))}
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

      {/* Timer Bar (Active Only) */}
      <AnimatePresence>
        {session && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-slate-900 text-white px-4 py-2 border-b border-slate-800 z-20 flex items-center justify-between"
          >
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-3">
                <div className="flex flex-col">
                  <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest leading-none mb-1">Session</span>
                  <span className="text-sm font-mono font-bold leading-none">{formatTime(totalSeconds)}</span>
                </div>
                <button 
                  onClick={() => setTimerRunning(!timerRunning)}
                  className="p-1.5 bg-white/10 hover:bg-white/20 rounded-lg transition-colors"
                  title={timerRunning ? "Pause Session" : "Resume Session"}
                >
                  {timerRunning ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>
              </div>
              
              {isResting && (
                <div className="flex items-center gap-3 pl-6 border-l border-slate-700">
                  <div className="flex flex-col">
                    <span className="text-[8px] font-bold text-blue-400 uppercase tracking-widest leading-none mb-1">Rest Interval</span>
                    <span className="text-sm font-mono font-bold leading-none text-blue-400">{formatTime(restSeconds)}</span>
                  </div>
                  <button 
                    onClick={stopRest}
                    className="p-1 px-2 bg-blue-600 rounded text-[10px] font-bold uppercase hover:bg-blue-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase hidden sm:block">{session.name}</span>
              <button 
                onClick={finishSession}
                className="bg-white/10 hover:bg-white/20 text-white border border-white/20 text-[10px] font-bold px-3 py-1.5 rounded uppercase transition-all"
              >
                Finish
              </button>
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
                onClick={() => setCurrentView('Dashboard')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'Dashboard' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <LayoutDashboard className="w-4 h-4" /> Dashboard
              </button>
              <button 
                onClick={() => setCurrentView('Calendar')}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-bold transition-all ${currentView === 'Calendar' ? 'bg-blue-50 text-blue-600' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                <History className="w-4 h-4" /> Calendar
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
                className="flex-1 flex flex-col items-center justify-center p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-all group"
              >
                <Download className="w-4 h-4 text-slate-400 group-hover:text-blue-600 mb-1" />
                <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest">Backup</span>
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
                                      {set.weight !== undefined && <span>{set.weight} lb</span>}
                                      {set.reps !== undefined && <span>{set.reps} reps</span>}
                                      {set.time !== undefined && set.time > 0 && <span>{formatTime(set.time)}</span>}
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
              {/* Forge Insights Bento Dashboard */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Main Hero Card */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="md:col-span-2 bg-white rounded-[2.5rem] p-8 md:p-12 shadow-2xl shadow-slate-200/50 border border-slate-100 flex flex-col justify-between relative overflow-hidden group"
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
                    <button 
                      onClick={() => setShowBuilder(true)}
                      className="bg-slate-900 text-white font-bold py-5 px-10 rounded-2xl shadow-xl hover:bg-blue-600 hover:-translate-y-1 transition-all flex items-center gap-3 w-full sm:w-auto"
                    >
                      <Play className="w-4 h-4 fill-current" /> Begin Next Session
                    </button>
                  </div>
                </motion.div>

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
                           {field === 'Weight' ? 'lb' : field === 'Time' ? 'sec' : ''}
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
        {viewingPastSession && <SessionDetailModal session={viewingPastSession} onClose={() => setViewingPastSession(null)} />}
      </AnimatePresence>
    </div>
  );
}


