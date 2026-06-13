"use client";

import { useState, useCallback } from "react";
import { Search, ExternalLink, Loader2, AlertCircle, Sparkles } from "lucide-react";
import { apiFetch } from "@/lib/api/client";
import { cn } from "@/lib/utils/cn";

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

interface Props {
  perplexicaUrl: string;
  caseTitle: string;
}

type Tab = "search" | "ai";

export function ResearchPanel({ perplexicaUrl, caseTitle }: Props) {
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState(caseTitle);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    try {
      const data = await apiFetch<SearchResponse>("/api/v1/research/search", {
        params: { q: query.trim() },
      });
      setResults(data.results);
    } catch (err) {
      setError((err as Error).message || "ค้นหาไม่สำเร็จ");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex border-b border-[var(--border)] shrink-0">
        <button
          onClick={() => setTab("search")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors border-b-2 -mb-px",
            tab === "search"
              ? "border-[var(--accent)] text-[var(--accent)]"
              : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]"
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
              : "border-transparent text-[var(--text-3)] hover:text-[var(--text-2)]"
          )}
        >
          <Sparkles size={11} /> AI Research
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
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                placeholder="ค้นหา..."
                className="flex-1 bg-transparent text-xs text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
              />
              {loading && <Loader2 size={12} className="animate-spin text-[var(--text-3)] shrink-0" />}
            </div>
            <button
              onClick={handleSearch}
              disabled={loading || !query.trim()}
              className="mt-1.5 w-full bg-[var(--accent)] text-white text-xs rounded py-1.5 hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {loading ? "กำลังค้นหา..." : "ค้นหา (SearXNG)"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-3 space-y-2">
            {error && (
              <div className="flex items-center gap-2 text-[var(--red)] bg-[var(--red)]/10 rounded-lg px-3 py-2 text-xs">
                <AlertCircle size={12} />
                {error}
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
        </div>
      )}

      {/* ── Tab: Perplexica iframe ── */}
      {tab === "ai" && (
        <div className="flex-1 relative">
          {perplexicaUrl ? (
            <iframe
              src={perplexicaUrl}
              className="absolute inset-0 w-full h-full border-0"
              title="Perplexica AI Research"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-3)] px-6 text-center">
              <Sparkles size={28} className="opacity-30" />
              <p className="text-xs font-medium text-[var(--text-2)]">Perplexica ยังไม่ได้ตั้งค่า</p>
              <p className="text-[11px] leading-relaxed">
                รัน{" "}
                <code className="bg-[var(--surface-3)] px-1 rounded font-mono">
                  docker compose -f docker-compose.dev.yml up -d perplexica-backend perplexica-frontend
                </code>{" "}
                แล้วตั้งค่า <code className="bg-[var(--surface-3)] px-1 rounded font-mono">NEXT_PUBLIC_PERPLEXICA_URL</code>
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
