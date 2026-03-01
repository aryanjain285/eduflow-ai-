"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Bot,
  User,
  Database,
  Globe,
  Calculator,
  FileText,
  Microscope,
  Lightbulb,
  Trash2,
  ExternalLink,
  BookOpen,
  Sparkles,
  Edit3,
  GraduationCap,
  PenTool,
  Save,
  X,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { useGlobal } from "@/context/GlobalContext";
import { apiUrl } from "@/lib/api";
import { processLatexContent } from "@/lib/latex";
import AddToNotebookModal from "@/components/AddToNotebookModal";
import { useTranslation } from "react-i18next";

interface KnowledgeBase {
  name: string;
  is_default?: boolean;
}

export default function HomePage() {
  const {
    chatState,
    setChatState,
    sendChatMessage,
    clearChatHistory,
    newChatSession,
  } = useGlobal();
  const { t } = useTranslation();

  const [inputMessage, setInputMessage] = useState("");
  const [kbs, setKbs] = useState<KnowledgeBase[]>([]);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [showNotebookModal, setShowNotebookModal] = useState(false);

  // @-mention state
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);
  const [mentionSelectedIndex, setMentionSelectedIndex] = useState(0);
  const [mentionedKb, setMentionedKb] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Filtered KBs based on @-mention query
  const filteredKbs = kbs.filter((kb) =>
    kb.name.toLowerCase().includes(mentionQuery.toLowerCase()),
  );

  // Handle selecting a KB from the @-mention dropdown
  const selectMentionKb = useCallback(
    (kbName: string) => {
      // Remove the @query from the input text
      const before = inputMessage.slice(0, mentionStartIndex);
      const after = inputMessage.slice(
        mentionStartIndex + mentionQuery.length + 1, // +1 for the @ character
      );
      setInputMessage(before + after);

      // Set the mentioned KB and auto-enable RAG
      setMentionedKb(kbName);
      setChatState((prev) => ({
        ...prev,
        enableRag: true,
        selectedKb: kbName,
      }));

      // Close dropdown and refocus input
      setShowMentionDropdown(false);
      setMentionQuery("");
      setMentionStartIndex(-1);
      setMentionSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [inputMessage, mentionStartIndex, mentionQuery, setChatState],
  );

  // Remove the mentioned KB chip
  const removeMentionedKb = () => {
    setMentionedKb(null);
  };

  // Format chat history for notebook
  const formatChatForNotebook = () => {
    if (chatState.messages.length === 0)
      return { title: "", userQuery: "", output: "" };

    // Use the first user message as title
    const firstUserMsg = chatState.messages.find((m) => m.role === "user");
    const title =
      firstUserMsg?.content.slice(0, 50) +
        (firstUserMsg && firstUserMsg.content.length > 50 ? "..." : "") ||
      t("Chat Session");

    // Format all messages as markdown
    const formattedMessages = chatState.messages
      .map((msg, idx) => {
        const roleLabel =
          msg.role === "user"
            ? `👤 **${t("User")}**`
            : `🤖 **${t("Assistant")}**`;
        return `### ${roleLabel}\n\n${msg.content}`;
      })
      .join("\n\n---\n\n");

    // User query is the concatenation of all user messages
    const userQueries = chatState.messages
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n\n");

    return {
      title: `Chat: ${title}`,
      userQuery: userQueries,
      output: formattedMessages,
    };
  };

  // Fetch knowledge bases
  useEffect(() => {
    fetch(apiUrl("/api/v1/knowledge/list"))
      .then((res) => res.json())
      .then((data) => {
        // Ensure data is an array before processing
        const kbList = Array.isArray(data) ? data : [];
        setKbs(kbList);
        if (!chatState.selectedKb && kbList.length > 0) {
          const defaultKb = kbList.find((kb: KnowledgeBase) => kb.is_default);
          if (defaultKb) {
            setChatState((prev) => ({ ...prev, selectedKb: defaultKb.name }));
          } else {
            setChatState((prev) => ({ ...prev, selectedKb: kbList[0].name }));
          }
        }
      })
      .catch((err) => console.error("Failed to fetch KBs:", err));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Use scrollTop instead of scrollIntoView to prevent page-level scrolling
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [chatState.messages]);

  const handleSend = () => {
    if (!inputMessage.trim() || chatState.isLoading) return;
    sendChatMessage(inputMessage);
    setInputMessage("");
    setMentionedKb(null);
    setShowMentionDropdown(false);
  };

  // Handle input changes - detect @-mention trigger
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const cursorPos = e.target.selectionStart ?? value.length;
    setInputMessage(value);

    // Find if we're in an @-mention context
    const textBeforeCursor = value.slice(0, cursorPos);
    const lastAtIndex = textBeforeCursor.lastIndexOf("@");

    if (lastAtIndex !== -1) {
      const textAfterAt = textBeforeCursor.slice(lastAtIndex + 1);
      // Only show dropdown if there's no space after @ (still typing the mention)
      if (!textAfterAt.includes(" ") && kbs.length > 0) {
        setShowMentionDropdown(true);
        setMentionQuery(textAfterAt);
        setMentionStartIndex(lastAtIndex);
        setMentionSelectedIndex(0);
        return;
      }
    }

    setShowMentionDropdown(false);
    setMentionQuery("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle @-mention dropdown navigation
    if (showMentionDropdown && filteredKbs.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setMentionSelectedIndex((prev) =>
          prev < filteredKbs.length - 1 ? prev + 1 : 0,
        );
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setMentionSelectedIndex((prev) =>
          prev > 0 ? prev - 1 : filteredKbs.length - 1,
        );
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectMentionKb(filteredKbs[mentionSelectedIndex].name);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setShowMentionDropdown(false);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Static color map to avoid dynamic Tailwind class issues
  const colorMap: Record<string, { iconBg: string; iconText: string; hoverBorder: string }> = {
    violet: { iconBg: "bg-violet-100 dark:bg-violet-900/30", iconText: "text-violet-600 dark:text-violet-400", hoverBorder: "hover:border-violet-300 dark:hover:border-violet-500/30" },
    purple: { iconBg: "bg-purple-100 dark:bg-purple-900/30", iconText: "text-purple-600 dark:text-purple-400", hoverBorder: "hover:border-purple-300 dark:hover:border-purple-500/30" },
    emerald: { iconBg: "bg-emerald-100 dark:bg-emerald-900/30", iconText: "text-emerald-600 dark:text-emerald-400", hoverBorder: "hover:border-emerald-300 dark:hover:border-emerald-500/30" },
    amber: { iconBg: "bg-amber-100 dark:bg-amber-900/30", iconText: "text-amber-600 dark:text-amber-400", hoverBorder: "hover:border-amber-300 dark:hover:border-amber-500/30" },
    blue: { iconBg: "bg-blue-100 dark:bg-blue-900/30", iconText: "text-blue-600 dark:text-blue-400", hoverBorder: "hover:border-blue-300 dark:hover:border-blue-500/30" },
    pink: { iconBg: "bg-pink-100 dark:bg-pink-900/30", iconText: "text-pink-600 dark:text-pink-400", hoverBorder: "hover:border-pink-300 dark:hover:border-pink-500/30" },
  };

  const quickActions = [
    {
      icon: Calculator,
      label: t("Smart Problem Solving"),
      href: "/solver",
      color: "violet",
      description: t("Multi-agent reasoning"),
    },
    {
      icon: PenTool,
      label: t("Generate Practice Questions"),
      href: "/question",
      color: "purple",
      description: t("Auto-validated quizzes"),
    },
    {
      icon: Microscope,
      label: t("Deep Research Reports"),
      href: "/research",
      color: "emerald",
      description: t("Comprehensive analysis"),
    },
    {
      icon: Lightbulb,
      label: t("Generate Novel Ideas"),
      href: "/ideagen",
      color: "amber",
      description: t("Brainstorm & synthesize"),
    },
    {
      icon: GraduationCap,
      label: t("Guided Learning"),
      href: "/guide",
      color: "blue",
      description: t("Step-by-step tutoring"),
    },
    {
      icon: Edit3,
      label: t("Co-Writer"),
      href: "/co_writer",
      color: "pink",
      description: t("Collaborative writing"),
    },
  ];

  const hasMessages = chatState.messages.length > 0;

  return (
    <div className="h-screen flex flex-col animate-fade-in">
      {/* Empty State / Welcome Screen */}
      {!hasMessages && (
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative overflow-hidden">
          {/* Floating decorative orbs (dark mode only) */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none dark:block hidden">
            <div className="absolute -top-20 -left-20 w-[500px] h-[500px] bg-violet-500/20 rounded-full blur-[100px] animate-float" />
            <div className="absolute -bottom-20 -right-20 w-[450px] h-[450px] bg-blue-500/15 rounded-full blur-[100px] animate-float-delayed" />
            <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-cyan-500/10 rounded-full blur-[80px] animate-float-slow" />
            <div className="absolute top-2/3 left-1/4 w-[200px] h-[200px] bg-pink-500/8 rounded-full blur-[60px] animate-float-delayed" />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-2xl mx-auto mb-8 relative z-10"
          >
            {/* Gradient logo icon */}
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg shadow-violet-500/25">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-4xl font-bold mb-3 tracking-tight">
              <span className="text-slate-900 dark:text-slate-100">{t("Welcome to ")}</span>
              <span className="text-gradient">EduFlow</span>
            </h1>
            <p className="text-lg text-slate-500 dark:text-slate-400">
              {t("How can I help you today?")}
            </p>
          </motion.div>

          {/* Input Box - Centered */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="w-full max-w-2xl mx-auto mb-12 relative z-10"
          >
            {/* Mode Toggles */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    setChatState((prev) => ({
                      ...prev,
                      enableRag: !prev.enableRag,
                    }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    chatState.enableRag
                      ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-500/30"
                      : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Database className="w-3.5 h-3.5" />
                  {t("RAG")}
                </button>

                <button
                  onClick={() =>
                    setChatState((prev) => ({
                      ...prev,
                      enableWebSearch: !prev.enableWebSearch,
                    }))
                  }
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    chatState.enableWebSearch
                      ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-500/30"
                      : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-white/[0.08] hover:bg-slate-200 dark:hover:bg-white/[0.06]"
                  }`}
                >
                  <Globe className="w-3.5 h-3.5" />
                  {t("Web Search")}
                </button>
              </div>

              {chatState.enableRag && (
                <select
                  value={chatState.selectedKb}
                  onChange={(e) =>
                    setChatState((prev) => ({
                      ...prev,
                      selectedKb: e.target.value,
                    }))
                  }
                  className="text-sm bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-lg px-3 py-1.5 outline-none focus:border-violet-400 dark:text-slate-200"
                >
                  {kbs.map((kb) => (
                    <option key={kb.name} value={kb.name}>
                      {kb.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* Mentioned KB Chip */}
            {mentionedKb && (
              <div className="flex items-center gap-2 mb-2 px-1">
                <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-full text-sm font-medium border border-violet-200 dark:border-violet-500/30">
                  <Database className="w-3.5 h-3.5" />
                  <span>{mentionedKb}</span>
                  <button
                    onClick={removeMentionedKb}
                    className="ml-0.5 w-4 h-4 rounded-full hover:bg-violet-200 dark:hover:bg-violet-500/30 flex items-center justify-center transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {t("RAG enabled")}
                </span>
              </div>
            )}

            {/* Glass Input Field */}
            <div className="relative">
              {/* @-mention Dropdown */}
              <AnimatePresence>
                {showMentionDropdown && filteredKbs.length > 0 && (
                  <motion.div
                    ref={dropdownRef}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/[0.12] rounded-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                  >
                    <div className="px-3 py-2 border-b border-slate-100 dark:border-white/[0.08]">
                      <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                        {t("Knowledge Bases")}
                      </span>
                    </div>
                    <div className="max-h-48 overflow-y-auto py-1">
                      {filteredKbs.map((kb, i) => (
                        <button
                          key={kb.name}
                          onClick={() => selectMentionKb(kb.name)}
                          onMouseEnter={() => setMentionSelectedIndex(i)}
                          className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                            i === mentionSelectedIndex
                              ? "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                              : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                          }`}
                        >
                          <div
                            className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                              i === mentionSelectedIndex
                                ? "bg-violet-100 dark:bg-violet-500/25"
                                : "bg-slate-100 dark:bg-white/[0.06]"
                            }`}
                          >
                            <Database className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">
                              {kb.name}
                            </div>
                          </div>
                          {i === mentionSelectedIndex && (
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
                              Enter
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                    {filteredKbs.length === 0 && (
                      <div className="px-3 py-4 text-sm text-slate-400 dark:text-slate-500 text-center">
                        {t("No matching knowledge bases")}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              <input
                ref={inputRef}
                type="text"
                className="w-full px-5 py-4 pr-14 bg-white dark:bg-white/[0.07] dark:backdrop-blur-xl border border-slate-200 dark:border-white/[0.10] rounded-2xl focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50 dark:focus:shadow-[0_0_30px_rgba(139,92,246,0.2)] transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200 shadow-lg shadow-slate-200/50 dark:shadow-[0_8px_32px_rgba(0,0,0,0.3)]"
                placeholder={mentionedKb ? t("Ask about your document...") : t("Ask anything... (type @ to mention a knowledge base)")}
                value={inputMessage}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                disabled={chatState.isLoading}
              />
              <button
                onClick={handleSend}
                disabled={chatState.isLoading || !inputMessage.trim()}
                className="absolute right-2 top-2 bottom-2 aspect-square bg-gradient-to-br from-violet-500 to-blue-600 text-white rounded-xl flex items-center justify-center hover:from-violet-600 hover:to-blue-700 disabled:opacity-50 transition-all shadow-md shadow-violet-500/25"
              >
                {chatState.isLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Send className="w-5 h-5" />
                )}
              </button>
            </div>
          </motion.div>

          {/* Quick Actions Grid */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="w-full max-w-3xl mx-auto relative z-10"
          >
            <h3 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4 text-center">
              {t("Explore Modules")}
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {quickActions.map((action, i) => {
                const colors = colorMap[action.color];
                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.35 + i * 0.06 }}
                  >
                    <Link
                      href={action.href}
                      className={`group p-4 rounded-2xl border border-slate-200 dark:border-white/[0.10] bg-white dark:bg-white/[0.06] dark:backdrop-blur-xl dark:shadow-[0_4px_24px_rgba(0,0,0,0.2)] hover:shadow-lg dark:hover:shadow-[0_0_30px_rgba(139,92,246,0.12),0_8px_32px_rgba(0,0,0,0.3)] dark:hover:border-violet-500/25 dark:hover:bg-white/[0.08] ${colors.hoverBorder} transition-all duration-300 block`}
                    >
                      <div
                        className={`w-10 h-10 rounded-xl ${colors.iconBg} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform`}
                      >
                        <action.icon className={`w-5 h-5 ${colors.iconText}`} />
                      </div>
                      <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm mb-1">
                        {action.label}
                      </h4>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {action.description}
                      </p>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}

      {/* Chat Interface - When there are messages */}
      {hasMessages && (
        <>
          {/* Header Bar */}
          <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-white/[0.08] bg-white/80 dark:bg-white/[0.06] backdrop-blur-xl">
            <div className="flex items-center gap-3">
              {/* Mode Toggles */}
              <button
                onClick={() =>
                  setChatState((prev) => ({
                    ...prev,
                    enableRag: !prev.enableRag,
                  }))
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  chatState.enableRag
                    ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300"
                    : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400"
                }`}
              >
                <Database className="w-3 h-3" />
                {t("RAG")}
              </button>

              <button
                onClick={() =>
                  setChatState((prev) => ({
                    ...prev,
                    enableWebSearch: !prev.enableWebSearch,
                  }))
                }
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  chatState.enableWebSearch
                    ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                    : "bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400"
                }`}
              >
                <Globe className="w-3 h-3" />
                {t("Web Search")}
              </button>

              {chatState.enableRag && (
                <select
                  value={chatState.selectedKb}
                  onChange={(e) =>
                    setChatState((prev) => ({
                      ...prev,
                      selectedKb: e.target.value,
                    }))
                  }
                  className="text-xs bg-slate-100 dark:bg-white/[0.06] border-0 rounded-lg px-2 py-1 outline-none dark:text-slate-200"
                >
                  {kbs.map((kb) => (
                    <option key={kb.name} value={kb.name}>
                      {kb.name}
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNotebookModal(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors"
                title={t("Save to Notebook")}
              >
                <Save className="w-3.5 h-3.5" />
                {t("Save to Notebook")}
              </button>
              <button
                onClick={newChatSession}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {t("New Chat")}
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div
            ref={messagesContainerRef}
            className="flex-1 overflow-y-auto px-6 py-6 space-y-6"
          >
            {chatState.messages.map((msg, idx) => (
              <div
                key={idx}
                className="flex gap-4 w-full max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-2"
              >
                {msg.role === "user" ? (
                  <>
                    <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-white/[0.06] flex items-center justify-center shrink-0">
                      <User className="w-4 h-4 text-slate-500 dark:text-slate-400" />
                    </div>
                    <div className="flex-1 bg-slate-100 dark:bg-white/[0.06] px-4 py-3 rounded-2xl rounded-tl-none text-slate-800 dark:text-slate-200">
                      {msg.content}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0 shadow-lg shadow-violet-500/30">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="flex-1 space-y-3">
                      <div className="bg-white dark:bg-white/[0.05] dark:backdrop-blur-sm px-5 py-4 rounded-2xl rounded-tl-none border border-slate-200 dark:border-white/[0.08] shadow-sm">
                        <div className="prose prose-slate dark:prose-invert prose-sm max-w-none">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeKatex]}
                          >
                            {processLatexContent(msg.content)}
                          </ReactMarkdown>
                        </div>

                        {/* Loading indicator */}
                        {msg.isStreaming && (
                          <div className="flex items-center gap-2 mt-3 text-violet-600 dark:text-violet-400 text-sm">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{t("Generating response...")}</span>
                          </div>
                        )}
                      </div>

                      {/* Sources */}
                      {msg.sources &&
                        (msg.sources.rag?.length ?? 0) +
                          (msg.sources.web?.length ?? 0) >
                          0 && (
                          <div className="flex flex-wrap gap-2">
                            {msg.sources.rag?.map((source, i) => (
                              <div
                                key={`rag-${i}`}
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-lg text-xs"
                              >
                                <BookOpen className="w-3 h-3" />
                                <span>{source.kb_name}</span>
                              </div>
                            ))}
                            {msg.sources.web?.slice(0, 3).map((source, i) => (
                              <a
                                key={`web-${i}`}
                                href={source.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded-lg text-xs hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
                              >
                                <Globe className="w-3 h-3" />
                                <span className="max-w-[150px] truncate">
                                  {source.title || source.url}
                                </span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ))}
                          </div>
                        )}
                    </div>
                  </>
                )}
              </div>
            ))}

            {/* Status indicator */}
            {chatState.isLoading && chatState.currentStage && (
              <div className="flex gap-4 w-full max-w-4xl mx-auto">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
                <div className="flex-1 bg-slate-100 dark:bg-white/[0.05] px-4 py-3 rounded-2xl rounded-tl-none">
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-500"></span>
                    </span>
                    {chatState.currentStage === "rag" &&
                      t("Searching knowledge base...")}
                    {chatState.currentStage === "web" &&
                      t("Searching the web...")}
                    {chatState.currentStage === "generating" &&
                      t("Generating response...")}
                    {!["rag", "web", "generating"].includes(
                      chatState.currentStage,
                    ) && chatState.currentStage}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area - Fixed at bottom */}
          <div className="border-t border-slate-200 dark:border-white/[0.08] bg-white dark:bg-white/[0.04] dark:backdrop-blur-xl px-6 py-4">
            <div className="max-w-4xl mx-auto">
              {/* Mentioned KB Chip */}
              {mentionedKb && (
                <div className="flex items-center gap-2 mb-2">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 rounded-full text-xs font-medium border border-violet-200 dark:border-violet-500/30">
                    <Database className="w-3 h-3" />
                    <span>{mentionedKb}</span>
                    <button
                      onClick={removeMentionedKb}
                      className="ml-0.5 w-3.5 h-3.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-500/30 flex items-center justify-center transition-colors"
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    {t("RAG enabled")}
                  </span>
                </div>
              )}

              <div className="relative">
                {/* @-mention Dropdown */}
                <AnimatePresence>
                  {showMentionDropdown && filteredKbs.length > 0 && (
                    <motion.div
                      ref={dropdownRef}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.15 }}
                      className="absolute bottom-full left-0 right-0 mb-2 bg-white dark:bg-[#1a1a2e] border border-slate-200 dark:border-white/[0.12] rounded-xl shadow-xl dark:shadow-[0_8px_32px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                    >
                      <div className="px-3 py-2 border-b border-slate-100 dark:border-white/[0.08]">
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                          {t("Knowledge Bases")}
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto py-1">
                        {filteredKbs.map((kb, i) => (
                          <button
                            key={kb.name}
                            onClick={() => selectMentionKb(kb.name)}
                            onMouseEnter={() => setMentionSelectedIndex(i)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors ${
                              i === mentionSelectedIndex
                                ? "bg-violet-50 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300"
                                : "text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                            }`}
                          >
                            <div
                              className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                i === mentionSelectedIndex
                                  ? "bg-violet-100 dark:bg-violet-500/25"
                                  : "bg-slate-100 dark:bg-white/[0.06]"
                              }`}
                            >
                              <Database className="w-3.5 h-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">
                                {kb.name}
                              </div>
                            </div>
                            {i === mentionSelectedIndex && (
                              <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.06] px-1.5 py-0.5 rounded">
                                Enter
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <input
                  ref={inputRef}
                  type="text"
                  className="w-full px-5 py-3.5 pr-14 bg-slate-50 dark:bg-white/[0.06] border border-slate-200 dark:border-white/[0.08] rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500/20 focus:border-violet-500/50 transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 text-slate-700 dark:text-slate-200"
                  placeholder={mentionedKb ? t("Ask about your document...") : t("Type your message... (@ to mention KB)")}
                  value={inputMessage}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={chatState.isLoading}
                />
                <button
                  onClick={handleSend}
                  disabled={chatState.isLoading || !inputMessage.trim()}
                  className="absolute right-2 top-2 bottom-2 aspect-square bg-gradient-to-br from-violet-500 to-blue-600 text-white rounded-lg flex items-center justify-center hover:from-violet-600 hover:to-blue-700 disabled:opacity-50 transition-all"
                >
                  {chatState.isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Send className="w-5 h-5" />
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Add to Notebook Modal */}
      <AddToNotebookModal
        isOpen={showNotebookModal}
        onClose={() => setShowNotebookModal(false)}
        recordType="chat"
        title={formatChatForNotebook().title}
        userQuery={formatChatForNotebook().userQuery}
        output={formatChatForNotebook().output}
        metadata={{
          session_id: chatState.sessionId,
          message_count: chatState.messages.length,
          enable_rag: chatState.enableRag,
          enable_web_search: chatState.enableWebSearch,
        }}
        kbName={chatState.enableRag ? chatState.selectedKb : undefined}
      />
    </div>
  );
}
