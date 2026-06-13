"use client";

import { useState } from "react";
import { Target, Star, Users, ShieldCheck, Drama, Brain } from "lucide-react";
import { Topbar } from "@/components/layout/Topbar";
import { cn } from "@/lib/utils/cn";
import { PIRTab } from "@/components/intelligence/PIRTab";
import { ReliabilityTab } from "@/components/intelligence/ReliabilityTab";
import { CollaborationTab } from "@/components/intelligence/CollaborationTab";
import { ConfidenceTab } from "@/components/intelligence/ConfidenceTab";
import { DeceptionTab } from "@/components/intelligence/DeceptionTab";
import { KnowledgeTab } from "@/components/intelligence/KnowledgeTab";
import { useT } from "@/lib/hooks/useT";

type TabId = "pir" | "reliability" | "collab" | "confidence" | "deception" | "knowledge";

export default function IntelligencePage() {
  const [activeTab, setActiveTab] = useState<TabId>("pir");
  const t = useT();

  const TABS: { id: TabId; labelKey: string; icon: React.ReactNode; color: string }[] = [
    { id: "pir",        labelKey: "intelligence.tabs.pir",           icon: <Target size={14} />,     color: "var(--purple)" },
    { id: "reliability",labelKey: "intelligence.tabs.reliability",   icon: <Star size={14} />,       color: "var(--yellow)" },
    { id: "collab",     labelKey: "intelligence.tabs.collaboration", icon: <Users size={14} />,      color: "var(--accent)" },
    { id: "confidence", labelKey: "intelligence.tabs.confidence",    icon: <ShieldCheck size={14} />,color: "var(--green)" },
    { id: "deception",  labelKey: "intelligence.tabs.deception",     icon: <Drama size={14} />,      color: "var(--red)" },
    { id: "knowledge",  labelKey: "intelligence.tabs.knowledge",     icon: <Brain size={14} />,      color: "var(--teal)" },
  ];

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <Topbar title={t("intelligence.title")} />

      {/* Tab bar */}
      <div className="flex items-center gap-0.5 px-4 py-2 border-b border-[var(--border)] bg-[var(--surface)] shrink-0 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded text-xs whitespace-nowrap transition-colors",
              activeTab === tab.id
                ? "bg-[var(--surface-2)] text-[var(--text)]"
                : "text-[var(--text-3)] hover:text-[var(--text-2)]"
            )}
            style={activeTab === tab.id ? { color: tab.color } : {}}
          >
            {tab.icon}
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "pir"        && <PIRTab />}
        {activeTab === "reliability"&& <ReliabilityTab />}
        {activeTab === "collab"     && <CollaborationTab />}
        {activeTab === "confidence" && <ConfidenceTab />}
        {activeTab === "deception"  && <DeceptionTab />}
        {activeTab === "knowledge"  && <KnowledgeTab />}
      </div>
    </div>
  );
}
