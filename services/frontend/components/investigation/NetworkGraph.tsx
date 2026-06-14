"use client";

import { useEffect, useRef } from "react";
import type { GraphOut } from "@/lib/types/investigation";

const NODE_COLORS: Record<string, string> = {
  person: "#4B7BEC",
  company: "#16A085",
  domain: "#7D3C98",
  scantarget: "#4B7BEC",   // root node — same blue as accent
  ip: "#B7860D",
  email: "#C0392B",
  phone: "#1E8449",
  affiliate_emailaddr: "#C0392B",
  similardomain_whois: "#7D3C98",
  account_external_owned: "#16A085",
  unknown: "#445068",
  entity: "#445068",
};

interface Props {
  graph: GraphOut;
}

export function NetworkGraph({ graph }: Props) {
  // containerRef is always mounted — React never conditionally swaps it
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (graph.nodes.length === 0) return;

    let cancelled = false;

    // vis-network owns this inner div entirely; React never touches its children
    const innerDiv = document.createElement("div");
    innerDiv.style.width = "100%";
    innerDiv.style.height = "100%";
    container.appendChild(innerDiv);

    import("vis-network/standalone").then(({ Network, DataSet }) => {
      if (cancelled || !innerDiv.isConnected) return;

      const visNodes = new DataSet(
        graph.nodes.map((n) => ({
          id: n.id,
          label: n.label.length > 30 ? n.label.slice(0, 27) + "…" : n.label,
          title: `${n.type}: ${n.label}`,
          color: {
            background: NODE_COLORS[n.type] ?? NODE_COLORS.unknown,
            border: "#232838",
            highlight: { background: "#4B7BEC", border: "#fff" },
          },
          font: { color: "#C9D1E0", size: 12 },
          shape: n.type === "person" || n.type === "scantarget" ? "ellipse" : "box",
          size: n.type === "scantarget" ? 20 : 14,
        }))
      );

      const visEdges = new DataSet(
        graph.edges.map((e) => ({
          id: e.id,
          from: e.from_,
          to: e.to,
          label: e.label === "DISCOVERED_FROM" ? "" : e.label,
          font: { color: "#7A869A", size: 9, align: "middle" },
          color: { color: "#2C3347", highlight: "#4B7BEC" },
          arrows: { to: { enabled: true, scaleFactor: 0.5 } },
        }))
      );

      const options = {
        nodes: { borderWidth: 1, shadow: false },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.3 },
          width: 1,
        },
        physics: {
          enabled: true,
          stabilization: { iterations: 150, fit: true },
          barnesHut: { gravitationalConstant: -4000, springLength: 120 },
        },
        interaction: { hover: true, tooltipDelay: 200, navigationButtons: false },
        layout: { improvedLayout: true },
      };

      new Network(innerDiv, { nodes: visNodes, edges: visEdges }, options);
    });

    return () => {
      cancelled = true;
      // Remove the inner div we created — vis-network's destroy is implicit
      // when the container element is removed from DOM
      if (innerDiv.parentNode === container) {
        container.removeChild(innerDiv);
      }
    };
  }, [graph]);

  return (
    <div className="relative w-full h-full">
      {/* Always-mounted container — vis-network writes into this via innerDiv */}
      <div ref={containerRef} className="w-full h-full" />

      {/* Empty state overlay — sits above the container without affecting its DOM */}
      {graph.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-[var(--text-3)] pointer-events-none">
          <div className="text-4xl">🕸</div>
          <p className="text-sm">ยังไม่มีข้อมูล network graph</p>
          <p className="text-xs">รัน SpiderFoot scan เพื่อสร้าง graph</p>
        </div>
      )}
    </div>
  );
}
