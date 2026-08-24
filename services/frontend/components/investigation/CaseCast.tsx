"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, History } from "lucide-react";

import { apiFetch } from "@/lib/api/client";

/**
 * Who this case is about, and which of them turned up in earlier cases.
 *
 * The prior-case count is the only number here that changes what an analyst
 * does. It is trustworthy because Horizon matched on identity rather than
 * spelling: the same person written "อนุทิน ชาญวีรกูล" in one case and
 * "Anutin Charnvirakul" in another is one record, so "no prior cases" now means
 * what it says instead of meaning "spelled differently last time".
 */

interface CaseRef {
  case_id: string;
  case_title: string;
  role: string;
  first_seen: string;
  last_seen: string;
}

interface CastMember {
  entity_name: string;
  entity_type: string;
  qid: string | null;
  role: string;
  prior_cases: CaseRef[];
}

const TYPE_LABEL: Record<string, string> = {
  person: "บุคคล",
  company: "องค์กร",
  location: "สถานที่",
  other: "อื่น ๆ",
};

export function CaseCast({ caseId }: { caseId: string }) {
  const { data: cast = [], isLoading } = useQuery<CastMember[]>({
    queryKey: ["case-cast", caseId],
    queryFn: () => apiFetch<CastMember[]>(`/api/v1/knowledge/case/${caseId}/cast`),
  });

  // A case opened by hand has no cast, and an empty panel says nothing useful.
  if (isLoading || cast.length === 0) return null;

  const withHistory = cast.filter((member) => member.prior_cases.length > 0);

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-sm font-medium text-[var(--text)]">ตัวละครในคดีนี้</h3>
        <span className="text-[11px] text-[var(--text-3)]">{cast.length} รายชื่อ</span>
        {withHistory.length > 0 && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-[var(--yellow)]">
            <History size={12} />
            {withHistory.length} รายเคยอยู่ในคดีก่อนหน้า
          </span>
        )}
      </div>

      <div className="space-y-2">
        {cast.map((member) => (
          <div
            key={`${member.entity_name}-${member.qid ?? ""}`}
            className="rounded-lg bg-[var(--surface-2)] px-3 py-2"
          >
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="text-sm text-[var(--text)]">{member.entity_name}</span>
              <span className="text-[10px] text-[var(--text-3)]">
                {TYPE_LABEL[member.entity_type] ?? member.entity_type}
              </span>
              {member.qid && (
                <a
                  href={`https://www.wikidata.org/wiki/${member.qid}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-[10px] text-[var(--accent)] hover:underline"
                >
                  {member.qid}
                  <ExternalLink size={9} className="inline ml-0.5 -mt-0.5" />
                </a>
              )}
              {member.role && (
                <span className="ml-auto text-[10px] text-[var(--text-3)]">{member.role}</span>
              )}
            </div>

            {member.prior_cases.length > 0 && (
              <div className="mt-1.5 border-l-2 border-[var(--yellow)] pl-2">
                <p className="text-[10px] text-[var(--text-2)]">
                  เคยปรากฏใน {member.prior_cases.length} คดีก่อนหน้า:
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {member.prior_cases.slice(0, 4).map((prior) => (
                    <li key={prior.case_id}>
                      <a
                        href={`/investigation/${prior.case_id}`}
                        className="text-[11px] text-[var(--accent)] hover:underline"
                      >
                        {prior.case_title}
                      </a>
                    </li>
                  ))}
                  {member.prior_cases.length > 4 && (
                    <li className="text-[10px] text-[var(--text-3)]">
                      และอีก {member.prior_cases.length - 4} คดี
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
