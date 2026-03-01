"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  BookOpen,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Calendar,
  Timer,
  GraduationCap,
  PenTool,
  Calculator,
  Award,
  Eye,
  Clock,
  ChevronRight,
  ChevronDown,
  Minus,
  Play,
  Lightbulb,
} from "lucide-react";
import Link from "next/link";
import { apiUrl } from "@/lib/api";

// ── Types ─────────────────────────────────────────────────────────────
interface MasteryBreakdown { bkt_score: number; exposure_credit: number; retention_mod: number; calibration_mod: number; }
interface AssessmentStats { total: number; correct: number; accuracy: number; avg_confidence: number; }
interface Velocity { direction: "improving" | "stable" | "declining"; delta: number; sessions_to_mastery: number | null; }
interface Calibration { score: number; avg_confidence: number; accuracy: number; is_overconfident: boolean; is_underconfident: boolean; }
interface TopicDetail {
  topic: string; mastery: number; level: string; attempts: number; successes: number;
  last_interaction: number; days_since_last: number; interaction_types: Record<string, number>;
  mastery_breakdown?: MasteryBreakdown; assessment_stats?: AssessmentStats;
  velocity?: Velocity; calibration?: Calibration; explanation?: string;
}
interface Insight { type: string; severity: string; title: string; description: string; topic?: string; score?: number; days_inactive?: number; action: string; action_link: string; }
interface StudyPlanItem { topic: string; mastery: number; level: string; minutes: number; activity: string; activity_label: string; reason: string; link: string; }
interface LearningState {
  overview: { total_topics: number; total_interactions: number; average_mastery: number; solver_sessions: number; chat_sessions: number; topics_mastered: number; topics_needs_attention: number; };
  topics: TopicDetail[]; mastery_scores: Record<string, number>; insights: Insight[];
  timeline: Array<{ date: string; mastery: number; topics_studied: number; total_interactions: number; }>;
  activity_breakdown: Record<string, number>;
}
interface StudyPlan { study_hours: number; plan: StudyPlanItem[]; total_planned_minutes: number; }

// ── Demo ──────────────────────────────────────────────────────────────
const DEMO_STATE: LearningState = {
  overview: { total_topics: 6, total_interactions: 42, average_mastery: 44, solver_sessions: 12, chat_sessions: 8, topics_mastered: 1, topics_needs_attention: 2 },
  topics: [
    { topic: "Linear Algebra", mastery: 82, level: "mastered", attempts: 20, successes: 16, last_interaction: Date.now()/1000 - 43200, days_since_last: 0.5, interaction_types: { question: 5, solve: 4, assessment: 8 }, mastery_breakdown: { bkt_score: 45, exposure_credit: 20, retention_mod: 15, calibration_mod: 2 }, assessment_stats: { total: 8, correct: 7, accuracy: 0.875, avg_confidence: 4.0 }, velocity: { direction: "stable", delta: 0.02, sessions_to_mastery: null }, calibration: { score: 2, avg_confidence: 4.0, accuracy: 0.875, is_overconfident: false, is_underconfident: false }, explanation: "7/8 correct, strong retention" },
    { topic: "Probability Theory", mastery: 55, level: "developing", attempts: 15, successes: 10, last_interaction: Date.now()/1000 - 259200, days_since_last: 3, interaction_types: { question: 4, solve: 3, assessment: 6 }, mastery_breakdown: { bkt_score: 30, exposure_credit: 20, retention_mod: 8, calibration_mod: -3 }, assessment_stats: { total: 6, correct: 4, accuracy: 0.667, avg_confidence: 3.8 }, velocity: { direction: "improving", delta: 0.15, sessions_to_mastery: 4 }, calibration: { score: -3, avg_confidence: 3.8, accuracy: 0.667, is_overconfident: false, is_underconfident: false }, explanation: "4/6 correct, improving trend" },
    { topic: "Chain Rule", mastery: 48, level: "developing", attempts: 10, successes: 6, last_interaction: Date.now()/1000 - 172800, days_since_last: 2, interaction_types: { question: 3, solve: 2, assessment: 4 }, mastery_breakdown: { bkt_score: 28, exposure_credit: 18, retention_mod: 10, calibration_mod: -8 }, assessment_stats: { total: 4, correct: 2, accuracy: 0.5, avg_confidence: 4.2 }, velocity: { direction: "improving", delta: 0.25, sessions_to_mastery: 5 }, calibration: { score: -8, avg_confidence: 4.2, accuracy: 0.5, is_overconfident: true, is_underconfident: false }, explanation: "2/4 correct, overconfident" },
    { topic: "Taylor Series", mastery: 38, level: "beginner", attempts: 11, successes: 6, last_interaction: Date.now()/1000 - 86400*4, days_since_last: 4, interaction_types: { question: 4, solve: 2, assessment: 4 }, mastery_breakdown: { bkt_score: 18, exposure_credit: 20, retention_mod: 5, calibration_mod: -5 }, assessment_stats: { total: 4, correct: 2, accuracy: 0.5, avg_confidence: 3.8 }, velocity: { direction: "declining", delta: -0.2, sessions_to_mastery: null }, calibration: { score: -5, avg_confidence: 3.8, accuracy: 0.5, is_overconfident: true, is_underconfident: false }, explanation: "2/4 correct, declining" },
    { topic: "Integration by Parts", mastery: 18, level: "needs_attention", attempts: 8, successes: 3, last_interaction: Date.now()/1000 - 86400, days_since_last: 1, interaction_types: { question: 5, solve: 3 }, mastery_breakdown: { bkt_score: 0, exposure_credit: 18, retention_mod: 0, calibration_mod: 0 }, assessment_stats: { total: 0, correct: 0, accuracy: 0, avg_confidence: 0 }, velocity: { direction: "stable", delta: 0, sessions_to_mastery: null }, calibration: { score: 0, avg_confidence: 0, accuracy: 0, is_overconfident: false, is_underconfident: false }, explanation: "No assessments yet" },
    { topic: "Fourier Transform", mastery: 9, level: "needs_attention", attempts: 3, successes: 0, last_interaction: Date.now()/1000 - 86400*10, days_since_last: 10, interaction_types: { question: 2, chat: 1 }, mastery_breakdown: { bkt_score: 0, exposure_credit: 9, retention_mod: 0, calibration_mod: 0 }, assessment_stats: { total: 0, correct: 0, accuracy: 0, avg_confidence: 0 }, velocity: { direction: "stable", delta: 0, sessions_to_mastery: null }, calibration: { score: 0, avg_confidence: 0, accuracy: 0, is_overconfident: false, is_underconfident: false }, explanation: "No assessments yet" },
  ],
  mastery_scores: { "Linear Algebra": 82, "Probability Theory": 55, "Chain Rule": 48, "Taylor Series": 38, "Integration by Parts": 18, "Fourier Transform": 9 },
  insights: [
    { type: "overconfidence", severity: "high", title: "Overconfidence Alert", description: "Chain Rule: Your confidence is 4.2/5 but accuracy is only 50%. Consider retaking the assessment to recalibrate.", topic: "Chain Rule", action: "Retake assessment", action_link: "/question" },
    { type: "velocity", severity: "positive", title: "Great Momentum", description: "Probability Theory accuracy is trending upward. Your recent answers show real improvement!", topic: "Probability Theory", action: "Continue practicing", action_link: "/question" },
    { type: "weakness", severity: "high", title: "Unmeasured Topic", description: "Integration by Parts has 8 interactions but zero assessments. Take a quiz to benchmark your understanding.", topic: "Integration by Parts", action: "Take a quiz", action_link: "/question" },
    { type: "strength", severity: "positive", title: "Mastered!", description: "Linear Algebra: 87.5% accuracy with well-calibrated confidence. You truly know this material.", topic: "Linear Algebra", score: 82, action: "Try harder problems", action_link: "/solver" },
  ],
  timeline: [],
  activity_breakdown: { question: 20, solve: 12, chat: 4, assessment: 22 },
};
const DEMO_PLAN: StudyPlan = {
  study_hours: 2, total_planned_minutes: 120,
  plan: [
    { topic: "Fourier Transform", mastery: 9, level: "needs_attention", minutes: 40, activity: "guided_learning", activity_label: "Guided Learning", reason: "Build foundational understanding before attempting problems", link: "/guide" },
    { topic: "Chain Rule", mastery: 48, level: "developing", minutes: 30, activity: "practice", activity_label: "Quiz", reason: "Recalibrate your confidence with a focused assessment", link: "/question" },
    { topic: "Integration by Parts", mastery: 18, level: "needs_attention", minutes: 30, activity: "practice", activity_label: "First Assessment", reason: "Take your first quiz to measure real understanding", link: "/question" },
    { topic: "Taylor Series", mastery: 38, level: "beginner", minutes: 20, activity: "practice", activity_label: "Review", reason: "Reverse the declining trend with targeted practice", link: "/question" },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────
const mc = (m: number) => m >= 80 ? "#34d399" : m >= 60 ? "#60a5fa" : m >= 40 ? "#fbbf24" : "#f87171";
const mtc = (m: number) => m >= 80 ? "text-emerald-400" : m >= 60 ? "text-blue-400" : m >= 40 ? "text-amber-400" : "text-red-400";
const mbg = (m: number) => m >= 80 ? "bg-emerald-500" : m >= 60 ? "bg-blue-500" : m >= 40 ? "bg-amber-500" : "bg-red-500";
const levelBadge: Record<string, { label: string; cls: string }> = {
  mastered: { label: "Mastered", cls: "text-emerald-300 bg-emerald-500/15" },
  proficient: { label: "Proficient", cls: "text-blue-300 bg-blue-500/15" },
  developing: { label: "Developing", cls: "text-amber-300 bg-amber-500/15" },
  beginner: { label: "Beginner", cls: "text-orange-300 bg-orange-500/15" },
  needs_attention: { label: "Needs Work", cls: "text-red-300 bg-red-500/15" },
};
const planIcon = (a: string) => a === "guided_learning" ? <GraduationCap className="w-5 h-5" /> : a === "practice" ? <PenTool className="w-5 h-5" /> : <Calculator className="w-5 h-5" />;
const planColor = (a: string) => a === "guided_learning" ? { text: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/25", ring: "ring-violet-500/20" } : a === "practice" ? { text: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/25", ring: "ring-blue-500/20" } : { text: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/25", ring: "ring-emerald-500/20" };

function Ring({ value, size = 44, stroke = 3.5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={mc(value)} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - value / 100)} className="transition-all duration-700" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-xs font-bold ${mtc(value)}`}>{Math.round(value)}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
export default function DashboardPage() {
  const [state, setState] = useState<LearningState | null>(null);
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [studyHours, setStudyHours] = useState(2);
  const [usingDemo, setUsingDemo] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<number | null>(null);

  const fetchData = useCallback(async (forceRefresh = false) => {
    if (!state) setLoading(true);
    if (forceRefresh) setRefreshing(true);
    try {
      const url = forceRefresh ? apiUrl("/api/v1/learning-state/?refresh=true") : apiUrl("/api/v1/learning-state/");
      const res = await fetch(url);
      const data: LearningState = await res.json();
      if (data.topics.length === 0) { setState(DEMO_STATE); setPlan(DEMO_PLAN); setUsingDemo(true); }
      else {
        setState(data); setUsingDemo(false);
        const pr = await fetch(apiUrl(`/api/v1/learning-state/recommendations?hours=${studyHours}`));
        setPlan(await pr.json());
      }
    } catch { setState(DEMO_STATE); setPlan(DEMO_PLAN); setUsingDemo(true); }
    finally { setLoading(false); setRefreshing(false); }
  }, [studyHours]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const scheduleBlocks = useMemo(() => {
    if (!plan?.plan.length) return [];
    const now = new Date();
    let start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0);
    return plan.plan.map((item) => {
      const end = new Date(start.getTime() + item.minutes * 60000);
      const block = { ...item, startTime: start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }), endTime: end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      start = end;
      return block;
    });
  }, [plan]);

  if (loading) return (
    <div className="h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center animate-pulse"><Brain className="w-5 h-5 text-white" /></div>
        <p className="text-sm text-slate-500">Analyzing your learning...</p>
      </div>
    </div>
  );
  if (!state) return null;

  const ov = state.overview;
  const lb = (l: string) => levelBadge[l] || levelBadge.needs_attention;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* ── Header ── */}
      <div className="shrink-0 px-6 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white">Learning Dashboard</h1>
            <p className="text-[10px] text-slate-500 -mt-0.5">{usingDemo ? "Demo mode — upload a knowledge base to begin" : new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
        </div>
        <button onClick={() => fetchData(true)} disabled={refreshing} className="p-2 rounded-lg hover:bg-white/[0.05] text-slate-500 hover:text-violet-400 transition disabled:opacity-40">
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* ── Scrollable Content ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-6 py-6 space-y-8">

          {/* ═══════════════════════════════════════════════════════════
               SECTION 1 — Overview Stats
             ═══════════════════════════════════════════════════════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Avg Mastery", value: `${ov.average_mastery}%`, icon: Target, color: mc(ov.average_mastery), desc: ov.average_mastery >= 60 ? "On track" : "Room to grow" },
                { label: "Topics", value: ov.total_topics, icon: BookOpen, color: "#8b5cf6", desc: `${ov.topics_mastered} mastered` },
                { label: "Activities", value: ov.total_interactions, icon: Zap, color: "#3b82f6", desc: "total interactions" },
                { label: "At Risk", value: ov.topics_needs_attention, icon: AlertTriangle, color: ov.topics_needs_attention > 0 ? "#f87171" : "#34d399", desc: ov.topics_needs_attention > 0 ? "need attention" : "all good" },
              ].map(({ label, value, icon: Icon, color, desc }) => (
                <div key={label} className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
                      <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                    <span className="text-[11px] text-slate-500 font-medium uppercase tracking-wider">{label}</span>
                  </div>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════════════════════════
               SECTION 2 — Topic Mastery
             ═══════════════════════════════════════════════════════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
            <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-violet-400" />
              Topic Mastery
              <span className="text-[10px] text-slate-500 font-normal ml-auto">{state.topics.length} topics</span>
            </h2>

            <div className="space-y-2">
              {state.topics.map((t, i) => {
                const has = (t.assessment_stats?.total ?? 0) > 0;
                const badge = lb(t.level);
                const isOpen = expandedTopic === t.topic;
                return (
                  <motion.div key={t.topic} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                    <button
                      onClick={() => setExpandedTopic(isOpen ? null : t.topic)}
                      className={`w-full text-left rounded-2xl border transition-all duration-200 ${
                        isOpen ? "bg-white/[0.04] border-violet-500/20" : "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.1]"
                      }`}
                    >
                      <div className="flex items-center gap-4 px-5 py-4">
                        <Ring value={t.mastery} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2.5">
                            <span className="text-sm font-medium text-white truncate">{t.topic}</span>
                            {t.velocity?.direction === "improving" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                            {t.velocity?.direction === "declining" && <TrendingDown className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                            {t.calibration?.is_overconfident && <Eye className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />}
                          </div>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                            <span className="text-[11px] text-slate-500">{has ? `${t.assessment_stats!.correct}/${t.assessment_stats!.total} correct` : "No assessments"}</span>
                            <span className="text-[11px] text-slate-600">{t.days_since_last < 1 ? "Active today" : `${Math.round(t.days_since_last)}d ago`}</span>
                          </div>
                        </div>
                        {/* Progress bar */}
                        <div className="w-32 flex-shrink-0 hidden md:block">
                          <div className="h-2 bg-white/[0.06] rounded-full overflow-hidden">
                            <motion.div className="h-full rounded-full" style={{ backgroundColor: mc(t.mastery) }}
                              initial={{ width: 0 }} animate={{ width: `${t.mastery}%` }} transition={{ delay: 0.1 + i * 0.03, duration: 0.6 }} />
                          </div>
                        </div>
                        <ChevronRight className={`w-4 h-4 text-slate-600 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`} />
                      </div>
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="mt-1 mb-2 p-5 rounded-2xl bg-white/[0.02] border border-white/[0.05] space-y-4">
                            {t.explanation && <p className="text-xs text-slate-400 italic">{t.explanation}</p>}
                            {t.mastery_breakdown && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                                {[
                                  { label: "Knowledge", val: t.mastery_breakdown.bkt_score, max: 55, sub: "BKT probability from assessments", color: "#8b5cf6" },
                                  { label: "Engagement", val: t.mastery_breakdown.exposure_credit, max: 20, sub: "Credit from study activities", color: "#3b82f6" },
                                  { label: "Retention", val: t.mastery_breakdown.retention_mod, max: 15, sub: "Memory decay factor", color: t.mastery_breakdown.retention_mod >= 0 ? "#34d399" : "#f87171" },
                                  { label: "Calibration", val: t.mastery_breakdown.calibration_mod, max: 10, sub: "Confidence vs accuracy", color: t.mastery_breakdown.calibration_mod >= 0 ? "#22d3ee" : "#fbbf24" },
                                ].map(b => (
                                  <div key={b.label} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.04]">
                                    <div className="flex justify-between items-baseline mb-2">
                                      <span className="text-[10px] text-slate-500 font-medium">{b.label}</span>
                                      <span className="text-sm font-bold text-white">{b.val > 0 ? "+" : ""}{b.val.toFixed(0)}</span>
                                    </div>
                                    <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden mb-1.5">
                                      <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(b.val) / b.max) * 100)}%`, backgroundColor: b.color, transition: "width 0.4s" }} />
                                    </div>
                                    <p className="text-[9px] text-slate-600">{b.sub}</p>
                                  </div>
                                ))}
                              </div>
                            )}
                            {!has && (
                              <Link href="/question" className="flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/15 transition">
                                <PenTool className="w-4 h-4 text-violet-400" />
                                <span className="text-xs font-semibold text-violet-400">Take a quiz to unlock knowledge tracking</span>
                              </Link>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════════════════════════
               SECTION 3 — Study Plan (full-width, spacious calendar)
             ═══════════════════════════════════════════════════════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-violet-400" />
                Today&apos;s Study Plan
              </h2>
              <div className="flex items-center gap-3">
                {plan && <span className="text-[11px] text-slate-500"><Timer className="w-3.5 h-3.5 inline mr-1" />{plan.total_planned_minutes} min total</span>}
                <select value={studyHours} onChange={(e) => setStudyHours(Number(e.target.value))}
                  className="text-xs bg-white/[0.04] border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-slate-400 focus:outline-none focus:border-violet-500/30">
                  <option value={0.5}>30 min</option><option value={1}>1 hour</option><option value={2}>2 hours</option><option value={3}>3 hours</option>
                </select>
              </div>
            </div>

            {scheduleBlocks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {scheduleBlocks.map((block, i) => {
                  const pc = planColor(block.activity);
                  return (
                    <Link key={i} href={block.link} className={`group relative rounded-2xl border ${pc.border} ${pc.bg} p-5 hover:ring-1 ${pc.ring} transition-all`}>
                      {/* Time badge */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${pc.bg} border ${pc.border} ${pc.text}`}>
                            {planIcon(block.activity)}
                          </div>
                          <div>
                            <p className={`text-xs font-semibold ${pc.text}`}>{block.activity_label}</p>
                            <p className="text-[10px] text-slate-500">{block.startTime} — {block.endTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06]">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span className="text-[11px] font-medium text-slate-400">{block.minutes} min</span>
                        </div>
                      </div>

                      {/* Topic */}
                      <h3 className="text-base font-semibold text-white mb-1.5">{block.topic}</h3>
                      <p className="text-xs text-slate-400 leading-relaxed mb-4">{block.reason}</p>

                      {/* Bottom bar */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-16 bg-white/[0.06] rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${block.mastery}%`, backgroundColor: mc(block.mastery) }} />
                          </div>
                          <span className={`text-[10px] font-semibold ${mtc(block.mastery)}`}>{block.mastery}%</span>
                        </div>
                        <div className="flex items-center gap-1 text-xs font-medium text-violet-400 opacity-0 group-hover:opacity-100 transition-opacity">
                          Start <Play className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
                <Calendar className="w-10 h-10 text-slate-700 mx-auto mb-3" />
                <p className="text-sm text-slate-500">Start learning to get a personalized study plan</p>
              </div>
            )}
          </motion.div>

          {/* ═══════════════════════════════════════════════════════════
               SECTION 4 — AI Insights (full-width, 2-col, expandable)
             ═══════════════════════════════════════════════════════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-400" />
                AI Insights
              </h2>
              <span className="text-[10px] text-slate-600 bg-white/[0.04] px-2 py-0.5 rounded-full">cached</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {state.insights.map((ins, i) => {
                const isAlert = ins.severity === "high";
                const isGood = ins.severity === "positive";
                const isOpen = expandedInsight === i;

                // Distinct left accent + icon colors
                const accent = isAlert ? "border-l-red-400" : isGood ? "border-l-emerald-400" : "border-l-amber-400";
                const iconColor = isAlert ? "text-red-400" : isGood ? "text-emerald-400" : "text-amber-400";
                const iconEl = isAlert ? <AlertTriangle className="w-4 h-4" /> : isGood ? <CheckCircle2 className="w-4 h-4" /> : <Lightbulb className="w-4 h-4" />;

                return (
                  <div key={i} className={`rounded-xl border border-white/[0.08] bg-[#13131f] border-l-[3px] ${accent} overflow-hidden transition-all hover:border-white/[0.12]`}>
                    <button onClick={() => setExpandedInsight(isOpen ? null : i)} className="w-full text-left px-5 py-4">
                      <div className="flex items-center gap-3">
                        <span className={`${iconColor} flex-shrink-0`}>{iconEl}</span>
                        <p className="text-[13px] font-semibold text-slate-200 flex-1 truncate">{ins.title}</p>
                        <ChevronDown className={`w-4 h-4 text-slate-500 flex-shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                      {ins.topic && <p className="text-[10px] text-slate-500 mt-1 ml-7">{ins.topic}</p>}
                    </button>

                    <AnimatePresence>
                      {isOpen && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="overflow-hidden">
                          <div className="px-5 pb-4 pt-0 ml-7 border-t border-white/[0.05]">
                            <p className="text-[12px] text-slate-400 leading-relaxed mt-3">{ins.description}</p>
                            <Link href={ins.action_link} className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs font-semibold text-violet-400 hover:bg-violet-500/20 transition">
                              {ins.action} <ArrowRight className="w-3 h-3" />
                            </Link>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </motion.div>

          {/* ═══════════════════════════════════════════════════════════
               SECTION 5 — Quick Actions
             ═══════════════════════════════════════════════════════════ */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <div className="grid grid-cols-3 gap-4">
              {[
                { href: "/question", icon: PenTool, label: "Take a Quiz", desc: "Test your knowledge", color: "violet" },
                { href: "/solver", icon: Calculator, label: "Smart Solver", desc: "Solve problems step-by-step", color: "blue" },
                { href: "/guide", icon: GraduationCap, label: "Guided Learning", desc: "Structured learning paths", color: "emerald" },
              ].map(({ href, icon: Icon, label, desc, color }) => (
                <Link key={label} href={href}
                  className={`group rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 hover:border-${color}-500/25 hover:bg-${color}-500/[0.04] transition-all`}
                >
                  <Icon className={`w-5 h-5 text-slate-500 group-hover:text-${color}-400 transition mb-3`} />
                  <p className="text-sm font-medium text-white">{label}</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">{desc}</p>
                </Link>
              ))}
            </div>
          </motion.div>

          {/* Bottom spacing */}
          <div className="h-4" />

        </div>
      </div>
    </div>
  );
}
