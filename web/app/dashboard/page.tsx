"use client";

import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Clock,
  Zap,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  BarChart3,
  RefreshCw,
  Calendar,
  ChevronRight,
  Timer,
  Lightbulb,
  GraduationCap,
  Calculator,
  PenTool,
  Microscope,
  MessageCircle,
} from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

// Types
interface TopicDetail {
  topic: string;
  mastery: number;
  level: string;
  attempts: number;
  successes: number;
  last_interaction: number;
  days_since_last: number;
  interaction_types: Record<string, number>;
}

interface Insight {
  type: string;
  severity: string;
  title: string;
  description: string;
  topic?: string;
  score?: number;
  days_inactive?: number;
  action: string;
  action_link: string;
}

interface StudyPlanItem {
  topic: string;
  mastery: number;
  level: string;
  minutes: number;
  activity: string;
  activity_label: string;
  reason: string;
  link: string;
}

interface LearningState {
  overview: {
    total_topics: number;
    total_interactions: number;
    average_mastery: number;
    solver_sessions: number;
    chat_sessions: number;
    topics_mastered: number;
    topics_needs_attention: number;
  };
  topics: TopicDetail[];
  mastery_scores: Record<string, number>;
  insights: Insight[];
  timeline: Array<{
    date: string;
    mastery: number;
    topics_studied: number;
    total_interactions: number;
  }>;
  activity_breakdown: Record<string, number>;
}

interface StudyPlan {
  study_hours: number;
  plan: StudyPlanItem[];
  total_planned_minutes: number;
}

// Demo data for when no real data exists
const DEMO_STATE: LearningState = {
  overview: {
    total_topics: 8,
    total_interactions: 47,
    average_mastery: 58.4,
    solver_sessions: 12,
    chat_sessions: 8,
    topics_mastered: 2,
    topics_needs_attention: 3,
  },
  topics: [
    { topic: "Integration by Parts", mastery: 32, level: "beginner", attempts: 8, successes: 3, last_interaction: Date.now()/1000 - 86400, days_since_last: 1, interaction_types: { question: 5, solve: 3 } },
    { topic: "Chain Rule", mastery: 45, level: "developing", attempts: 6, successes: 3, last_interaction: Date.now()/1000 - 172800, days_since_last: 2, interaction_types: { question: 3, solve: 2, chat: 1 } },
    { topic: "Linear Algebra", mastery: 88, level: "mastered", attempts: 12, successes: 10, last_interaction: Date.now()/1000 - 43200, days_since_last: 0.5, interaction_types: { question: 5, solve: 4, research: 3 } },
    { topic: "Probability Theory", mastery: 72, level: "proficient", attempts: 9, successes: 7, last_interaction: Date.now()/1000 - 259200, days_since_last: 3, interaction_types: { question: 4, solve: 3, chat: 2 } },
    { topic: "Differential Equations", mastery: 28, level: "beginner", attempts: 5, successes: 1, last_interaction: Date.now()/1000 - 604800, days_since_last: 7, interaction_types: { question: 3, solve: 2 } },
    { topic: "Taylor Series", mastery: 55, level: "developing", attempts: 7, successes: 4, last_interaction: Date.now()/1000 - 86400*4, days_since_last: 4, interaction_types: { question: 4, solve: 2, chat: 1 } },
    { topic: "Matrices & Determinants", mastery: 82, level: "mastered", attempts: 10, successes: 9, last_interaction: Date.now()/1000 - 86400*2, days_since_last: 2, interaction_types: { question: 4, solve: 3, research: 2, chat: 1 } },
    { topic: "Fourier Transform", mastery: 18, level: "needs_attention", attempts: 3, successes: 0, last_interaction: Date.now()/1000 - 86400*10, days_since_last: 10, interaction_types: { question: 2, chat: 1 } },
  ],
  mastery_scores: {
    "Integration by Parts": 32,
    "Chain Rule": 45,
    "Linear Algebra": 88,
    "Probability Theory": 72,
    "Differential Equations": 28,
    "Taylor Series": 55,
    "Matrices & Determinants": 82,
    "Fourier Transform": 18,
  },
  insights: [
    { type: "weakness", severity: "high", title: "Focus Area: Fourier Transform", description: "You've interacted with this topic 3 times with a 0% success rate. Consider revisiting the fundamentals.", topic: "Fourier Transform", score: 18, action: "Start a guided learning session", action_link: "/guide" },
    { type: "decay", severity: "medium", title: "Review Needed: Differential Equations", description: "It's been 7 days since you last studied this topic. Your mastery may be declining.", topic: "Differential Equations", days_inactive: 7, action: "Take a quick quiz to refresh", action_link: "/question" },
    { type: "strength", severity: "positive", title: "Strong Area: Linear Algebra", description: "You're performing well here with 88% mastery. Keep it up!", topic: "Linear Algebra", score: 88, action: "Challenge yourself with harder problems", action_link: "/solver" },
    { type: "consistency", severity: "medium", title: "Study More Consistently", description: "You're averaging 2.3 study interactions per day. Try to practice a little every day for better retention.", action: "Set a daily study goal", action_link: "/" },
  ],
  timeline: [
    { date: "2026-02-20", mastery: 35, topics_studied: 3, total_interactions: 5 },
    { date: "2026-02-21", mastery: 40, topics_studied: 4, total_interactions: 7 },
    { date: "2026-02-22", mastery: 38, topics_studied: 2, total_interactions: 4 },
    { date: "2026-02-23", mastery: 45, topics_studied: 5, total_interactions: 8 },
    { date: "2026-02-24", mastery: 50, topics_studied: 4, total_interactions: 6 },
    { date: "2026-02-25", mastery: 48, topics_studied: 3, total_interactions: 5 },
    { date: "2026-02-26", mastery: 55, topics_studied: 5, total_interactions: 9 },
    { date: "2026-02-27", mastery: 58, topics_studied: 4, total_interactions: 7 },
    { date: "2026-02-28", mastery: 62, topics_studied: 6, total_interactions: 10 },
    { date: "2026-03-01", mastery: 58, topics_studied: 4, total_interactions: 6 },
  ],
  activity_breakdown: { question: 22, solve: 14, chat: 6, research: 5 },
};

const DEMO_PLAN: StudyPlan = {
  study_hours: 2,
  plan: [
    { topic: "Fourier Transform", mastery: 18, level: "needs_attention", minutes: 40, activity: "guided_learning", activity_label: "Guided Learning", reason: "Your mastery is at 18%. Start with structured, step-by-step learning to build foundations.", link: "/guide" },
    { topic: "Differential Equations", mastery: 28, level: "beginner", minutes: 35, activity: "guided_learning", activity_label: "Guided Learning", reason: "Your mastery is at 28%. Start with structured, step-by-step learning to build foundations.", link: "/guide" },
    { topic: "Integration by Parts", mastery: 32, level: "beginner", minutes: 30, activity: "practice", activity_label: "Practice Quiz", reason: "At 32% mastery, active recall through quizzes will strengthen your understanding.", link: "/question" },
    { topic: "Chain Rule", mastery: 45, level: "developing", minutes: 15, activity: "practice", activity_label: "Practice Quiz", reason: "At 45% mastery, active recall through quizzes will strengthen your understanding.", link: "/question" },
  ],
  total_planned_minutes: 120,
};

// Utility functions
function getMasteryColor(mastery: number): string {
  if (mastery >= 80) return "text-emerald-400";
  if (mastery >= 60) return "text-blue-400";
  if (mastery >= 40) return "text-amber-400";
  return "text-red-400";
}

function getMasteryBg(mastery: number): string {
  if (mastery >= 80) return "from-emerald-500/20 to-emerald-500/5";
  if (mastery >= 60) return "from-blue-500/20 to-blue-500/5";
  if (mastery >= 40) return "from-amber-500/20 to-amber-500/5";
  return "from-red-500/20 to-red-500/5";
}

function getMasteryBarColor(mastery: number): string {
  if (mastery >= 80) return "bg-emerald-500";
  if (mastery >= 60) return "bg-blue-500";
  if (mastery >= 40) return "bg-amber-500";
  return "bg-red-500";
}

function getMasteryGlow(mastery: number): string {
  if (mastery >= 80) return "shadow-emerald-500/20";
  if (mastery >= 60) return "shadow-blue-500/20";
  if (mastery >= 40) return "shadow-amber-500/20";
  return "shadow-red-500/20";
}

function getInsightIcon(type: string) {
  switch (type) {
    case "weakness": return <AlertTriangle className="w-5 h-5 text-red-400" />;
    case "decay": return <Clock className="w-5 h-5 text-amber-400" />;
    case "strength": return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
    case "consistency": return <TrendingUp className="w-5 h-5 text-blue-400" />;
    default: return <Lightbulb className="w-5 h-5 text-violet-400" />;
  }
}

function getInsightBorder(severity: string): string {
  switch (severity) {
    case "high": return "border-red-500/30 hover:border-red-500/50";
    case "medium": return "border-amber-500/30 hover:border-amber-500/50";
    case "positive": return "border-emerald-500/30 hover:border-emerald-500/50";
    default: return "border-white/[0.08] hover:border-violet-500/30";
  }
}

function getActivityIcon(activity: string) {
  switch (activity) {
    case "question": return <PenTool className="w-4 h-4" />;
    case "solve": return <Calculator className="w-4 h-4" />;
    case "research": return <Microscope className="w-4 h-4" />;
    case "chat": return <MessageCircle className="w-4 h-4" />;
    default: return <BookOpen className="w-4 h-4" />;
  }
}

// Animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
};

// Custom tooltip for charts
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1a1a2e]/95 backdrop-blur-xl border border-white/10 rounded-xl px-4 py-3 shadow-2xl">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      {payload.map((entry: any, i: number) => (
        <p key={i} className="text-sm font-semibold text-white">
          {entry.name}: <span className="text-violet-400">{entry.value}%</span>
        </p>
      ))}
    </div>
  );
}

export default function DashboardPage() {
  const [state, setState] = useState<LearningState | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [studyHours, setStudyHours] = useState(2);
  const [showPlan, setShowPlan] = useState(false);
  const [usingDemo, setUsingDemo] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/v1/learning-state/"));
      const data: LearningState = await res.json();

      // If no topics, use demo data
      if (data.topics.length === 0) {
        setState(DEMO_STATE);
        setPlan(DEMO_PLAN);
        setUsingDemo(true);
      } else {
        setState(data);
        setUsingDemo(false);
        // Fetch study plan
        const planRes = await fetch(apiUrl(`/api/v1/learning-state/recommendations?hours=${studyHours}`));
        const planData: StudyPlan = await planRes.json();
        setPlan(planData);
      }
    } catch {
      // Fallback to demo data
      setState(DEMO_STATE);
      setPlan(DEMO_PLAN);
      setUsingDemo(true);
    } finally {
      setLoading(false);
    }
  }, [studyHours]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center animate-pulse">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <p className="text-slate-400 text-sm">Analyzing your learning state...</p>
        </div>
      </div>
    );
  }

  if (!state) return null;

  // Prepare radar chart data (top 8 topics by interaction count)
  const radarData = state.topics
    .sort((a, b) => b.attempts - a.attempts)
    .slice(0, 8)
    .map((t) => ({
      topic: t.topic.length > 18 ? t.topic.slice(0, 16) + "..." : t.topic,
      mastery: t.mastery,
      fullMark: 100,
    }));

  return (
    <motion.div
      className="h-screen flex flex-col overflow-hidden"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Header */}
      <motion.div variants={itemVariants} className="shrink-0 px-6 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Brain className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Learning State
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {usingDemo ? "Demo data — start learning to see your real progress" : "Your personalized learning analytics"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {usingDemo && (
              <span className="px-3 py-1.5 text-xs font-medium bg-violet-500/10 text-violet-400 rounded-full border border-violet-500/20">
                Demo Mode
              </span>
            )}
            <button
              onClick={fetchData}
              className="p-2.5 rounded-xl bg-white/5 border border-white/[0.08] hover:border-violet-500/30 text-slate-400 hover:text-violet-400 transition-all"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </motion.div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Stats Row */}
        <motion.div variants={itemVariants} className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            {
              label: "Overall Mastery",
              value: `${state.overview.average_mastery}%`,
              icon: <Target className="w-5 h-5" />,
              color: "from-violet-500 to-blue-500",
              textColor: "text-violet-400",
            },
            {
              label: "Topics Studied",
              value: state.overview.total_topics,
              icon: <BookOpen className="w-5 h-5" />,
              color: "from-blue-500 to-cyan-500",
              textColor: "text-blue-400",
            },
            {
              label: "Total Interactions",
              value: state.overview.total_interactions,
              icon: <Zap className="w-5 h-5" />,
              color: "from-amber-500 to-orange-500",
              textColor: "text-amber-400",
            },
            {
              label: "Needs Attention",
              value: state.overview.topics_needs_attention,
              icon: <AlertTriangle className="w-5 h-5" />,
              color: "from-red-500 to-pink-500",
              textColor: "text-red-400",
            },
          ].map((stat, i) => (
            <motion.div
              key={stat.label}
              variants={itemVariants}
              className="relative overflow-hidden rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-5 hover:border-violet-500/20 dark:hover:border-violet-500/20 transition-all group"
            >
              <div className={`absolute top-0 right-0 w-24 h-24 bg-gradient-to-br ${stat.color} opacity-[0.07] rounded-bl-[60px] group-hover:opacity-[0.12] transition-opacity`} />
              <div className={`inline-flex p-2 rounded-xl bg-gradient-to-br ${stat.color} bg-opacity-10 mb-3`}>
                <span className="text-white">{stat.icon}</span>
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* Main Grid: Radar Chart + Topic Mastery */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Radar Chart */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-2 rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-violet-400" />
                Knowledge Map
              </h2>
            </div>
            {radarData.length > 0 ? (
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis
                      dataKey="topic"
                      tick={{ fill: "rgba(148,163,184,0.8)", fontSize: 11 }}
                    />
                    <PolarRadiusAxis
                      angle={90}
                      domain={[0, 100]}
                      tick={{ fill: "rgba(148,163,184,0.5)", fontSize: 10 }}
                      axisLine={false}
                    />
                    <Radar
                      name="Mastery"
                      dataKey="mastery"
                      stroke="#8b5cf6"
                      fill="url(#radarGradient)"
                      fillOpacity={0.5}
                      strokeWidth={2}
                    />
                    <defs>
                      <linearGradient id="radarGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.6} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">
                No topic data yet
              </div>
            )}
          </motion.div>

          {/* Topic Mastery List */}
          <motion.div
            variants={itemVariants}
            className="lg:col-span-3 rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-6"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-violet-400" />
              Topic Mastery
            </h2>
            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
              {state.topics.map((topic, i) => (
                <motion.div
                  key={topic.topic}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.4 }}
                  className={`flex items-center gap-4 p-3 rounded-xl bg-gradient-to-r ${getMasteryBg(topic.mastery)} border border-white/[0.04] hover:border-white/[0.12] transition-all group cursor-default`}
                >
                  {/* Mastery circle */}
                  <div className={`relative w-12 h-12 rounded-full flex items-center justify-center border-2 ${
                    topic.mastery >= 80 ? "border-emerald-500/40" :
                    topic.mastery >= 60 ? "border-blue-500/40" :
                    topic.mastery >= 40 ? "border-amber-500/40" : "border-red-500/40"
                  }`}>
                    <span className={`text-sm font-bold ${getMasteryColor(topic.mastery)}`}>
                      {Math.round(topic.mastery)}
                    </span>
                    {/* SVG ring progress */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 48 48">
                      <circle
                        cx="24" cy="24" r="20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="3"
                        strokeDasharray={`${(topic.mastery / 100) * 125.6} 125.6`}
                        className={getMasteryColor(topic.mastery)}
                        strokeLinecap="round"
                        opacity={0.6}
                      />
                    </svg>
                  </div>

                  {/* Topic info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {topic.topic}
                    </p>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {topic.attempts} attempts
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {topic.days_since_last < 1 ? "Today" : `${Math.round(topic.days_since_last)}d ago`}
                      </span>
                      <div className="flex gap-1">
                        {Object.entries(topic.interaction_types).map(([type, count]) => (
                          <span key={type} className="inline-flex items-center gap-0.5 text-[10px] text-slate-500 dark:text-slate-500 bg-white/5 px-1.5 py-0.5 rounded-full">
                            {getActivityIcon(type)}
                            {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Mastery bar */}
                  <div className="w-24 hidden sm:block">
                    <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${getMasteryBarColor(topic.mastery)}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${topic.mastery}%` }}
                        transition={{ delay: 0.3 + i * 0.05, duration: 0.8, ease: "easeOut" }}
                      />
                    </div>
                  </div>

                  {/* Level badge */}
                  <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full ${
                    topic.level === "mastered" ? "bg-emerald-500/10 text-emerald-400" :
                    topic.level === "proficient" ? "bg-blue-500/10 text-blue-400" :
                    topic.level === "developing" ? "bg-amber-500/10 text-amber-400" :
                    "bg-red-500/10 text-red-400"
                  } hidden md:block`}>
                    {topic.level.replace("_", " ")}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Learning Timeline */}
        <motion.div
          variants={itemVariants}
          className="rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-violet-400" />
              Learning Trajectory
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              Last {state.timeline.length} days
            </div>
          </div>
          {state.timeline.length > 0 ? (
            <div className="h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={state.timeline}>
                  <defs>
                    <linearGradient id="masteryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: "rgba(148,163,184,0.6)", fontSize: 11 }}
                    tickFormatter={(v) => v.slice(5)} // Show MM-DD
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fill: "rgba(148,163,184,0.6)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
                    tickFormatter={(v) => `${v}%`}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="mastery"
                    name="Mastery"
                    stroke="#8b5cf6"
                    strokeWidth={2.5}
                    fill="url(#masteryGradient)"
                    dot={{ fill: "#8b5cf6", strokeWidth: 0, r: 4 }}
                    activeDot={{ fill: "#a78bfa", stroke: "#8b5cf6", strokeWidth: 2, r: 6 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-500 dark:text-slate-500">
              Not enough data for timeline yet
            </div>
          )}
        </motion.div>

        {/* Insights + Study Planner */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* AI Insights */}
          <motion.div variants={itemVariants}>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Sparkles className="w-5 h-5 text-violet-400" />
              AI Insights
              <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1">Explainable recommendations</span>
            </h2>
            <div className="space-y-3">
              {state.insights.map((insight, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + i * 0.1 }}
                >
                  <Link
                    href={insight.action_link}
                    className={`block p-4 rounded-xl bg-white dark:bg-white/[0.03] border ${getInsightBorder(insight.severity)} transition-all group hover:shadow-lg hover:shadow-black/10`}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getInsightIcon(insight.type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">
                          {insight.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {insight.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2.5 text-xs font-medium text-violet-500 dark:text-violet-400 group-hover:text-violet-300 transition-colors">
                          {insight.action}
                          <ArrowRight className="w-3 h-3 group-hover:translate-x-1 transition-transform" />
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Study Planner */}
          <motion.div variants={itemVariants}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Timer className="w-5 h-5 text-violet-400" />
                AI Study Planner
              </h2>
              <div className="flex items-center gap-2">
                <select
                  value={studyHours}
                  onChange={(e) => setStudyHours(Number(e.target.value))}
                  className="text-xs bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-2 py-1.5 text-slate-900 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                >
                  <option value={0.5}>30 min</option>
                  <option value={1}>1 hour</option>
                  <option value={2}>2 hours</option>
                  <option value={3}>3 hours</option>
                </select>
              </div>
            </div>

            {plan && plan.plan.length > 0 ? (
              <div className="space-y-3">
                {/* Total time bar */}
                <div className="p-3 rounded-xl bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-500/20">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-400">Study Plan</span>
                    <span className="text-xs font-bold text-violet-400">
                      {plan.total_planned_minutes} min planned
                    </span>
                  </div>
                  <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden flex">
                    {plan.plan.map((item, i) => (
                      <motion.div
                        key={i}
                        className={`h-full ${
                          i % 4 === 0 ? "bg-violet-500" :
                          i % 4 === 1 ? "bg-blue-500" :
                          i % 4 === 2 ? "bg-cyan-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${(item.minutes / plan.total_planned_minutes) * 100}%` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(item.minutes / plan.total_planned_minutes) * 100}%` }}
                        transition={{ delay: 0.5 + i * 0.15, duration: 0.6 }}
                      />
                    ))}
                  </div>
                </div>

                {/* Plan items */}
                {plan.plan.map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 + i * 0.1 }}
                  >
                    <Link
                      href={item.link}
                      className="block p-4 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] hover:border-violet-500/30 transition-all group"
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                          item.activity === "guided_learning" ? "bg-violet-500/10" :
                          item.activity === "practice" ? "bg-blue-500/10" :
                          "bg-emerald-500/10"
                        }`}>
                          {item.activity === "guided_learning" ? (
                            <GraduationCap className={`w-5 h-5 ${
                              item.activity === "guided_learning" ? "text-violet-400" : "text-blue-400"
                            }`} />
                          ) : item.activity === "practice" ? (
                            <PenTool className="w-5 h-5 text-blue-400" />
                          ) : (
                            <Calculator className="w-5 h-5 text-emerald-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {item.topic}
                            </p>
                            <span className="text-xs font-bold text-violet-400 ml-2 flex-shrink-0">
                              {item.minutes} min
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                            {item.reason}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                              item.activity === "guided_learning" ? "bg-violet-500/10 text-violet-400" :
                              item.activity === "practice" ? "bg-blue-500/10 text-blue-400" :
                              "bg-emerald-500/10 text-emerald-400"
                            }`}>
                              {item.activity_label}
                            </span>
                            <span className={`text-[10px] font-semibold ${getMasteryColor(item.mastery)}`}>
                              {Math.round(item.mastery)}% mastery
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all self-center" />
                      </div>
                    </Link>
                  </motion.div>
                ))}
              </div>
            ) : (
              <div className="p-8 rounded-xl bg-white dark:bg-white/[0.03] border border-slate-200 dark:border-white/[0.08] text-center">
                <Timer className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Start learning to get personalized study plans
                </p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Activity Breakdown */}
        {Object.keys(state.activity_breakdown).length > 0 && (
          <motion.div
            variants={itemVariants}
            className="rounded-2xl bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/[0.08] p-6"
          >
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <BarChart3 className="w-5 h-5 text-violet-400" />
              Activity Breakdown
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(state.activity_breakdown).map(([type, count], i) => {
                const total = Object.values(state.activity_breakdown).reduce((a, b) => a + b, 0);
                const pct = Math.round((count / total) * 100);
                const colorMap: Record<string, string> = {
                  question: "from-violet-500 to-purple-500",
                  solve: "from-blue-500 to-cyan-500",
                  research: "from-emerald-500 to-green-500",
                  chat: "from-amber-500 to-orange-500",
                };
                const bgMap: Record<string, string> = {
                  question: "bg-violet-500/10",
                  solve: "bg-blue-500/10",
                  research: "bg-emerald-500/10",
                  chat: "bg-amber-500/10",
                };
                const textMap: Record<string, string> = {
                  question: "text-violet-400",
                  solve: "text-blue-400",
                  research: "text-emerald-400",
                  chat: "text-amber-400",
                };

                return (
                  <motion.div
                    key={type}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8 + i * 0.1 }}
                    className="text-center p-4 rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200 dark:border-white/[0.06]"
                  >
                    <div className={`inline-flex p-2.5 rounded-xl ${bgMap[type] || "bg-slate-500/10"} mb-3`}>
                      {getActivityIcon(type)}
                    </div>
                    <p className={`text-xl font-bold ${textMap[type] || "text-slate-400"}`}>{count}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 capitalize mt-0.5">{type}</p>
                    <div className="mt-2 h-1 bg-white/[0.06] rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full bg-gradient-to-r ${colorMap[type] || "from-slate-500 to-slate-400"}`}
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ delay: 1 + i * 0.1, duration: 0.8 }}
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{pct}%</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
