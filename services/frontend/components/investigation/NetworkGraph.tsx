"use client";

import { useEffect, useRef } from "react";
import type { GraphOut } from "@/lib/types/investigation";

const NODE_COLORS: Record<string, string> = {
  person: "#4B7BEC",
  company: "#16A085",
  domain: "#7D3C98",
  ip: "#B7860D",
  email: "#C0392B",
  phone: "#1E8449",
  unknown: "#445068",
};

interface Props {
  graph: GraphOut;
}

export function NetworkGraph({ graph }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<unknown>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const { nodes, edges } = graph;

    if (nodes.length === 0) {
      return;
    }

    // Dynamic import of vis-network (avoid SSR issues)
    import("vis-network/standalone").then(({ Network, DataSet }) => {
      const visNodes = new DataSet(
        nodes.map((n) => ({
          id: n.id,
          label: n.label.length > 30 ? n.label.slice(0, 27) + "…" : n.label,
          title: `${n.type}: ${n.label}`,
          color: {
            background: NODE_COLORS[n.type] ?? NODE_COLORS.unknown,
            border: "#232838",
            highlight: { background: "#4B7BEC", border: "#fff" },
          },
          font: { color: "#C9D1E0", size: 12 },
          shape: n.type === "person" ? "ellipse" : "box",
        }))
      );

      const visEdges = new DataSet(
        edges.map((e) => ({
          id: e.id,
          from: e.from_,
          to: e.to,
          label: e.label,
          font: { color: "#7A869A", size: 10, align: "middle" },
          color: { color: "#2C3347", highlight: "#4B7BEC" },
          arrows: { to: { enabled: true, scaleFactor: 0.6 } },
        }))
      );

      const options = {
        nodes: { borderWidth: 1, shadow: false },
        edges: { smooth: { enabled: true, type: "continuous", roundness: 0.3 } },
        physics: {
          enabled: true,
          stabilization: { iterations: 150 },
          barnesHut: { gravitationalConstant: -4000, springLength: 120 },
        },
        interaction: { hover: true, tooltipDelay: 200 },
        layout: { improvedLayout: true },
      };

      if (networkRef.current) {
        (networkRef.current as { destroy: () => void }).destroy();
      }
      networkRef.current = new Network(containerRef.current!, { nodes: visNodes, edges: visEdges }, options);
    });

    return () => {
      if (networkRef.current) {
        (networkRef.current as { destroy: () => void }).destroy();
        networkRef.current = null;
      }
    };
  }, [graph]);

  if (graph.nodes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-3)]">
        <div className="text-4xl">🕸</div>
        <p className="text-sm">ยังไม่มีข้อมูล network graph</p>
        <p className="text-xs">รัน SpiderFoot scan เพื่อสร้าง graph</p>
      </div>
    );
  }

  return <div ref={containerRef} className="w-full h-full" />;
}
