"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw, X, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { useAuthStore } from "@/lib/stores/auth";
import { cn } from "@/lib/utils/cn";
import { useT } from "@/lib/hooks/useT";

type Phase = "idle" | "running" | "restarting" | "polling" | "done" | "error";

interface UpdateModalProps {
  onClose: () => void;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const POLL_INTERVAL = 3000;
const POLL_TIMEOUT = 120_000;

export function UpdateModal({ onClose }: UpdateModalProps) {
  const { token } = useAuthStore();
  const t = useT();
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<{ text: string; error?: boolean }[]>([]);
  const logRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addLine = (text: string, error = false) =>
    setLines((prev) => [...prev, { text, error }]);

  // Auto-scroll log
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  async function pollUntilBack() {
    setPhase("polling");
    addLine("⏳ Waiting for API to come back online...");
    const start = Date.now();
    while (Date.now() - start < POLL_TIMEOUT) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      try {
        const res = await fetch(`${API_BASE}/api/v1/health`);
        if (res.ok) {
          addLine("✅ API is back online!");
          setPhase("done");
          return;
        }
      } catch {
        // still restarting — keep polling
      }
    }
    addLine("❌ Timed out waiting for API to restart.", true);
    setPhase("error");
  }

  async function startUpdate() {
    if (!token) return;
    setPhase("running");
    setLines([]);
    abortRef.current = new AbortController();

    try {
      const res = await fetch(`${API_BASE}/api/v1/admin/system/update/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        addLine(`❌ Server error: ${res.status}`, true);
        setPhase("error");
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        // consume complete SSE events
        const events = buf.split("\n\n");
        buf = events.pop() ?? "";
        for (const event of events) {
          const dataLine = event.split("\n").find((l) => l.startsWith("data: "));
          if (!dataLine) continue;
          try {
            const data = JSON.parse(dataLine.slice(6));
            if (data.line === "__RESTARTING__") {
              setPhase("restarting");
              pollUntilBack();
              return;
            }
            if (data.line) addLine(data.line, !!data.error);
            if (data.error) { setPhase("error"); return; }
          } catch { /* ignore malformed */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name === "AbortError") return;
      // connection dropped = API restarted
      if (phase === "running") {
        addLine("🔄 Connection dropped — API is restarting...");
        setPhase("restarting");
        pollUntilBack();
      }
    }
  }

  function handleClose() {
    abortRef.current?.abort();
    onClose();
  }

  const phaseLabel: Record<Phase, string> = {
    idle:       "Update System",
    running:    "Updating...",
    restarting: "Restarting...",
    polling:    "Waiting for API...",
    done:       "Update Complete",
    error:      "Update Failed",
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div className="flex items-center gap-2">
            {phase === "running" || phase === "restarting" || phase === "polling" ? (
              <RefreshCw size={16} className="text-[var(--accent)] animate-spin" />
            ) : phase === "done" ? (
              <CheckCircle2 size={16} className="text-[var(--green)]" />
            ) : phase === "error" ? (
              <AlertCircle size={16} className="text-[var(--red)]" />
            ) : (
              <Download size={16} className="text-[var(--text-2)]" />
            )}
            <h2 className="text-sm font-semibold text-[var(--text)]">{phaseLabel[phase]}</h2>
          </div>
          <button
            onClick={handleClose}
            className="text-[var(--text-3)] hover:text-[var(--text)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Log */}
        <div
          ref={logRef}
          className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed bg-[var(--bg)] min-h-[300px] max-h-[500px]"
        >
          {lines.length === 0 && phase === "idle" && (
            <p className="text-[var(--text-3)] text-sm">
              This will: <span className="text-[var(--accent)]">git pull</span> → rebuild images → restart services.
              <br />
              The API will go offline briefly while restarting (~30s).
            </p>
          )}
          {lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "whitespace-pre-wrap break-all",
                l.error ? "text-[var(--red)]" : l.text.startsWith("✅") ? "text-[var(--green)]" : "text-[var(--text-2)]"
              )}
            >
              {l.text}
            </div>
          ))}
          {(phase === "restarting" || phase === "polling") && (
            <div className="flex items-center gap-2 mt-2 text-[var(--yellow)]">
              <RefreshCw size={11} className="animate-spin shrink-0" />
              <span>Waiting for API to come back...</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center gap-3">
          {phase === "idle" && (
            <button
              onClick={startUpdate}
              className="flex items-center gap-2 bg-[var(--accent)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
            >
              <Download size={14} />
              Pull &amp; Update
            </button>
          )}
          {phase === "done" && (
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 bg-[var(--green)] text-white text-sm px-4 py-2 rounded-lg hover:opacity-90"
            >
              <RefreshCw size={14} />
              Reload Page
            </button>
          )}
          {phase === "error" && (
            <button
              onClick={() => { setPhase("idle"); setLines([]); }}
              className="flex items-center gap-2 bg-[var(--surface-2)] text-[var(--text-2)] text-sm px-4 py-2 rounded-lg hover:bg-[var(--surface-3)]"
            >
              Try Again
            </button>
          )}
          <button onClick={handleClose} className="ml-auto text-sm text-[var(--text-3)] hover:text-[var(--text-2)]">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}
