"use client";

import { useState, useEffect, useRef } from "react";
import {
  Lightbulb,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Loader2,
  Check,
  Save,
  RefreshCw,
  Sparkles,
  Brain,
  FileText,
  CheckCircle2,
  Circle,
  AlertCircle,
  Zap,
  X,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { apiUrl, wsUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { useGlobal } from "@/context/GlobalContext";
import { useTranslation } from "react-i18next";

interface Notebook {
  id: string;
  name: string;
  description: string;
  record_count: number;
  color: string;
}

interface NotebookRecord {
  id: string;
  title: string;
  user_query: string;
  output: string;
  type: string;
}

interface ResearchIdea {
  id: string;
  knowledge_point: string;
  description: string;
  research_ideas: string[];
  statement: string;
  expanded: boolean;
  selected: boolean;
}

// Extended interface to include notebook info
interface SelectedRecord extends NotebookRecord {
  notebookId: string;
  notebookName: string;
}

export default function IdeaGenPage() {
  // Global state for persistence across page navigation
  const { ideaGenState, setIdeaGenState } = useGlobal();
  const { t } = useTranslation();

  // Notebook selection - now supports multiple notebooks
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [expandedNotebooks, setExpandedNotebooks] = useState<Set<string>>(
    new Set(),
  );
  const [notebookRecordsMap, setNotebookRecordsMap] = useState<
    Map<string, NotebookRecord[]>
  >(new Map());
  const [selectedRecords, setSelectedRecords] = useState<
    Map<string, SelectedRecord>
  >(new Map()); // recordId -> record with notebook info
  const [loadingNotebooks, setLoadingNotebooks] = useState(true);
  const [loadingRecordsFor, setLoadingRecordsFor] = useState<Set<string>>(
    new Set(),
  );

  // User thoughts input
  const [userThoughts, setUserThoughts] = useState("");

  // Use global state for generation (persists across navigation)
  const isGenerating = ideaGenState.isGenerating;
  const generationStatus = ideaGenState.generationStatus;
  const generatedIdeas = ideaGenState.generatedIdeas;
  const progress = ideaGenState.progress;

  const setIsGenerating = (val: boolean) =>
    setIdeaGenState((prev) => ({ ...prev, isGenerating: val }));
  const setGenerationStatus = (val: string) =>
    setIdeaGenState((prev) => ({ ...prev, generationStatus: val }));
  const setGeneratedIdeas = (
    updater: ResearchIdea[] | ((prev: ResearchIdea[]) => ResearchIdea[]),
  ) => {
    setIdeaGenState((prev) => ({
      ...prev,
      generatedIdeas:
        typeof updater === "function" ? updater(prev.generatedIdeas) : updater,
    }));
  };
  const setProgress = (val: { current: number; total: number } | null) =>
    setIdeaGenState((prev) => ({ ...prev, progress: val }));

  // Save modal
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [ideaToSave, setIdeaToSave] = useState<ResearchIdea | null>(null);

  // Expanded idea detail view
  const [expandedIdeaId, setExpandedIdeaId] = useState<string | null>(null);
  // Collapsible panels
  const [sourceCollapsed, setSourceCollapsed] = useState(false);
  const [directionsCollapsed, setDirectionsCollapsed] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const ideasEndRef = useRef<HTMLDivElement | null>(null);

  // Load notebooks
  useEffect(() => {
    fetchNotebooks();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Auto-scroll to latest idea
  useEffect(() => {
    if (isGenerating && ideasEndRef.current) {
      ideasEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [generatedIdeas.length, isGenerating]);

  const fetchNotebooks = async () => {
    try {
      const res = await fetch(apiUrl("/api/v1/notebook/list"));
      const data = await res.json();
      const notebooksWithRecords = (data.notebooks || []).filter(
        (nb: Notebook) => nb.record_count > 0,
      );
      setNotebooks(notebooksWithRecords);
      setLoadingNotebooks(false);
    } catch (err) {
      console.error("Failed to fetch notebooks:", err);
      setLoadingNotebooks(false);
    }
  };

  const fetchNotebookRecords = async (notebookId: string) => {
    if (notebookRecordsMap.has(notebookId)) return; // Already fetched

    setLoadingRecordsFor((prev) => new Set([...prev, notebookId]));
    try {
      const res = await fetch(apiUrl(`/api/v1/notebook/${notebookId}`));
      const data = await res.json();
      setNotebookRecordsMap((prev) =>
        new Map(prev).set(notebookId, data.records || []),
      );
    } catch (err) {
      console.error("Failed to fetch notebook records:", err);
    } finally {
      setLoadingRecordsFor((prev) => {
        const newSet = new Set(prev);
        newSet.delete(notebookId);
        return newSet;
      });
    }
  };

  const toggleNotebookExpanded = (notebookId: string) => {
    const notebook = notebooks.find((nb) => nb.id === notebookId);
    if (!notebook) return;

    setExpandedNotebooks((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(notebookId)) {
        newSet.delete(notebookId);
      } else {
        newSet.add(notebookId);
        // Fetch records when expanding
        fetchNotebookRecords(notebookId);
      }
      return newSet;
    });
  };

  const toggleRecordSelection = (
    record: NotebookRecord,
    notebookId: string,
    notebookName: string,
  ) => {
    setSelectedRecords((prev) => {
      const newMap = new Map(prev);
      if (newMap.has(record.id)) {
        newMap.delete(record.id);
      } else {
        newMap.set(record.id, { ...record, notebookId, notebookName });
      }
      return newMap;
    });
  };

  const selectAllFromNotebook = (notebookId: string, notebookName: string) => {
    const records = notebookRecordsMap.get(notebookId) || [];
    setSelectedRecords((prev) => {
      const newMap = new Map(prev);
      records.forEach((r) =>
        newMap.set(r.id, { ...r, notebookId, notebookName }),
      );
      return newMap;
    });
  };

  const deselectAllFromNotebook = (notebookId: string) => {
    const records = notebookRecordsMap.get(notebookId) || [];
    const recordIds = new Set(records.map((r) => r.id));
    setSelectedRecords((prev) => {
      const newMap = new Map(prev);
      recordIds.forEach((id) => newMap.delete(id));
      return newMap;
    });
  };

  const clearAllSelections = () => {
    setSelectedRecords(new Map());
  };

  // Check if we can generate (either have records or user thoughts)
  const canGenerate =
    selectedRecords.size > 0 || userThoughts.trim().length > 0;

  const startGeneration = () => {
    if (!canGenerate) return;

    setIsGenerating(true);
    setGenerationStatus("Connecting...");
    setGeneratedIdeas([]);
    setProgress(null);
    setExpandedIdeaId(null);

    const ws = new WebSocket(wsUrl("/api/v1/ideagen/generate"));
    wsRef.current = ws;

    ws.onopen = () => {
      setGenerationStatus("Initializing...");
      // Send records directly for cross-notebook support (can be empty if only user thoughts)
      const recordsArray = Array.from(selectedRecords.values()).map((r) => ({
        id: r.id,
        title: r.title,
        user_query: r.user_query,
        output: r.output,
        type: r.type,
      }));
      ws.send(
        JSON.stringify({
          records: recordsArray.length > 0 ? recordsArray : undefined,
          user_thoughts: userThoughts.trim() || undefined,
        }),
      );
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      switch (data.type) {
        case "status":
          setGenerationStatus(data.message);
          // Check if this is the "complete" stage from backend
          if (data.stage === "complete") {
            setIsGenerating(false);
          }
          // Update progress from status data if available
          if (data.data?.index && data.data?.total) {
            setProgress({ current: data.data.index, total: data.data.total });
          }
          break;
        case "progress":
          if (data.data?.index && data.data?.total) {
            setProgress({ current: data.data.index, total: data.data.total });
          }
          break;
        case "idea":
          setGeneratedIdeas((prev) => [
            ...prev,
            { ...data.data, selected: false },
          ]);
          break;
        case "complete":
          setGenerationStatus("Completed!");
          setIsGenerating(false);
          break;
        case "error":
          setGenerationStatus(
            `Error: ${data.message || data.content || "Unknown error"}`,
          );
          setIsGenerating(false);
          break;
      }
    };

    ws.onerror = () => {
      setGenerationStatus("Connection Error");
      setIsGenerating(false);
    };

    ws.onclose = () => {
      wsRef.current = null;
    };
  };

  const toggleIdeaExpanded = (ideaId: string) => {
    setExpandedIdeaId(expandedIdeaId === ideaId ? null : ideaId);
  };

  const toggleIdeaSelected = (ideaId: string) => {
    setGeneratedIdeas((prev) =>
      prev.map((idea) =>
        idea.id === ideaId ? { ...idea, selected: !idea.selected } : idea,
      ),
    );
  };

  const selectAllIdeas = () => {
    setGeneratedIdeas((prev) =>
      prev.map((idea) => ({ ...idea, selected: true })),
    );
  };

  const deselectAllIdeas = () => {
    setGeneratedIdeas((prev) =>
      prev.map((idea) => ({ ...idea, selected: false })),
    );
  };

  const saveIdea = (idea: ResearchIdea) => {
    setIdeaToSave(idea);
    setShowSaveModal(true);
  };

  const saveSelectedIdeas = () => {
    const selected = generatedIdeas.filter((i) => i.selected);
    if (selected.length > 0) {
      // Merge all selected ideas
      const combinedIdea: ResearchIdea = {
        id: "combined",
        knowledge_point: t("Collection of Research Ideas"),
        description: t(
          "Research ideas containing {n} knowledge points",
        ).replace("{n}", String(selected.length)),
        research_ideas: selected.flatMap((i) => i.research_ideas),
        statement: selected.map((i) => i.statement).join("\n\n---\n\n"),
        expanded: false,
        selected: false,
      };
      setIdeaToSave(combinedIdea);
      setShowSaveModal(true);
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "solve":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      case "question":
        return "bg-purple-500/10 text-purple-400 border-purple-500/20";
      case "research":
        return "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
      case "co_writer":
        return "bg-amber-500/10 text-amber-400 border-amber-500/20";
      default:
        return "bg-slate-500/10 text-slate-400 border-slate-500/20";
    }
  };

  const expandedIdea = expandedIdeaId
    ? generatedIdeas.find((i) => i.id === expandedIdeaId)
    : null;

  return (
    <div className="h-screen flex animate-fade-in">
      {/* Left Panel: Source Selection (collapsible) */}
      <div className={`flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-white/[0.06] bg-slate-50/50 dark:bg-white/[0.02] transition-all duration-300 ${sourceCollapsed ? "w-[48px]" : "w-[300px]"}`}>
        {/* Panel Header */}
        <div className={`border-b border-slate-100 dark:border-white/[0.06] flex items-center ${sourceCollapsed ? "p-3 justify-center" : "p-3 gap-2"}`}>
          <button
            onClick={() => setSourceCollapsed(!sourceCollapsed)}
            className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-white/[0.08] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors flex-shrink-0"
            title={sourceCollapsed ? "Expand sources" : "Collapse sources"}
          >
            {sourceCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
          {!sourceCollapsed && (
            <>
              <BookOpen className="w-4 h-4 text-amber-500 flex-shrink-0" />
              <h2 className="font-semibold text-xs text-slate-900 dark:text-slate-100 truncate flex-1">
                {t("Select Source")}
              </h2>
              {selectedRecords.size > 0 && (
                <button
                  onClick={clearAllSelections}
                  className="text-[10px] text-slate-400 hover:text-red-500 flex-shrink-0"
                >
                  {t("Clear")} ({selectedRecords.size})
                </button>
              )}
            </>
          )}
          {sourceCollapsed && (
            <BookOpen className="w-4 h-4 text-amber-500" />
          )}
        </div>

        {/* Notebook List - hidden when collapsed */}
        <div className={`flex-1 overflow-y-auto ${sourceCollapsed ? "hidden" : ""}`}>
          {loadingNotebooks ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
            </div>
          ) : notebooks.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-400 dark:text-slate-500">
              {t("No notebooks with records found")}
            </div>
          ) : (
            <div>
              {notebooks.map((notebook) => {
                const isExpanded = expandedNotebooks.has(notebook.id);
                const records = notebookRecordsMap.get(notebook.id) || [];
                const isLoading = loadingRecordsFor.has(notebook.id);
                const selectedFromThis = records.filter((r) =>
                  selectedRecords.has(r.id),
                ).length;

                return (
                  <div key={notebook.id} className="border-b border-slate-100 dark:border-white/[0.04]">
                    {/* Notebook Header */}
                    <div
                      className="px-4 py-3 flex items-center gap-2.5 cursor-pointer hover:bg-white dark:hover:bg-white/[0.04] transition-colors"
                      onClick={() => toggleNotebookExpanded(notebook.id)}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: notebook.color || "#94a3b8" }}
                      />
                      <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                        {notebook.name}
                      </span>
                      <span className="text-xs text-slate-400">
                        {selectedFromThis > 0 && (
                          <span className="text-amber-500 font-medium">
                            {selectedFromThis}/
                          </span>
                        )}
                        {notebook.record_count}
                      </span>
                    </div>

                    {/* Records List */}
                    {isExpanded && (
                      <div className="px-4 pb-3 bg-white/50 dark:bg-white/[0.02]">
                        {isLoading ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                          </div>
                        ) : records.length === 0 ? (
                          <div className="py-2 text-xs text-slate-400 text-center">
                            {t("No records")}
                          </div>
                        ) : (
                          <>
                            <div className="flex gap-3 mb-2 pl-6">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  selectAllFromNotebook(notebook.id, notebook.name);
                                }}
                                className="text-[11px] text-amber-500 hover:text-amber-400"
                              >
                                Select All
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  deselectAllFromNotebook(notebook.id);
                                }}
                                className="text-[11px] text-slate-400 hover:text-slate-300"
                              >
                                Deselect
                              </button>
                            </div>
                            <div className="space-y-1 pl-6">
                              {records.map((record) => (
                                <div
                                  key={record.id}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRecordSelection(record, notebook.id, notebook.name);
                                  }}
                                  className={`p-2 rounded-lg cursor-pointer transition-all border text-sm ${
                                    selectedRecords.has(record.id)
                                      ? "bg-amber-500/10 border-amber-500/25"
                                      : "hover:bg-white dark:hover:bg-white/[0.04] border-transparent"
                                  }`}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                                        selectedRecords.has(record.id)
                                          ? "bg-amber-500 border-amber-500 text-white"
                                          : "border-slate-300 dark:border-slate-600"
                                      }`}
                                    >
                                      {selectedRecords.has(record.id) && (
                                        <Check className="w-2.5 h-2.5" />
                                      )}
                                    </div>
                                    <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${getTypeColor(record.type)}`}>
                                      {record.type}
                                    </span>
                                    <span className="text-xs text-slate-600 dark:text-slate-300 truncate">
                                      {record.title}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* User Thoughts Input - hidden when collapsed */}
        <div className={`p-4 border-t border-slate-100 dark:border-white/[0.06] ${sourceCollapsed ? "hidden" : ""}`}>
          <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">
            {t("Your Thoughts")}{" "}
            {selectedRecords.size > 0 ? `(${t("Optional")})` : `(${t("Required")})`}
          </label>
          <textarea
            value={userThoughts}
            onChange={(e) => setUserThoughts(e.target.value)}
            placeholder={
              selectedRecords.size > 0
                ? t("Describe your thoughts or research direction...")
                : t("Describe your research topic or idea...")
            }
            className="w-full px-3 py-2.5 bg-white dark:bg-white/[0.05] border border-slate-200 dark:border-white/[0.08] rounded-xl text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 resize-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
            rows={3}
          />
          {selectedRecords.size === 0 && (
            <p className="mt-1.5 text-[11px] text-amber-500">
              {t("You can generate ideas from text description alone, or select notebook records above for richer context.")}
            </p>
          )}
        </div>

        {/* Generate Button - hidden when collapsed */}
        <div className={`p-4 pt-0 ${sourceCollapsed ? "hidden" : ""}`}>
          <button
            onClick={startGeneration}
            disabled={isGenerating || !canGenerate}
            className="w-full px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-semibold shadow-lg shadow-amber-500/20"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {t("Generating...")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {selectedRecords.size > 0
                  ? t("Generate Ideas ({n} items)").replace("{n}", String(selectedRecords.size))
                  : t("Generate Ideas (Text Only)")}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Right Panel: Generated Ideas */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl shadow-lg shadow-amber-500/20">
              <Lightbulb className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg text-slate-900 dark:text-slate-100">
                {t("IdeaGen")}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("Discover research ideas from your notes")}
              </p>
            </div>
          </div>

          {generatedIdeas.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                onClick={selectAllIdeas}
                className="px-3 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30 rounded-lg transition-colors"
              >
                {t("Select All")}
              </button>
              <button
                onClick={saveSelectedIdeas}
                disabled={!generatedIdeas.some((i) => i.selected)}
                className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-1 font-medium"
              >
                <Save className="w-3 h-3" />
                {t("Save Selected")}
              </button>
            </div>
          )}
        </div>

        {/* Status Bar */}
        {(isGenerating || generationStatus) && (
          <div className="px-6 py-2.5 bg-amber-50 dark:bg-amber-500/[0.08] border-b border-amber-100 dark:border-amber-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isGenerating && (
                <Loader2 className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" />
              )}
              <span className="text-sm text-amber-700 dark:text-amber-300 truncate">
                {generationStatus}
              </span>
            </div>
            {progress && (
              <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                <div className="w-32 h-1.5 bg-amber-200 dark:bg-amber-900/50 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${(progress.current / progress.total) * 100}%` }}
                  />
                </div>
                <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                  {progress.current} / {progress.total}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 min-h-0 flex">
          {/* Ideas List */}
          <div className={`${expandedIdea ? "w-[380px] flex-shrink-0 border-r border-slate-100 dark:border-white/[0.06]" : "flex-1"} overflow-y-auto`}>
            {generatedIdeas.length === 0 && !isGenerating ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 p-8">
                <Brain className="w-16 h-16 text-slate-200 dark:text-slate-700 mb-4" />
                <p className="text-slate-500 dark:text-slate-400 text-center max-w-md">
                  {t("Select notebook records or describe your research topic")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
                  You can select notebooks for context, or simply describe your
                  research direction in the text field
                </p>
              </div>
            ) : (
              <div className="p-4 space-y-3">
                {generatedIdeas.map((idea, idx) => {
                  const isExpanded = expandedIdeaId === idea.id;

                  return (
                    <div
                      key={idea.id}
                      className={`rounded-xl border transition-all cursor-pointer group ${
                        isExpanded
                          ? "bg-amber-50 dark:bg-amber-500/[0.08] border-amber-300 dark:border-amber-500/30 shadow-md shadow-amber-100 dark:shadow-amber-900/20"
                          : idea.selected
                            ? "bg-amber-50/50 dark:bg-amber-500/[0.05] border-amber-200 dark:border-amber-500/20"
                            : "bg-white dark:bg-white/[0.03] border-slate-200 dark:border-white/[0.06] hover:border-amber-300 dark:hover:border-amber-500/30"
                      }`}
                    >
                      <div className="p-4" onClick={() => toggleIdeaExpanded(idea.id)}>
                        <div className="flex items-start gap-3">
                          {/* Selection Checkbox */}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleIdeaSelected(idea.id);
                            }}
                            className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                              idea.selected
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "border-slate-300 dark:border-slate-600 hover:border-amber-400"
                            }`}
                          >
                            {idea.selected && <Check className="w-3 h-3" />}
                          </button>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="font-semibold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                <Zap className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                                <span className="line-clamp-1">{idea.knowledge_point}</span>
                              </h3>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded-full">
                                  {idea.research_ideas.length} ideas
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    saveIdea(idea);
                                  }}
                                  className="p-1 text-slate-400 hover:text-amber-500 rounded transition-colors"
                                  title={t("Save to Notebook")}
                                >
                                  <Save className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                              {idea.description}
                            </p>

                            {/* Research Ideas Tags */}
                            <div className="flex flex-wrap gap-1.5 mt-2.5">
                              {idea.research_ideas.slice(0, expandedIdea ? 2 : 4).map((ri, idx) => (
                                <span
                                  key={idx}
                                  className="text-[11px] bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-md truncate max-w-[180px]"
                                >
                                  {idx + 1}. {ri.substring(0, 40)}...
                                </span>
                              ))}
                              {idea.research_ideas.length > (expandedIdea ? 2 : 4) && (
                                <span className="text-[11px] text-slate-400">
                                  +{idea.research_ideas.length - (expandedIdea ? 2 : 4)} more
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={ideasEndRef} />
              </div>
            )}
          </div>

          {/* Expanded Idea Detail Panel */}
          {expandedIdea && (
            <div className="flex-1 min-w-0 flex flex-col bg-white dark:bg-white/[0.02]">
              {/* Detail Header */}
              <div className="px-6 py-4 border-b border-slate-100 dark:border-white/[0.06] flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                  <Zap className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <h2 className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {expandedIdea.knowledge_point}
                  </h2>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => saveIdea(expandedIdea)}
                    className="px-3 py-1.5 text-xs bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-1 font-medium"
                  >
                    <Save className="w-3 h-3" />
                    Save
                  </button>
                  <button
                    onClick={() => setExpandedIdeaId(null)}
                    className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-white/[0.06] transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Research Ideas List (collapsible) */}
              <div className="border-b border-slate-100 dark:border-white/[0.06] bg-slate-50 dark:bg-white/[0.02]">
                <button
                  onClick={() => setDirectionsCollapsed(!directionsCollapsed)}
                  className="w-full px-6 py-2.5 flex items-center justify-between hover:bg-slate-100 dark:hover:bg-white/[0.04] transition-colors"
                >
                  <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    {directionsCollapsed ? (
                      <ChevronRight className="w-3 h-3" />
                    ) : (
                      <ChevronDown className="w-3 h-3" />
                    )}
                    Research Directions
                    <span className="text-[10px] font-normal text-slate-400">({expandedIdea.research_ideas.length})</span>
                  </span>
                </button>
                {!directionsCollapsed && (
                  <div className="px-6 pb-3 space-y-1.5">
                    {expandedIdea.research_ideas.map((ri, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300">
                        <span className="text-amber-500 font-bold text-xs mt-0.5 flex-shrink-0">{idx + 1}.</span>
                        <span className="leading-relaxed">{ri}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Full Statement (scrollable) */}
              <div className="flex-1 overflow-y-auto px-6 py-5">
                <div className="prose prose-sm prose-slate dark:prose-invert max-w-none [&>h1]:text-lg [&>h2]:text-base [&>h3]:text-sm [&>p]:text-sm [&>p]:leading-relaxed [&>ul]:text-sm [&>ol]:text-sm">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                  >
                    {processLatexContent(expandedIdea.statement)}
                  </ReactMarkdown>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Modal */}
      {ideaToSave && (
        <AddToNotebookModal
          isOpen={showSaveModal}
          onClose={() => {
            setShowSaveModal(false);
            setIdeaToSave(null);
          }}
          recordType="research"
          title={`Research Idea: ${ideaToSave.knowledge_point}`}
          userQuery={ideaToSave.description}
          output={ideaToSave.statement}
          metadata={{
            ideas_count: ideaToSave.research_ideas.length,
            source: "ideagen",
          }}
        />
      )}
    </div>
  );
}
