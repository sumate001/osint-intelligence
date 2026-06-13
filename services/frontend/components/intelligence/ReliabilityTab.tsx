"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

interface Source { id: string; name: string; source_type: string; reliability_score: number; is_active: boolean; }

const SOURCE_GRADE = (score: number) => {
  if (score >= 0.9) return { grade: "A", label: "เชื่อถือได้สมบูรณ์", color: "var(--green)" };
  if (score >= 0.75) return { grade: "B", label: "เชื่อถือได้ปกติ", color: "var(--green)" };
  if (score >= 0.6) return { grade: "C", label: "ค่อนข้างเชื่อถือได้", color: "var(--yellow)" };
  if (score >= 0.4) return { grade: "D", label: "ไม่ค่อยเชื่อถือ", color: "var(--yellow)" };
  if (score >= 0.2) return { grade: "E", label: "ไม่น่าเชื่อถือ", color: "var(--red)" };
  return { grade: "F", label: "ประเมินไม่ได้", color: "var(--text-3)" };
};

export function ReliabilityTab() {
  const { data: sources = [] } = useQuery<Source[]>({
    queryKey: ["sources-reliability"],
    queryFn: () => apiFetch<Source[]>("/api/v1/sources"),
  });

  return (
    <div className="h-full overflow-y-auto p-5 space-y-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--border)]">
          <p className="text-[10px] font-mono text-[var(--text-3)] tracking-widest">NATO ADMIRALTY CODE — SOURCE RELIABILITY</p>
        </div>

        {/* Legend */}
        <div className="px-4 py-3 grid grid-cols-3 gap-2 border-b border-[var(--border)] bg-[var(--surface-2)]">
          {[
            { code: "A·1", desc: "เชื่อถือได้สมบูรณ์ + ยืนยันจากแหล่งอื่น" },
            { code: "B·2", desc: "เชื่อถือได้ + น่าจะจริง" },
            { code: "C·3", desc: "ค่อนข้างเชื่อถือ + อาจจะจริง" },
            { code: "D·4", desc: "ไม่ค่อยเชื่อถือ + น่าสงสัย" },
            { code: "E·5", desc: "ไม่น่าเชื่อถือ + ไม่น่าเป็นไปได้" },
            { code: "F·6", desc: "ประเมินไม่ได้ + ประเมินไม่ได้" },
          ].map((l) => (
            <div key={l.code} className="text-[10px] text-[var(--text-3)]">
              <span className="font-mono text-[var(--text-2)]">{l.code}</span> — {l.desc}
            </div>
          ))}
        </div>

        {/* Source list */}
        <div className="divide-y divide-[var(--border)]">
          {sources.length === 0 && (
            <p className="text-sm text-[var(--text-3)] text-center py-8">ยังไม่มี source — เพิ่มใน Admin → Adapters</p>
          )}
          {sources.map((src) => {
            const { grade, label, color } = SOURCE_GRADE(src.reliability_score);
            const infoScore = Math.round(src.reliability_score * 5) + 1;
            return (
              <div key={src.id} className="flex items-center gap-4 px-4 py-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-mono font-bold shrink-0"
                  style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}>
                  {grade}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text)] truncate">{src.name}</p>
                  <p className="text-[10px] text-[var(--text-3)]">{src.source_type} · {label}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-xs font-mono text-[var(--text)]" style={{ color }}>
                      {grade}·{Math.min(infoScore, 6)}
                    </p>
                    <p className="text-[10px] text-[var(--text-3)]">{Math.round(src.reliability_score * 100)}%</p>
                  </div>
                  <div className="w-16 h-1.5 bg-[var(--surface-3)] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${src.reliability_score * 100}%`, background: color }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
