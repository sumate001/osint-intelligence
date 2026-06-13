"use client";

import { useState } from "react";
import { Search, Brain, AlertTriangle } from "lucide-react";
import { useSearchEntities, usePatterns } from "@/lib/hooks/useIntelligence";
import type { EntityRecord } from "@/lib/types/intelligence";
import { cn } from "@/lib/utils/cn";

const TYPE_COLORS: Record<string, string> = {
  person: "var(--accent)",
  company: "var(--teal)",
  domain: "var(--purple)",
  ip: "var(--yellow)",
  phone: "var(--green)",
  location: "var(--yellow)",
  other: "var(--text-3)",
};

function EntityCard({ record }: { record: EntityRecord }) {
  const color = TYPE_COLORS[record.entity_type] ?? "var(--text-3)";
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 space-y-3">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm shrink-0"
          style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
          {record.entity_type === "person" ? "👤" : record.entity_type === "company" ? "🏢" : record.entity_type === "domain" ? "🌐" : "📌"}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--text)]">{record.entity_name}</p>
          <p className="text-[10px] text-[var(--text-3)]">{record.entity_type} · ปรากฏครั้งแรก {new Date(record.first_seen).toLocaleDateString("th-TH")}</p>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded shrink-0"
          style={{ color, background: `color-mix(in srgb, ${color} 15%, transparent)` }}>
          {record.cases_involved.length} เคส
        </span>
      </div>
      {record.cases_involved.length > 0 && (
        <div className="space-y-1">
          {record.cases_involved.map((c) => (
            <div key={c.case_id} className="flex items-center gap-2 text-[11px] text-[var(--text-2)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--border-2)] shrink-0" />
              <span className="flex-1 truncate">{c.case_title}</span>
              {c.first_seen && <span className="text-[var(--text-3)] shrink-0">{new Date(c.first_seen).toLocaleDateString("th-TH")}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function KnowledgeTab() {
  const [query, setQuery] = useState("");
  const [submitted, setSubmitted] = useState("");
  const { data: results = [], isFetching } = useSearchEntities(submitted);
  const { data: patterns = [] } = usePatterns();

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      {/* Search */}
      <div className="flex gap-2">
        <div className="flex-1 flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg px-3 py-2">
          <Search size={14} className="text-[var(--text-3)] shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && setSubmitted(query.trim())}
            placeholder='ค้นข้ามทุกเคส เช่น "นายสมชาย" หรือ "example.com"'
            className="flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--text-3)] outline-none"
          />
        </div>
        <button
          onClick={() => setSubmitted(query.trim())}
          className="bg-[var(--teal)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
        >
          ค้นหา
        </button>
      </div>

      {/* Cross-case patterns */}
      {patterns.length > 0 && !submitted && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">CROSS-CASE PATTERNS — เอนทิตีที่ปรากฏหลายเคส</p>
          {patterns.map((p) => (
            <button
              key={p.entity_name}
              onClick={() => { setQuery(p.entity_name); setSubmitted(p.entity_name); }}
              className="w-full flex items-start gap-3 bg-[var(--surface)] border border-[var(--purple)]/30 rounded-xl p-3 text-left hover:border-[var(--purple)]/60 transition-colors"
            >
              <AlertTriangle size={14} className="text-[var(--purple)] shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--text)]">{p.entity_name}</p>
                <p className="text-[10px] text-[var(--text-2)] mt-0.5">
                  ปรากฏใน {p.case_count} เคส: {p.cases.join(" · ")}
                </p>
              </div>
              <span className="text-[10px] text-[var(--purple)] bg-[var(--purple)]/10 px-2 py-0.5 rounded font-mono shrink-0">
                {p.case_count}×
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search results */}
      {submitted && (
        <div className="space-y-2">
          <p className="text-[9px] font-mono text-[var(--text-3)] tracking-widest">
            ENTITY HISTORY — "{submitted}" {isFetching ? "(กำลังค้นหา...)" : `(${results.length} รายการ)`}
          </p>
          {results.length === 0 && !isFetching && (
            <div className="flex flex-col items-center py-10 text-[var(--text-3)]">
              <Brain size={28} className="opacity-30 mb-2" />
              <p className="text-sm">ไม่พบเอนทิตีนี้ใน knowledge base</p>
            </div>
          )}
          {results.map((r) => <EntityCard key={r.id} record={r} />)}
        </div>
      )}

      {!submitted && patterns.length === 0 && (
        <div className="flex flex-col items-center py-16 text-[var(--text-3)]">
          <Brain size={32} className="opacity-30 mb-3" />
          <p className="text-sm">Knowledge base ว่างเปล่า — เอนทิตีจะถูกบันทึกเมื่อรัน SpiderFoot scan</p>
        </div>
      )}
    </div>
  );
}
