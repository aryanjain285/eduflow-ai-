"use client";

import {
  Loader2,
  Play,
  ChevronRight,
  CheckCircle2,
  Circle,
  Disc,
} from "lucide-react";
import { SessionState } from "../types";
import { useTranslation } from "react-i18next";

interface ProgressPanelProps {
  sessionState: SessionState;
  isLoading: boolean;
  loadingMessage: string;
  canStart: boolean;
  canNext: boolean;
  isLastKnowledge: boolean;
  onStartLearning: () => void;
  onNextKnowledge: () => void;
}

export default function ProgressPanel({
  sessionState,
  isLoading,
  loadingMessage,
  canStart,
  canNext,
  isLastKnowledge,
  onStartLearning,
  onNextKnowledge,
}: ProgressPanelProps) {
  const { t } = useTranslation();
  const { knowledge_points, current_index, progress } = sessionState;

  return (
    <div className="bg-white dark:bg-[#14142a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/[0.10] overflow-hidden">
      {/* Progress Header */}
      <div className="p-4 pb-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
            {t("Learning Progress")}
          </span>
          <span className="text-sm font-bold tabular-nums text-violet-600 dark:text-violet-400">
            {progress}%
          </span>
        </div>
        <div className="h-2 bg-slate-100 dark:bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-blue-500 rounded-full transition-all duration-700 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Knowledge Point Steps */}
      {knowledge_points.length > 0 && (
        <div className="px-4 pb-3 max-h-[200px] overflow-y-auto">
          <div className="space-y-1">
            {knowledge_points.map((kp, i) => {
              const isCompleted = i < current_index;
              const isCurrent = i === current_index;
              const isGenerating = isCurrent && isLoading;

              return (
                <div
                  key={i}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs transition-all ${
                    isCurrent
                      ? "bg-violet-50 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20"
                      : isCompleted
                        ? "opacity-60"
                        : "opacity-40"
                  }`}
                >
                  {/* Step Icon */}
                  {isCompleted ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : isCurrent ? (
                    isGenerating ? (
                      <Loader2 className="w-3.5 h-3.5 text-violet-500 animate-spin shrink-0" />
                    ) : (
                      <Disc className="w-3.5 h-3.5 text-violet-500 shrink-0" />
                    )
                  ) : (
                    <Circle className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                  )}

                  {/* Step Title */}
                  <span
                    className={`truncate ${
                      isCurrent
                        ? "font-semibold text-violet-700 dark:text-violet-300"
                        : isCompleted
                          ? "text-slate-500 dark:text-slate-400 line-through"
                          : "text-slate-400 dark:text-slate-500"
                    }`}
                  >
                    {i + 1}. {kp.knowledge_title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-4 pb-4 pt-1">
        {canStart && (
          <button
            onClick={onStartLearning}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-blue-600 text-white rounded-xl hover:from-violet-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium shadow-md shadow-violet-500/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{loadingMessage || t("Generating...")}</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                {t("Start Learning")}
              </>
            )}
          </button>
        )}

        {canNext && (
          <button
            onClick={onNextKnowledge}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-violet-500 to-blue-600 text-white rounded-xl hover:from-violet-600 hover:to-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium shadow-md shadow-violet-500/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{loadingMessage || t("Generating next lesson...")}</span>
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                {t("Next Knowledge Point")}
              </>
            )}
          </button>
        )}

        {isLastKnowledge && (
          <button
            onClick={onNextKnowledge}
            disabled={isLoading}
            className="w-full px-4 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl hover:from-emerald-600 hover:to-teal-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm font-medium shadow-md shadow-emerald-500/20"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{loadingMessage || t("Generating summary...")}</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                {t("Complete Learning")}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
