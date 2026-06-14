"use client";

import { useState, useCallback, useEffect } from "react";
import {
  Search, ExternalLink, Loader2, AlertCircle, Sparkles,
  BookOpen, ChevronDown, ChevronRight, Brain, X,
} from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { useTaskStore } from "@/lib/stores/tasks";
import { cn } from "@/lib/utils/cn";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SearchResult {
  title: string;
  url: string;
  content: string;
  source: string;
  score: number;
}

interface SearchResponse {
  query: string;
  results: SearchResult[];
  total: number;
}

interface AISearchResult {
  query: string;
  answer: string;
  reasoning: string | null;
  sources: SearchResult[];
}

interface Props {
  perplexicaUrl: string;
  caseTitle: string;
  caseId: string;           // used as task key — one active AI task per case
}

type Tab = "search" | "ai";

function getToken(): string | null {
  try {
    const raw = localStorage.getItem("osintdesk-auth");
    if (!raw) return null;
    return JSON.parse(raw)?.state?.token ?? null;
  } catch {
    return null;
  }
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ResearchPanel({ perplexicaUrl, caseTitle, caseId }: Props) {
  const taskId = `ai-search-${caseId}`;

  const { tasks, add, update, remove } = useTaskStore();
  const aiTask = tasks.find((t) => t.id === taskId);

  const [tab, setTab]             = useState<Tab>("search");
  const [query, setQuery]         = useState(caseTitle);
  const [results, setResults]     = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError]     = useState<string | null>(null);
  const [searched, setSearched]   = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);

  // Restore query from a completed/running task when mounting
  useEffect(() => {
    if (aiTask?.result) {
      const r = aiTask.result as AISearchResult;
      setQuery(r.query);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── SearXNG search (local state only — fast enough, no persistence needed) ──
  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setSearchLoading(true);
    setSearchError(null);
    setSearched(true);
    try {
      const data = await apiFetch<SearchResponse>("/api/v1/research/search", {
        params: { q: query.trim() },
      });
      setResults(data.results);
    } catch (err) {
      setSearchError((err as Error).message || "ค้นหาไม่สำเร็จ");
      setResults([]);
    } finally {
      setSearchLoading(false);
    }
  }, [query]);

  // ── AI search — runs in global task store so it survives navigation ──────────
  const handleAISearch = useCallback(async () => {
    if (!query.trim()) return;
    if (aiTask?.status === "running") return;   // already running

    const controller = new AbortController();
    const q = query.trim();

    add({
      id:     taskId,
      type:   "ai-search",
      label:  `AI: ${q.length > 30 ? q.slice(0, 28) + "…" : q}`,
      status: "running",
      abort:  () => controller.abort(),
    });

    try {
      const token = getToken();
      const res = await fetch(
        `/api/v1/research/ai-search?q=${encodeURIComponent(q)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: controller.signal,
        },
      );

      if (!res.ok) {
        const text = await res.text();
        let msg = `HTTP ${res.status}`;
        try { msg = JSON.parse(text)?.detail ?? msg; } catch { /* ignore */ }
        throw new Error(msg);
      }

      const data: AISearchResult = await res.json();
      update(taskId, { status: "done", result: data, finishedAt: Date.now() });
    } catch (err) {
      if ((err as Error).name === "AbortError") {
        // cancelled by user — store already updated by cancel handler
        return;
      }
      update(taskId, {
        status: "error",
        error: (err as Error).message || "AI ค้นหาไม่สำเร็จ",
        finishedAt: Date.now(),
      });
    }
  }, [query, taskId, aiTask, add, update]);

  const handleCancelAI = useCallback(() => {
    if (!aiTask) return;
    aiTask.abort?.();
    update(taskId, { status: "cancelled", finishedAt: Date.now() });
  }, [aiTask, taskId, update]);

  const handleClearAI = useCallback(() => {
    remove(taskId);
    setReasoningOpen(false);
  }, [taskId, remove]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    tab === "ai" ? handleAISearch() : handleSearch();
  };

  // Derived AI display state from task store
  const aiRunning  = aiTask?.status === "running";
  const aiResult   = aiTask?.status === "done"  ? (aiTask.result as AISearchResult) : null;
  const aiError    = aiTask?.status === "error" ? aiTask.error : null;
  const hasPrevious = !!aiResult || !!aiError;

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => { setTab("search"); setSearched(false); }}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
            tab === "search"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]",
          )}
        >
          <Search size={11} /> Search
        </button>
        <button
          onClick={() => setTab("ai")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
            tab === "ai"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]",
          )}
        >
          <Sparkles size={11} /> AI Research
          {aiRunning && (
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)] animate-pulse" />
          )}
        </button>
      </div>

      {/* ── Tab: SearXNG search ── */}
      {tab === "search" && (
        <div className="flex flex-col h-full">
          <div className="px-3 pt-3 pb-2 shrink-0">
            <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
              <Search size={12} className="text-[var(--text-3)] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="ค้นหา..."
                className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
              />
              {searchLoading && <Loader2 size={12} className="animate-spin text-[var(--text-3)] shrink-0" />}
            </div>
            <button
              onClick={handleSearch}
              disabled={searchLoading || !query.trim()}
              className="mt-1.5 w-full bg-[var(--accent)] text-white text-xs rounded py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {searchLoading ? "กำลังค้นหา..." : "ค้นหา (SearXNG)"}
            </button>
          </div>
          <ResultList
            results={results}
            loading={searchLoading}
            searched={searched}
            error={searchError}
          />
        </div>
      )}

      {/* ── Tab: AI Research ── */}
      {tab === "ai" && (
        <div className="flex flex-col h-full">
          <div className="px-3 pt-3 pb-2 shrink-0 space-y-1.5">
            <p className="text-[10px] text-[var(--text-3)] leading-relaxed">
              ค้นหาด้วย SearXNG แล้วให้ LLM{" "}
              <span className="text-[var(--accent)]">สรุปคำตอบ</span> พร้อม citation
            </p>
            <div className="flex items-center gap-1.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-2.5 py-1.5">
              <Sparkles size={12} className="text-[var(--accent)] shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="ถามคำถามการวิจัย..."
                className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
                disabled={aiRunning}
              />
              {aiRunning && <Loader2 size={12} className="animate-spin text-[var(--accent)] shrink-0" />}
            </div>

            <div className="flex gap-2">
              {aiRunning ? (
                /* Running: show cancel */
                <button
                  onClick={handleCancelAI}
                  className="flex-1 flex items-center justify-center gap-1.5 border border-[var(--red)]/50 text-[var(--red)] text-xs rounded py-1.5 hover:bg-[var(--red)]/10 transition-colors"
                >
                  <X size={11} /> ยกเลิก
                </button>
              ) : (
                /* Idle / done: show analyze button */
                <button
                  onClick={handleAISearch}
                  disabled={!query.trim()}
                  className="flex-1 bg-[var(--accent)] text-white text-xs rounded py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
                >
                  วิเคราะห์ด้วย AI
                </button>
              )}

              {perplexicaUrl && (
                <a
                  href={perplexicaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="เปิด Perplexica แบบเต็มหน้าจอ"
                  className="flex items-center gap-1 border border-[var(--border)] text-[var(--text-3)] hover:text-[var(--accent)] hover:border-[var(--accent)] text-xs rounded px-2.5 py-1.5 transition-colors"
                >
                  <ExternalLink size={11} />
                </a>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-3">

            {/* Running placeholder */}
            {aiRunning && (
              <div className="flex flex-col items-center justify-center h-28 gap-3 text-[var(--text-3)]">
                <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
                <p className="text-xs text-center leading-relaxed">
                  กำลังวิเคราะห์…<br />
                  <span className="text-[9px]">สามารถเปลี่ยนเมนูได้ ผลลัพธ์จะคงอยู่</span>
                </p>
              </div>
            )}

            {/* Error */}
            {aiError && (
              <div className="flex items-start gap-2 text-[var(--red)] bg-[var(--red)]/10 rounded-lg px-3 py-2 text-xs">
                <AlertCircle size={12} className="shrink-0 mt-0.5" />
                <span className="flex-1">{aiError}</span>
                <button onClick={handleClearAI} className="shrink-0 opacity-60 hover:opacity-100">
                  <X size={11} />
                </button>
              </div>
            )}

            {/* AI Answer */}
            {aiResult && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-mono text-[var(--accent)] tracking-widest flex items-center gap-1">
                    <Sparkles size={9} /> AI ANSWER
                  </p>
                  <button
                    onClick={handleClearAI}
                    title="ล้างผลลัพธ์"
                    className="text-[var(--text-3)] hover:text-[var(--text-2)] transition-colors"
                  >
                    <X size={11} />
                  </button>
                </div>

                <div className="bg-[var(--surface-2)] border border-[var(--accent)]/30 rounded-xl p-3">
                  <p className="text-xs text-[var(--text)] leading-relaxed whitespace-pre-wrap">
                    {aiResult.answer}
                  </p>
                </div>

                {/* Collapsible reasoning trace */}
                {aiResult.reasoning && (
                  <div className="border border-[var(--border)] rounded-xl overflow-hidden">
                    <button
                      onClick={() => setReasoningOpen((o) => !o)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-[10px] text-[var(--text-3)] hover:text-[var(--text-2)] hover:bg-[var(--surface-3)] transition-colors"
                    >
                      <Brain size={11} className="text-[var(--purple)]" />
                      <span className="font-mono tracking-widest flex-1 text-left">REASONING TRACE</span>
                      {reasoningOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                    {reasoningOpen && (
                      <div className="px-3 pb-3 border-t border-[var(--border)]">
                        <p className="text-[10px] text-[var(--text-3)] leading-relaxed whitespace-pre-wrap mt-2 font-mono">
                          {aiResult.reasoning}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Sources */}
                {aiResult.sources.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest flex items-center gap-1">
                      <BookOpen size={9} /> SOURCES ({aiResult.sources.length})
                    </p>
                    {aiResult.sources.map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 group"
                      >
                        <span className="shrink-0 font-mono text-[10px] text-[var(--accent)] mt-0.5">
                          [{i + 1}]
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs text-[var(--text-2)] group-hover:text-[var(--accent)] line-clamp-1 transition-colors">
                            {r.title}
                          </p>
                          <p className="text-[9px] text-[var(--text-3)] truncate">
                            {r.url.replace(/^https?:\/\//, "").split("/")[0]}
                          </p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* Empty state */}
            {!aiRunning && !hasPrevious && (
              <div className="flex flex-col items-center justify-center h-28 gap-2 text-[var(--text-3)]">
                <Sparkles size={24} className="opacity-20" />
                <p className="text-xs text-center leading-relaxed">
                  พิมพ์คำถาม แล้วกด<br />
                  <span className="text-[var(--accent)]">"วิเคราะห์ด้วย AI"</span>
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SearXNG result list ──────────────────────────────────────────────────────

function ResultList({
  results, loading, searched, error,
}: {
  results: SearchResult[];
  loading: boolean;
  searched: boolean;
  error: string | null;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
      {error && (
        <div className="flex items-center gap-2 text-[var(--red)] bg-[var(--red)]/10 rounded-lg px-3 py-2 text-xs">
          <AlertCircle size={12} /> {error}
        </div>
      )}
      {!loading && searched && results.length === 0 && !error && (
        <div className="text-center py-8 text-[var(--text-3)] text-xs">ไม่พบผลลัพธ์</div>
      )}
      {!searched && !loading && (
        <div className="flex flex-col items-center justify-center h-32 gap-2 text-[var(--text-3)]">
          <Search size={24} className="opacity-30" />
          <p className="text-xs">กด Enter หรือปุ่มค้นหา</p>
        </div>
      )}
      {results.map((r, i) => (
        <a
          key={i}
          href={r.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--border-2)] rounded-lg p-3 space-y-1 group transition-colors"
        >
          <div className="flex items-start justify-between gap-1">
            <p className="text-xs font-medium text-[var(--text)] leading-snug line-clamp-2 flex-1">
              {r.title}
            </p>
            <ExternalLink size={10} className="text-[var(--text-3)] group-hover:text-[var(--accent)] shrink-0 mt-0.5 transition-colors" />
          </div>
          {r.content && (
            <p className="text-[11px] text-[var(--text-2)] leading-relaxed line-clamp-2">{r.content}</p>
          )}
          <div className="flex items-center gap-2 pt-0.5">
            <span className="text-[9px] text-[var(--accent)] truncate max-w-[180px]">
              {r.url.replace(/^https?:\/\//, "").split("/")[0]}
            </span>
            {r.source && (
              <span className="text-[9px] text-[var(--text-3)] bg-[var(--surface-3)] px-1 rounded">
                {r.source}
              </span>
            )}
          </div>
        </a>
      ))}
    </div>
  );
}
