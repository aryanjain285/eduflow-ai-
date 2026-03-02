"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  PenTool,
  Loader2,
  RefreshCw,
  Database,
  Activity,
  CheckCircle2,
  BrainCircuit,
  FileText,
  Upload,
  Sparkles,
  Book,
  Zap,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Lightbulb,
  Clock,
  ChevronRight,
  Play,
  TrendingUp,
  X,
} from "lucide-react";
import { useGlobal } from "@/context/GlobalContext";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { LogDrawer } from "@/components/question";
import { useQuestionReducer } from "@/hooks/useQuestionReducer";
import { useTranslation } from "react-i18next";

export default function QuestionPage() {
  const {
    questionState,
    setQuestionState,
    startQuestionGen,
    startMimicQuestionGen,
    resetQuestionGen,
  } = useGlobal();
  const { t } = useTranslation();

  // Dashboard state for parallel generation
  const [dashboardState, dispatchDashboard] = useQuestionReducer();

  // UI state
  const [activeIdx, setActiveIdx] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
  const [submittedMap, setSubmittedMap] = useState<Record<number, boolean>>({});
  const [kbs, setKbs] = useState<string[]>([]);
  const [showLogDrawer, setShowLogDrawer] = useState(false);
  const [showNotebookModal, setShowNotebookModal] = useState(false);
  const [confidenceRatings, setConfidenceRatings] = useState<Record<number, number>>({});
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [masteryFeedback, setMasteryFeedback] = useState<{ prev: number; next: number; level: string } | null>(null);
  const [topicMasteryCache, setTopicMasteryCache] = useState<Record<string, number>>({});
  const [pastBatches, setPastBatches] = useState<Array<{
    batch_id: string; timestamp: string | null; topic: string;
    difficulty: string; question_type: string; requested: number; completed: number; failed: number;
  }>>([]);
  const [loadingBatch, setLoadingBatch] = useState<string | null>(null);

  // Derived state
  const isGenerating = questionState.step === "generating";
  const isComplete = questionState.step === "result";
  const isConfigMode = questionState.step === "config";
  const totalQuestions = questionState.results.length;
  const currentQuestion = questionState.results[activeIdx];
  const extendedCount = questionState.results.filter(
    (r: any) => r.extended,
  ).length;

  // Progress info from questionState
  const progress = questionState.progress || {};
  const stage =
    progress.stage ||
    (isGenerating ? "generating" : isComplete ? "complete" : null);
  const subFocuses = progress.subFocuses || [];

  // Fetch KBs on mount
  useEffect(() => {
    let isMounted = true;
    const controller = new AbortController();

    fetch(apiUrl("/api/v1/knowledge/list"), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const names = data.map((kb: any) => kb.name);
        setKbs(names);
        if (!questionState.selectedKb && names.length > 0) {
          setQuestionState((prev) => ({ ...prev, selectedKb: names[0] }));
        }
      })
      .catch((err) => {
        if (err.name !== "AbortError") {
          console.error("Failed to fetch KBs:", err);
        }
      });

    // Fetch past batches
    fetch(apiUrl("/api/v1/question/batches"), { signal: controller.signal })
      .then((res) => res.json())
      .then((data) => { if (isMounted && Array.isArray(data)) setPastBatches(data); })
      .catch(() => {});

    return () => {
      isMounted = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-select first question when results come in
  useEffect(() => {
    if (
      questionState.results.length > 0 &&
      activeIdx >= questionState.results.length
    ) {
      setActiveIdx(0);
    }
  }, [questionState.results.length, activeIdx]);

  const handleStart = () => {
    if (questionState.mode === "knowledge") {
      startQuestionGen(
        questionState.topic,
        questionState.difficulty,
        questionState.type,
        questionState.count,
        questionState.selectedKb,
      );
    } else {
      // Mimic mode: don't limit questions by default (process all reference questions)
      // Only limit if user explicitly sets a value via maxQuestions state
      startMimicQuestionGen(
        questionState.uploadedFile,
        questionState.paperPath,
        questionState.selectedKb,
        undefined, // Let backend process all reference questions
      );
    }
    setUserAnswers({});
    setSubmittedMap({});
    setActiveIdx(0);
  };

  const handleAnswer = (val: string) => {
    if (submittedMap[activeIdx]) return;
    setUserAnswers((prev) => ({ ...prev, [activeIdx]: val }));
  };

  const handleSubmit = () => {
    setSubmittedMap((prev) => ({ ...prev, [activeIdx]: true }));

    // Record assessment outcome to backend (fire-and-forget)
    if (currentQuestion) {
      const q = currentQuestion.question;
      const isChoice =
        q.question_type === "choice" || q.type === "choice";
      const isCorrect = isChoice
        ? userAnswers[activeIdx] === q.correct_answer
        : false; // Written answers: backend can evaluate later
      const topic =
        q.knowledge_point || questionState.selectedKb || questionState.topic || "Unknown";

      const prevMastery = topicMasteryCache[topic] ?? 0;

      fetch(apiUrl("/api/v1/learning-state/record-assessment"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledge_base_id: questionState.selectedKb || "",
          question_text: q.question || "",
          user_answer: userAnswers[activeIdx] || "",
          correct_answer: q.correct_answer || "",
          is_correct: isCorrect,
          confidence: confidenceRatings[activeIdx] || 3,
          difficulty: q.difficulty || "medium",
          question_type: q.question_type || q.type || "choice",
          topic,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && typeof data.mastery === "number") {
            setTopicMasteryCache((prev) => ({ ...prev, [topic]: data.mastery }));
            setMasteryFeedback({ prev: prevMastery, next: data.mastery, level: data.level || "" });
            setTimeout(() => setMasteryFeedback(null), 4000);
          }
        })
        .catch(() => {});
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (file && file.type !== "application/pdf") {
      alert(t("Please upload a PDF exam paper"));
      return;
    }
    setQuestionState((prev) => ({
      ...prev,
      uploadedFile: file,
      paperPath: file ? "" : prev.paperPath,
    }));
  };

  const handleReset = () => {
    resetQuestionGen();
    setUserAnswers({});
    setSubmittedMap({});
    setConfidenceRatings({});
    setActiveIdx(0);
  };

  const handleLoadBatch = async (batchId: string) => {
    setLoadingBatch(batchId);
    try {
      const res = await fetch(apiUrl(`/api/v1/question/batches/${batchId}`));
      const data = await res.json();
      if (data.error) return;
      // Load the batch results into the question state
      const results = (data.results || []).map((r: any) => ({
        question: r.question,
        analysis: r.analysis,
        validation: r.validation,
        extended: false,
      }));
      if (results.length > 0) {
        setQuestionState((prev: any) => ({
          ...prev,
          step: "result",
          results,
          count: results.length,
          topic: data.plan?.knowledge_point || prev.topic,
        }));
        setUserAnswers({});
        setSubmittedMap({});
        setConfidenceRatings({});
        setActiveIdx(0);
      }
    } catch (err) {
      console.error("Failed to load batch:", err);
    } finally {
      setLoadingBatch(null);
    }
  };

  const canStart =
    questionState.mode === "knowledge"
      ? questionState.topic.trim().length > 0
      : questionState.uploadedFile !== null ||
        questionState.paperPath.trim().length > 0;

  return (
    <div className="h-screen flex gap-0 p-4 animate-fade-in overflow-hidden">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col bg-white dark:bg-white/[0.05] rounded-2xl shadow-sm dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] border border-slate-200 dark:border-white/[0.08] overflow-hidden dark:backdrop-blur-xl">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-white/[0.08] bg-slate-50/50 dark:bg-white/[0.04] flex justify-between items-center backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-slate-700 dark:text-slate-200 font-semibold">
              <PenTool className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              {t("Question Generator")}
            </div>

            {/* Mode Switching */}
            {isConfigMode && (
              <div className="flex bg-slate-100 dark:bg-white/[0.06] p-1 rounded-lg border border-slate-200 dark:border-white/[0.08]">
                <button
                  onClick={() =>
                    setQuestionState((prev) => ({ ...prev, mode: "knowledge" }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    questionState.mode === "knowledge"
                      ? "bg-white dark:bg-white/[0.05] text-purple-700 dark:text-purple-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <BrainCircuit className="w-4 h-4" />
                  {t("Custom")}
                </button>
                <button
                  onClick={() =>
                    setQuestionState((prev) => ({ ...prev, mode: "mimic" }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                    questionState.mode === "mimic"
                      ? "bg-white dark:bg-white/[0.05] text-purple-700 dark:text-purple-400 shadow-sm"
                      : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  {t("Mimic Exam")}
                </button>
              </div>
            )}

            {/* Status indicator when generating/complete */}
            {!isConfigMode && (
              <div className="flex items-center gap-2 text-sm">
                {isGenerating ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>
                      {t("Generating")} {totalQuestions}/{questionState.count}
                      ...
                    </span>
                  </div>
                ) : isComplete ? (
                  <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {totalQuestions} {t("questions")}
                    </span>
                    {extendedCount > 0 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        ({extendedCount} {t("extended")})
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Knowledge Base selector */}
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              <select
                value={questionState.selectedKb}
                onChange={(e) =>
                  setQuestionState((prev) => ({
                    ...prev,
                    selectedKb: e.target.value,
                  }))
                }
                disabled={isGenerating}
                className="text-sm bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-1.5 outline-none focus:border-purple-400 dark:text-slate-200 disabled:opacity-50"
              >
                {kbs.map((kb) => (
                  <option key={kb} value={kb}>
                    {kb}
                  </option>
                ))}
              </select>
            </div>

            {/* Log Drawer Toggle */}
            {!isConfigMode && (
              <button
                onClick={() => setShowLogDrawer(true)}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
              >
                <Activity className="w-4 h-4" />
                {t("Logs")}
              </button>
            )}

            {/* New/Reset button */}
            {!isConfigMode && (
              <button
                onClick={handleReset}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 px-3 py-1.5 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg border border-slate-200 dark:border-white/[0.08] transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t("New")}
              </button>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {/* Config Mode */}
          {isConfigMode && (
            <div className="p-8">
              <div className="max-w-xl mx-auto space-y-8">

                {/* Topic Input — hero-style */}
                {questionState.mode === "knowledge" && (
                  <div>
                    <label className="text-sm font-medium text-slate-300 mb-2 block">
                      {t("What do you want to be quizzed on?")}
                    </label>
                    <input
                      type="text"
                      value={questionState.topic}
                      onChange={(e) =>
                        setQuestionState((prev) => ({
                          ...prev,
                          topic: e.target.value,
                        }))
                      }
                      placeholder={t("e.g. Gradient Descent Optimization")}
                      className="w-full px-5 py-4 bg-transparent border-b-2 border-white/[0.1] focus:border-purple-500 outline-none text-xl font-medium text-white placeholder:text-slate-600 transition-colors"
                      autoFocus
                    />
                  </div>
                )}

                {/* Mimic Mode — PDF Upload */}
                {questionState.mode === "mimic" && (
                  <div className="space-y-5">
                    <div>
                      <label className="text-sm font-medium text-slate-300 mb-3 block">
                        {t("Upload an exam paper to generate similar questions")}
                      </label>
                      <div className="relative">
                        <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" id="pdf-upload" />
                        <label htmlFor="pdf-upload"
                          className="flex items-center justify-center gap-3 w-full py-10 border border-dashed border-white/[0.1] rounded-2xl cursor-pointer hover:border-purple-500/40 hover:bg-purple-500/[0.03] transition-all"
                        >
                          {questionState.uploadedFile ? (
                            <div className="flex items-center gap-3 text-purple-400">
                              <FileText className="w-6 h-6" />
                              <div>
                                <p className="font-medium text-white">{questionState.uploadedFile.name}</p>
                                <p className="text-xs text-slate-500">{(questionState.uploadedFile.size / 1024 / 1024).toFixed(2)} MB</p>
                              </div>
                            </div>
                          ) : (
                            <div className="text-center">
                              <Upload className="w-6 h-6 mx-auto mb-2 text-slate-500" />
                              <p className="text-sm font-medium text-slate-400">{t("Click to upload PDF")}</p>
                              <p className="text-xs text-slate-600 mt-1">{t("The system will parse and generate questions")}</p>
                            </div>
                          )}
                        </label>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-px bg-white/[0.06]"></div>
                      <span className="text-xs text-slate-600">{t("OR")}</span>
                      <div className="flex-1 h-px bg-white/[0.06]"></div>
                    </div>

                    <input
                      type="text"
                      value={questionState.paperPath}
                      onChange={(e) =>
                        setQuestionState((prev) => ({ ...prev, paperPath: e.target.value, uploadedFile: null }))
                      }
                      placeholder={t("Pre-parsed directory path (e.g. 2211asm1)")}
                      className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl outline-none focus:border-purple-500 text-sm text-slate-200 placeholder:text-slate-600 transition-colors"
                    />
                  </div>
                )}

                {/* Options Row — inline pills */}
                {questionState.mode === "knowledge" && (
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* Count */}
                    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
                      <span className="text-xs text-slate-500">{t("Count")}</span>
                      <input
                        type="number" min="1" max="50"
                        value={questionState.count || ""}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          if (rawVal === "") { setQuestionState((prev) => ({ ...prev, count: 0 })); return; }
                          const val = parseInt(rawVal);
                          if (!isNaN(val)) setQuestionState((prev) => ({ ...prev, count: Math.min(50, Math.max(0, val)) }));
                        }}
                        onBlur={(e) => {
                          const val = parseInt(e.target.value) || 1;
                          setQuestionState((prev) => ({ ...prev, count: Math.max(1, Math.min(50, val)) }));
                        }}
                        className="w-10 bg-transparent text-center text-sm font-semibold text-white outline-none"
                      />
                    </div>

                    {/* Difficulty */}
                    <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                      {(["easy", "medium", "hard"] as const).map((d) => (
                        <button key={d} onClick={() => setQuestionState((prev) => ({ ...prev, difficulty: d }))}
                          className={`px-4 py-2.5 text-xs font-medium capitalize transition-all ${
                            questionState.difficulty === d
                              ? "bg-purple-500/20 text-purple-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {t(d.charAt(0).toUpperCase() + d.slice(1))}
                        </button>
                      ))}
                    </div>

                    {/* Type */}
                    <div className="flex rounded-xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
                      {([{ val: "choice", label: "MCQ" }, { val: "written", label: "Written" }] as const).map(({ val, label }) => (
                        <button key={val} onClick={() => setQuestionState((prev) => ({ ...prev, type: val }))}
                          className={`px-4 py-2.5 text-xs font-medium transition-all ${
                            questionState.type === val
                              ? "bg-purple-500/20 text-purple-300"
                              : "text-slate-500 hover:text-slate-300"
                          }`}
                        >
                          {t(label)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Generate Button */}
                <button
                  onClick={handleStart}
                  disabled={!canStart || isGenerating}
                  className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-2xl font-semibold text-base shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Sparkles className="w-5 h-5" />
                  {t("Generate Questions")}
                </button>

                {/* Previous Quizzes */}
                {pastBatches.length > 0 && (
                  <div className="pt-4 border-t border-slate-200 dark:border-white/[0.06]">
                    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {t("Previous Quizzes")}
                    </h3>
                    <div className="space-y-2">
                      {pastBatches.map((batch) => {
                        const date = batch.timestamp
                          ? new Date(batch.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
                          : "Unknown date";
                        const diffColor = batch.difficulty === "hard" ? "text-red-400 bg-red-500/10" : batch.difficulty === "medium" ? "text-amber-400 bg-amber-500/10" : "text-emerald-400 bg-emerald-500/10";
                        const isLoading = loadingBatch === batch.batch_id;
                        return (
                          <button
                            key={batch.batch_id}
                            onClick={() => handleLoadBatch(batch.batch_id)}
                            disabled={isLoading}
                            className="w-full text-left flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-white/[0.06] bg-white dark:bg-white/[0.02] hover:border-purple-400/40 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 transition-all group disabled:opacity-50"
                          >
                            <div className="w-9 h-9 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                              {isLoading ? (
                                <Loader2 className="w-4 h-4 text-purple-400 animate-spin" />
                              ) : (
                                <FileText className="w-4 h-4 text-purple-400" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">{batch.topic}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[10px] text-slate-400">{date}</span>
                                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${diffColor}`}>{batch.difficulty}</span>
                                <span className="text-[10px] text-slate-500">{batch.completed}/{batch.requested} questions</span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-purple-400 transition flex-shrink-0" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Question Display Mode */}
          {!isConfigMode && (
            <div className="flex h-full">
              {/* Left: Question List */}
              <div className="w-72 flex-shrink-0 border-r border-slate-100 dark:border-white/[0.08] bg-white dark:bg-white/[0.05] flex flex-col">
                <div className="p-3 border-b border-slate-100 dark:border-white/[0.08]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t("Questions")}
                    </span>
                    <span className="text-xs text-slate-400">
                      {totalQuestions}/{questionState.count}
                    </span>
                  </div>
                  {isGenerating && questionState.count > 0 && (
                    <div className="mt-2 h-1 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-purple-500 transition-all duration-300"
                        style={{
                          width: `${(totalQuestions / questionState.count) * 100}%`,
                        }}
                      />
                    </div>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2">
                  {totalQuestions === 0 && isGenerating && (
                    <div className="flex flex-col items-center justify-center h-full text-slate-400">
                      <Loader2 className="w-8 h-8 animate-spin mb-2" />
                      <p className="text-sm">{t("Generating...")}</p>
                    </div>
                  )}
                  {questionState.results.map((result: any, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveIdx(idx)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg transition-all mb-1 ${
                        activeIdx === idx
                          ? "bg-purple-50 dark:bg-purple-900/30 border-l-2 border-purple-500"
                          : "hover:bg-slate-50 dark:hover:bg-white/[0.07]"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                            result.extended
                              ? "bg-amber-100 dark:bg-amber-900/40 text-amber-600"
                              : submittedMap[idx]
                                ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600"
                                : activeIdx === idx
                                  ? "bg-purple-100 dark:bg-purple-900/40 text-purple-600"
                                  : "bg-slate-100 dark:bg-white/[0.06] text-slate-500"
                          }`}
                        >
                          {result.extended ? (
                            <Zap className="w-3.5 h-3.5" />
                          ) : submittedMap[idx] ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p
                            className={`text-sm line-clamp-2 ${activeIdx === idx ? "text-slate-800 dark:text-slate-100 font-medium" : "text-slate-600 dark:text-slate-300"}`}
                          >
                            {result.question.question.slice(0, 80)}...
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-slate-400 uppercase">
                              {result.question.type ||
                                result.question.question_type}
                            </span>
                            {result.extended && (
                              <span className="text-xs text-amber-500">
                                {t("Extended")}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Right: Question Detail */}
              <div className="flex-1 flex flex-col overflow-hidden">
                {currentQuestion ? (
                  <>
                    {/* Question Header */}
                    <div className="px-6 py-3 border-b border-slate-100 dark:border-white/[0.08] flex items-center justify-between bg-white dark:bg-white/[0.05]">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-slate-500">
                          Question {activeIdx + 1}
                        </span>
                        <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-white/[0.06] text-slate-500 rounded">
                          {currentQuestion.question.type ||
                            currentQuestion.question.question_type}
                        </span>
                        {currentQuestion.extended && (
                          <span className="px-2 py-0.5 text-xs font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-900/40 text-amber-600 rounded flex items-center gap-1">
                            <Zap className="w-3 h-3" />
                            {t("Extended")}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => setShowNotebookModal(true)}
                        className="text-xs text-indigo-500 hover:text-indigo-600 flex items-center gap-1 px-2 py-1 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                      >
                        <Book className="w-3 h-3" />
                        {t("Add to Notebook")}
                      </button>
                    </div>

                    {/* Question Content */}
                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                      {/* Question Text */}
                      <div className="prose prose-slate dark:prose-invert max-w-none">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeKatex]}
                        >
                          {processLatexContent(
                            currentQuestion.question.question,
                          )}
                        </ReactMarkdown>
                      </div>

                      {/* Options or Input */}
                      {(currentQuestion.question.question_type === "choice" ||
                        currentQuestion.question.type === "choice") &&
                      currentQuestion.question.options &&
                      Object.keys(currentQuestion.question.options).length >
                        0 ? (
                        <div className="space-y-3">
                          {Object.entries(currentQuestion.question.options).map(
                            ([key, val]) => {
                              const isSelected = userAnswers[activeIdx] === key;
                              const isCorrect =
                                key === currentQuestion.question.correct_answer;
                              const showCorrectness = submittedMap[activeIdx];

                              return (
                                <button
                                  key={key}
                                  onClick={() =>
                                    !submittedMap[activeIdx] &&
                                    handleAnswer(key)
                                  }
                                  disabled={submittedMap[activeIdx]}
                                  className={`w-full text-left p-4 rounded-xl border transition-all flex items-start gap-4 prose dark:prose-invert max-w-none ${
                                    showCorrectness
                                      ? isCorrect
                                        ? "bg-emerald-50 dark:bg-emerald-900/30 border-emerald-300"
                                        : isSelected
                                          ? "bg-red-50 dark:bg-red-900/30 border-red-300"
                                          : "bg-white dark:bg-white/[0.06] border-slate-200 dark:border-white/[0.08]"
                                      : isSelected
                                        ? "bg-purple-50 dark:bg-purple-900/30 border-purple-300"
                                        : "bg-white dark:bg-white/[0.06] border-slate-200 dark:border-white/[0.08] hover:border-purple-300"
                                  }`}
                                >
                                  <span
                                    className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold ${
                                      showCorrectness && isCorrect
                                        ? "bg-emerald-500 text-white"
                                        : showCorrectness &&
                                            isSelected &&
                                            !isCorrect
                                          ? "bg-red-500 text-white"
                                          : isSelected
                                            ? "bg-purple-500 text-white"
                                            : "bg-slate-100 dark:bg-white/[0.05] text-slate-600 dark:text-slate-300"
                                    }`}
                                  >
                                    {key}
                                  </span>
                                  <div className="flex-1">
                                    <ReactMarkdown
                                      remarkPlugins={[remarkGfm, remarkMath]}
                                      rehypePlugins={[rehypeKatex]}
                                    >
                                      {processLatexContent(String(val))}
                                    </ReactMarkdown>
                                  </div>
                                  {showCorrectness && isCorrect && (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                                  )}
                                </button>
                              );
                            },
                          )}
                        </div>
                      ) : (
                        <textarea
                          value={userAnswers[activeIdx] || ""}
                          onChange={(e) => handleAnswer(e.target.value)}
                          disabled={submittedMap[activeIdx]}
                          placeholder={t("Type your answer here...")}
                          className="w-full h-40 p-4 bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl outline-none focus:border-purple-500 focus:ring-2 focus:ring-purple-500/10 resize-none text-slate-800 dark:text-slate-200 placeholder:text-slate-400"
                        />
                      )}

                      {/* Answer & Explanation (shown after submit) */}
                      {submittedMap[activeIdx] && (
                        <div className="space-y-4 pt-4 border-t border-slate-100 dark:border-white/[0.08]">
                          {/* Correct Answer */}
                          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-100 dark:border-emerald-800">
                            <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-2">
                              {t("Correct Answer")}
                            </p>
                            <div className="text-emerald-800 dark:text-emerald-200 prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown
                                remarkPlugins={[remarkGfm, remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                              >
                                {processLatexContent(
                                  String(
                                    currentQuestion.question.correct_answer,
                                  ),
                                )}
                              </ReactMarkdown>
                            </div>
                          </div>

                          {/* Explanation */}
                          {currentQuestion.question.explanation && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                                {t("Explanation")}
                              </p>
                              <div className="text-slate-700 dark:text-slate-300 prose prose-sm dark:prose-invert max-w-none">
                                <ReactMarkdown
                                  remarkPlugins={[remarkGfm, remarkMath]}
                                  rehypePlugins={[rehypeKatex]}
                                >
                                  {processLatexContent(
                                    currentQuestion.question.explanation,
                                  )}
                                </ReactMarkdown>
                              </div>
                            </div>
                          )}

                          {/* Relevance Analysis (collapsible) */}
                          {currentQuestion.validation && (
                            <div className="border border-slate-200 dark:border-white/[0.08] rounded-xl overflow-hidden">
                              <button
                                onClick={() => setShowAnalysis(!showAnalysis)}
                                className="w-full px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-white/[0.06] hover:bg-slate-100 dark:hover:bg-white/[0.08] transition-colors"
                              >
                                <div className="flex items-center gap-2 text-sm">
                                  <AlertCircle className="w-4 h-4 text-slate-400" />
                                  <span className="font-medium text-slate-600 dark:text-slate-300">
                                    {t("Relevance Analysis")}
                                  </span>
                                  <span className="text-xs px-1.5 py-0.5 bg-slate-200 dark:bg-white/[0.05] text-slate-500 rounded">
                                    {currentQuestion.rounds || 1} {t("round")}
                                    {(currentQuestion.rounds || 1) > 1
                                      ? t("s")
                                      : ""}
                                  </span>
                                </div>
                                {showAnalysis ? (
                                  <ChevronUp className="w-4 h-4 text-slate-400" />
                                ) : (
                                  <ChevronDown className="w-4 h-4 text-slate-400" />
                                )}
                              </button>

                              {showAnalysis && (
                                <div className="px-4 py-3 space-y-3 text-sm bg-white dark:bg-white/[0.05]">
                                  {currentQuestion.validation.kb_coverage && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1">
                                        <Database className="w-3 h-3" />
                                        {t("KB Coverage")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {processLatexContent(
                                            currentQuestion.validation
                                              .kb_coverage,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                  {currentQuestion.validation
                                    .extension_points && (
                                    <div>
                                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                                        <Zap className="w-3 h-3" />
                                        {t("Extension Points")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {processLatexContent(
                                            currentQuestion.validation
                                              .extension_points,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                  {currentQuestion.extended &&
                                    currentQuestion.validation
                                      .kb_connection && (
                                      <div>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider mb-1">
                                          <Database className="w-3 h-3" />
                                          {t("KB Connection")}
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                          <ReactMarkdown
                                            remarkPlugins={[
                                              remarkGfm,
                                              remarkMath,
                                            ]}
                                            rehypePlugins={[rehypeKatex]}
                                          >
                                            {processLatexContent(
                                              currentQuestion.validation
                                                .kb_connection,
                                            )}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    )}
                                  {currentQuestion.extended &&
                                    currentQuestion.validation
                                      .extended_aspect && (
                                      <div>
                                        <div className="flex items-center gap-1.5 text-xs font-bold text-orange-600 uppercase tracking-wider mb-1">
                                          <Lightbulb className="w-3 h-3" />
                                          {t("Extended Aspects")}
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                          <ReactMarkdown
                                            remarkPlugins={[
                                              remarkGfm,
                                              remarkMath,
                                            ]}
                                            rehypePlugins={[rehypeKatex]}
                                          >
                                            {processLatexContent(
                                              currentQuestion.validation
                                                .extended_aspect,
                                            )}
                                          </ReactMarkdown>
                                        </div>
                                      </div>
                                    )}
                                  {currentQuestion.validation.reasoning && (
                                    <div>
                                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">
                                        {t("Reasoning")}
                                      </div>
                                      <div className="text-slate-600 dark:text-slate-300 prose prose-xs dark:prose-invert max-w-none">
                                        <ReactMarkdown
                                          remarkPlugins={[
                                            remarkGfm,
                                            remarkMath,
                                          ]}
                                          rehypePlugins={[rehypeKatex]}
                                        >
                                          {processLatexContent(
                                            currentQuestion.validation
                                              .reasoning,
                                          )}
                                        </ReactMarkdown>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Footer Actions */}
                    <div className="px-6 py-4 border-t border-slate-100 dark:border-white/[0.08] bg-white dark:bg-white/[0.05]">
                      {!submittedMap[activeIdx] ? (
                        <div className="space-y-3">
                          {/* Confidence Calibration */}
                          {userAnswers[activeIdx] && (
                            <div className="p-3 rounded-xl bg-violet-50 dark:bg-violet-500/[0.08] border border-violet-200 dark:border-violet-500/20">
                              <div className="flex items-center justify-between mb-2">
                                <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                                  {t("How confident are you?")}
                                </span>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                  (confidenceRatings[activeIdx] || 3) >= 4 ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" :
                                  (confidenceRatings[activeIdx] || 3) >= 2 ? "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400" :
                                  "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                                }`}>
                                  {["", "Guessing", "Unsure", "Somewhat sure", "Confident", "Very confident"][confidenceRatings[activeIdx] || 3]}
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-400">1</span>
                                <input
                                  type="range"
                                  min="1"
                                  max="5"
                                  value={confidenceRatings[activeIdx] || 3}
                                  onChange={(e) => setConfidenceRatings(prev => ({ ...prev, [activeIdx]: parseInt(e.target.value) }))}
                                  className="flex-1 h-2 bg-slate-200 dark:bg-white/[0.08] rounded-full appearance-none cursor-pointer accent-violet-500 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-500 [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-violet-500/30"
                                />
                                <span className="text-[10px] text-slate-400">5</span>
                              </div>
                            </div>
                          )}
                          <button
                            onClick={handleSubmit}
                            disabled={!userAnswers[activeIdx]}
                            className="w-full py-3 bg-purple-600 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                          >
                            {t("Submit Answer")}
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {/* Confidence feedback after submission */}
                          {confidenceRatings[activeIdx] && (() => {
                            const confidence = confidenceRatings[activeIdx];
                            const isCorrect = currentQuestion &&
                              userAnswers[activeIdx] === currentQuestion.question.correct_answer;
                            const isOverconfident = confidence >= 4 && !isCorrect;
                            const isUnderconfident = confidence <= 2 && isCorrect;

                            if (isOverconfident || isUnderconfident) {
                              return (
                                <div className={`p-3 rounded-xl border text-xs ${
                                  isOverconfident
                                    ? "bg-amber-50 dark:bg-amber-500/[0.08] border-amber-200 dark:border-amber-500/20 text-amber-700 dark:text-amber-300"
                                    : "bg-blue-50 dark:bg-blue-500/[0.08] border-blue-200 dark:border-blue-500/20 text-blue-700 dark:text-blue-300"
                                }`}>
                                  <span className="font-bold">
                                    {isOverconfident ? "Overconfident" : "Underconfident"}:
                                  </span>{" "}
                                  {isOverconfident
                                    ? `You rated ${confidence}/5 confidence but got it wrong. Review this topic more carefully.`
                                    : `You rated ${confidence}/5 confidence but got it right! Trust your knowledge more.`
                                  }
                                </div>
                              );
                            }
                            return null;
                          })()}
                          <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-xl">
                            <CheckCircle2 className="w-4 h-4" />
                            <span className="font-medium">{t("Submitted")}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center text-slate-400">
                    <div className="text-center">
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-12 h-12 animate-spin mx-auto mb-3 text-purple-500" />
                          <p className="text-lg font-medium text-slate-600 dark:text-slate-300">
                            {t("Generating questions...")}
                          </p>
                          <p className="text-sm">
                            {t("View progress in the Logs panel")}
                          </p>
                        </>
                      ) : (
                        <>
                          <Book className="w-12 h-12 mx-auto mb-3 opacity-30" />
                          <p className="text-sm">
                            {t("Select a question to view details")}
                          </p>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Log Drawer */}
      <LogDrawer
        isOpen={showLogDrawer}
        onClose={() => setShowLogDrawer(false)}
        logs={questionState.logs || []}
        stage={stage}
        progress={progress.progress}
        subFocuses={subFocuses}
        mode={questionState.mode === "knowledge" ? "custom" : "mimic"}
        topic={questionState.topic}
        difficulty={questionState.difficulty}
        questionType={questionState.type}
        count={questionState.count}
        onClearLogs={() => setQuestionState((prev) => ({ ...prev, logs: [] }))}
      />

      {/* Mastery Delta Toast */}
      <AnimatePresence>
        {masteryFeedback && (
          <motion.div
            initial={{ opacity: 0, y: 40, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
            className="fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-[#1e1b2e] border border-violet-500/25 shadow-2xl shadow-violet-500/10"
          >
            <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <p className="text-xs text-slate-400">Mastery Updated</p>
              <p className="text-sm font-bold text-white">
                {masteryFeedback.prev}% → {masteryFeedback.next}%
                <span className={`ml-1.5 text-xs font-semibold ${masteryFeedback.next >= masteryFeedback.prev ? "text-emerald-400" : "text-red-400"}`}>
                  ({masteryFeedback.next >= masteryFeedback.prev ? "+" : ""}{masteryFeedback.next - masteryFeedback.prev}%)
                </span>
              </p>
            </div>
            <button onClick={() => setMasteryFeedback(null)} className="ml-2 p-1 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition">
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add to Notebook Modal */}
      {currentQuestion && (
        <AddToNotebookModal
          isOpen={showNotebookModal}
          onClose={() => setShowNotebookModal(false)}
          recordType="question"
          title={`${questionState.topic} - ${currentQuestion.question.type || currentQuestion.question.question_type}`}
          userQuery={`Topic: ${questionState.topic}\nDifficulty: ${questionState.difficulty}\nType: ${questionState.type}`}
          output={`**Question:**\n${currentQuestion.question.question}\n\n**Options:**\n${
            currentQuestion.question.options
              ? Object.entries(currentQuestion.question.options)
                  .map(([k, v]) => `${k}. ${v}`)
                  .join("\n")
              : "N/A"
          }\n\n**Correct Answer:** ${currentQuestion.question.correct_answer}\n\n**Explanation:**\n${currentQuestion.question.explanation}`}
          metadata={{
            difficulty: questionState.difficulty,
            question_type: questionState.type,
            validation_rounds: currentQuestion.rounds,
            extended: currentQuestion.extended,
          }}
          kbName={questionState.selectedKb}
        />
      )}
    </div>
  );
}
