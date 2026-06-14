"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { Share2, Brain } from "lucide-react";
import type { GraphOut, GraphNode as ApiGraphNode } from "@/lib/types/investigation";
import { cn } from "@/lib/utils/cn";

const NODE_COLORS: Record<string, string> = {
  person:                   "#4B7BEC",
  company:                  "#16A085",
  domain:                   "#7D3C98",
  scantarget:               "#4B7BEC",
  ip:                       "#B7860D",
  email:                    "#C0392B",
  phone:                    "#1E8449",
  affiliate_emailaddr:      "#C0392B",
  similardomain_whois:      "#7D3C98",
  account_external_owned:   "#16A085",
  unknown:                  "#445068",
  entity:                   "#445068",
};

// Sort order so same-type nodes are adjacent in the radial layout
const TYPE_ORDER = [
  "ip","domain","similardomain_whois","email","affiliate_emailaddr",
  "person","company","phone","account_external_owned","entity","unknown",
];

// ═══════════════════════════════════════════════════════════════════════════
// Radial (hub-and-spoke) SVG diagram
// ═══════════════════════════════════════════════════════════════════════════

const ENW = 164;   // entity node width
const ENH = 42;    // entity node height
const CR  = 46;    // center circle radius

interface RadialEntity {
  id: string;
  label: string;
  type: string;
  x: number;   // center of entity rect in content coords
  y: number;
  angle: number;
}

function buildRadial(graph: GraphOut): { root: ApiGraphNode | null; entities: RadialEntity[]; radius: number } {
  const root = graph.nodes.find((n) => n.type === "scantarget") ?? null;

  const entities = graph.nodes
    .filter((n) => n.type !== "scantarget")
    .sort((a, b) => {
      const ai = TYPE_ORDER.indexOf(a.type) === -1 ? 99 : TYPE_ORDER.indexOf(a.type);
      const bi = TYPE_ORDER.indexOf(b.type) === -1 ? 99 : TYPE_ORDER.indexOf(b.type);
      return ai - bi;
    });

  const N = entities.length;
  if (N === 0) return { root, entities: [], radius: 200 };

  // Gap (in radians) between type groups so they're visually separated
  const types = [...new Set(entities.map((e) => e.type))];
  const GAP   = types.length > 1 ? 0.18 : 0;  // gap between type groups
  const totalGap = GAP * (types.length - 1);

  // Radius: nodes must not overlap horizontally
  const minR = Math.max(220, (N * (ENW + 28) + totalGap * 200) / (2 * Math.PI));

  const arcPerNode = (2 * Math.PI - totalGap) / N;

  let angle    = -Math.PI / 2;   // start at top
  let lastType = entities[0]?.type;
  const placed: RadialEntity[] = [];

  entities.forEach((e) => {
    if (e.type !== lastType) { angle += GAP; lastType = e.type; }
    placed.push({
      id:    e.id,
      label: e.label,
      type:  e.type,
      x:     Math.cos(angle) * minR,
      y:     Math.sin(angle) * minR,
      angle,
    });
    angle += arcPerNode;
  });

  return { root, entities: placed, radius: minR };
}

// Connector: cubic bezier from circle edge → entity rect center
// Control points "flow outward" from center and "arrive" from outside
function connectorPath(e: RadialEntity): string {
  const startX = Math.cos(e.angle) * (CR + 4);
  const startY = Math.sin(e.angle) * (CR + 4);
  const dist   = Math.sqrt(e.x ** 2 + e.y ** 2);
  const pull   = dist * 0.28;
  const dx     = e.x / dist;
  const dy     = e.y / dist;
  const cp1x   = startX + dx * pull;
  const cp1y   = startY + dy * pull;
  const cp2x   = e.x   - dx * pull;
  const cp2y   = e.y   - dy * pull;
  return `M ${startX} ${startY} C ${cp1x} ${cp1y} ${cp2x} ${cp2y} ${e.x} ${e.y}`;
}

interface RadialChartProps {
  graph: GraphOut;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

function RadialChart({ graph, selectedId, onSelect }: RadialChartProps) {
  const svgRef   = useRef<SVGSVGElement>(null);
  const [vp, setVp] = useState({ x: 0, y: 0, scale: 1 });
  const drag     = useRef<{ ox: number; oy: number; vx: number; vy: number } | null>(null);

  const { root, entities, radius } = useMemo(() => buildRadial(graph), [graph]);

  // Fit content into viewport on first render
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || entities.length === 0) return;
    const W = svg.clientWidth  || 800;
    const H = svg.clientHeight || 500;
    const contentSpan = (radius + ENW / 2 + 20) * 2;
    const scale = Math.min(W, H) / contentSpan * 0.88;
    setVp({ x: W / 2, y: H / 2, scale });
  }, [entities, radius]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const svg = svgRef.current;
    if (!svg) return;
    const rect   = svg.getBoundingClientRect();
    const mx     = e.clientX - rect.left;
    const my     = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 0.89;
    setVp((v) => {
      const s   = Math.max(0.12, Math.min(4, v.scale * factor));
      const rat = s / v.scale;
      return { scale: s, x: mx - (mx - v.x) * rat, y: my - (my - v.y) * rat };
    });
  }, []);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    drag.current = { ox: e.clientX, oy: e.clientY, vx: vp.x, vy: vp.y };
  }, [vp]);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!drag.current) return;
    setVp((v) => ({
      ...v,
      x: drag.current!.vx + (e.clientX - drag.current!.ox),
      y: drag.current!.vy + (e.clientY - drag.current!.oy),
    }));
  }, []);

  const stopDrag = useCallback(() => { drag.current = null; }, []);

  const rootLabel = root
    ? (root.label.length > 22 ? root.label.slice(0, 20) + "…" : root.label)
    : "Scan Target";

  return (
    <svg
      ref={svgRef}
      width="100%" height="100%"
      style={{ cursor: drag.current ? "grabbing" : "grab" }}
      onWheel={onWheel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
    >
      <defs>
        {/* Glow filter for center circle */}
        <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <g transform={`translate(${vp.x},${vp.y}) scale(${vp.scale})`}>

        {/* ── Connector lines (draw below nodes) ── */}
        {entities.map((e) => (
          <path
            key={`line-${e.id}`}
            d={connectorPath(e)}
            fill="none"
            stroke={NODE_COLORS[e.type] ?? "#445068"}
            strokeWidth={1.4}
            opacity={0.45}
          />
        ))}

        {/* ── Entity rectangles ── */}
        {entities.map((e) => {
          const color    = NODE_COLORS[e.type] ?? NODE_COLORS.entity;
          const isSel    = selectedId === e.id;
          const lbl      = e.label.length > 20 ? e.label.slice(0, 18) + "…" : e.label;
          const typeDisp = e.type.replace(/_/g, " ");
          const rx0      = e.x - ENW / 2;
          const ry0      = e.y - ENH / 2;
          return (
            <g
              key={e.id}
              transform={`translate(${rx0},${ry0})`}
              onClick={() => onSelect(isSel ? null : e.id)}
              style={{ cursor: "pointer" }}
            >
              {/* Selection ring */}
              {isSel && (
                <rect x={-3} y={-3} width={ENW + 6} height={ENH + 6} rx={9}
                  fill="none" stroke={color} strokeWidth={2} opacity={0.6} />
              )}
              {/* Box */}
              <rect width={ENW} height={ENH} rx={7}
                fill={color + "18"} stroke={color} strokeWidth={isSel ? 1.8 : 1.2} />
              {/* Type badge */}
              <text x={ENW / 2} y={14} fontSize={8} fontFamily="monospace"
                textAnchor="middle" fill={color} opacity={0.8} letterSpacing={0.8}>
                {typeDisp.toUpperCase()}
              </text>
              {/* Label */}
              <text x={ENW / 2} y={30} fontSize={11} fontFamily="monospace"
                textAnchor="middle" fill="#C9D1E0" fontWeight={isSel ? "600" : "400"}>
                {lbl}
              </text>
            </g>
          );
        })}

        {/* ── Center circle (ScanTarget) — drawn on top ── */}
        {root && (
          <g onClick={() => onSelect(selectedId === root.id ? null : root.id)}
            style={{ cursor: "pointer" }}>
            {/* Outer glow ring */}
            <circle cx={0} cy={0} r={CR + 8} fill="#4B7BEC" opacity={0.12} />
            <circle cx={0} cy={0} r={CR + 4} fill="#4B7BEC" opacity={0.18} />
            {/* Main circle */}
            <circle cx={0} cy={0} r={CR} fill="#4B7BEC"
              stroke={selectedId === root.id ? "#fff" : "#4B7BEC"}
              strokeWidth={selectedId === root.id ? 2 : 0}
              filter="url(#glow)" />
            <text x={0} y={-8} fontSize={8} fontFamily="monospace"
              textAnchor="middle" fill="rgba(255,255,255,0.65)" letterSpacing={1}>
              SCAN TARGET
            </text>
            <text x={0} y={10} fontSize={12} fontFamily="monospace"
              textAnchor="middle" fill="#ffffff" fontWeight="600">
              {rootLabel}
            </text>
          </g>
        )}
      </g>
    </svg>
  );
}


// ═══════════════════════════════════════════════════════════════════════════
// 3-D Neural (3d-force-graph)
// ═══════════════════════════════════════════════════════════════════════════

interface G3Node { id: string; label: string; type: string }
interface G3Link { source: string; target: string; label: string }

function makeLabelSprite(
  THREE: typeof import("three"),
  text: string, color: string, isRoot: boolean,
) {
  const W = 256, H = 40;
  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "rgba(13,15,20,0.82)";
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(2, 2, W - 4, H - 4, 6); else ctx.rect(2, 2, W - 4, H - 4);
  ctx.fill();
  ctx.fillStyle = color; ctx.fillRect(2, 2, 4, H - 4);
  ctx.font = `${isRoot ? "bold " : ""}${isRoot ? 14 : 12}px monospace`;
  ctx.fillStyle = isRoot ? "#fff" : "#C9D1E0";
  ctx.textAlign = "left"; ctx.textBaseline = "middle";
  const max = isRoot ? 26 : 28;
  ctx.fillText(text.length > max ? text.slice(0, max - 1) + "…" : text, 14, H / 2);
  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, opacity: 0.95 });
  const sprite = new THREE.Sprite(mat);
  const s = isRoot ? 28 : 22;
  sprite.scale.set(s, s * (H / W), 1);
  sprite.position.set(0, -(isRoot ? 10 : 7), 0);
  return sprite;
}


// ═══════════════════════════════════════════════════════════════════════════
// Main component
// ═══════════════════════════════════════════════════════════════════════════

interface Props { graph: GraphOut }

export function NetworkGraph({ graph }: Props) {
  const [mode, setMode]           = useState<"diagram" | "neural">("diagram");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const neuralRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId],
  );

  // Neural mode
  useEffect(() => {
    if (mode !== "neural") return;
    const container = neuralRef.current;
    if (!container || graph.nodes.length === 0) return;
    let cancelled = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let fg: any = null;
    const nodes: G3Node[] = graph.nodes.map((n) => ({ id: n.id, label: n.label, type: n.type }));
    const links: G3Link[] = graph.edges.map((e) => ({ source: e.from_, target: e.to, label: e.label }));
    Promise.all([import("3d-force-graph"), import("three")])
      .then(([{ default: ForceGraph3D }, THREE]) => {
        if (cancelled || !container) return;
        fg = ForceGraph3D({ antialias: true, alpha: true })(container)
          .graphData({ nodes, links }).backgroundColor("#0D0F14").showNavInfo(false)
          .nodeThreeObject((n: G3Node) => {
            const color = NODE_COLORS[n.type] ?? NODE_COLORS.entity;
            const isRoot = n.type === "scantarget";
            const g = new THREE.Group();
            g.add(new THREE.Mesh(
              new THREE.SphereGeometry(isRoot ? 7 : 4, 20, 20),
              new THREE.MeshPhongMaterial({ color: new THREE.Color(color), emissive: new THREE.Color(color),
                emissiveIntensity: isRoot ? 0.5 : 0.25, shininess: 60, transparent: true, opacity: 0.92 }),
            ));
            g.add(makeLabelSprite(THREE, n.label, color, isRoot));
            return g;
          })
          .nodeThreeObjectExtend(false).nodeLabel(() => "")
          .onNodeHover((n: G3Node | null) => { container.style.cursor = n ? "pointer" : "default"; })
          .onNodeClick((n: G3Node) => setSelectedId((p) => (p === n.id ? null : n.id)))
          .linkColor(() => "#2C3347").linkWidth(0.5).linkOpacity(0.5)
          .linkDirectionalParticles(4).linkDirectionalParticleWidth(1.5).linkDirectionalParticleSpeed(0.004)
          .linkDirectionalParticleColor((l: G3Link) => l.label === "DISCOVERED_FROM" ? "#4B7BEC" : "#7A869A")
          .width(container.clientWidth).height(container.clientHeight);
        fg.d3Force("charge")?.strength(-220);
        fg.d3Force("link")?.distance(90).strength(0.4);
        const ctrl = fg.controls();
        ctrl.autoRotate = true; ctrl.autoRotateSpeed = 0.4;
        ctrl.enableZoom = true; ctrl.enablePan = false;
        const sc = fg.scene();
        sc.add(new THREE.AmbientLight(0xffffff, 0.5));
        const sun = new THREE.DirectionalLight(0xffffff, 0.8);
        sun.position.set(200, 300, 200); sc.add(sun);
      });
    const ro = new ResizeObserver(() => {
      if (fg && container) fg.width(container.clientWidth).height(container.clientHeight);
    });
    ro.observe(container);
    return () => {
      cancelled = true; ro.disconnect();
      if (fg) { fg.pauseAnimation(); while (container.firstChild) container.removeChild(container.firstChild); }
    };
  }, [graph, mode]);

  const activeTypes = [...new Set(graph.nodes.map((n) => n.type))].filter((t) => t !== "scantarget");

  return (
    <div className="relative flex flex-col w-full h-full">

      {/* Mode toggle */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 bg-[var(--surface)]/80 backdrop-blur border border-[var(--border)] rounded-lg p-0.5">
        <button
          onClick={() => { setSelectedId(null); setMode("diagram"); }}
          className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
            mode === "diagram" ? "bg-[var(--accent)] text-white" : "text-[var(--text-3)] hover:text-[var(--text-2)]")}
        >
          <Share2 size={11} /> Diagram
        </button>
        <button
          onClick={() => { setSelectedId(null); setMode("neural"); }}
          className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-mono transition-colors",
            mode === "neural" ? "bg-[var(--purple)] text-white" : "text-[var(--text-3)] hover:text-[var(--text-2)]")}
        >
          <Brain size={11} /> Neural 3D
        </button>
      </div>

      {/* ── Diagram: radial SVG ── */}
      {mode === "diagram" && (
        <div className="flex-1 w-full overflow-hidden">
          {graph.nodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-3)]">
              <div className="text-4xl">🕸</div>
              <p className="text-sm">ยังไม่มีข้อมูล network graph</p>
              <p className="text-xs">รัน SpiderFoot scan เพื่อสร้าง graph</p>
            </div>
          ) : (
            <RadialChart graph={graph} selectedId={selectedId} onSelect={setSelectedId} />
          )}
        </div>
      )}

      {/* ── Neural: 3d-force-graph ── */}
      {mode === "neural" && (
        <div ref={neuralRef} className="flex-1 w-full">
          {graph.nodes.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-[var(--text-3)]">
              <div className="text-4xl">🕸</div>
              <p className="text-sm">ยังไม่มีข้อมูล network graph</p>
              <p className="text-xs">รัน SpiderFoot scan เพื่อสร้าง graph</p>
            </div>
          )}
        </div>
      )}

      {/* Selected detail panel */}
      {selected && (
        <div className="absolute top-10 left-2 z-10 bg-[var(--surface)]/90 backdrop-blur border border-[var(--border)] rounded-xl p-3 max-w-[220px] space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[9px] font-mono tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: `${NODE_COLORS[selected.type] ?? "#445068"}22`, color: NODE_COLORS[selected.type] ?? "#445068" }}>
              {selected.type.toUpperCase()}
            </span>
            <button onClick={() => setSelectedId(null)} className="text-[var(--text-3)] hover:text-[var(--text)] text-xs">✕</button>
          </div>
          <p className="text-xs text-[var(--text)] break-all leading-relaxed font-mono">{selected.label}</p>
        </div>
      )}

      {/* Legend */}
      {graph.nodes.length > 0 && (
        <div className="absolute bottom-3 left-3 flex flex-col gap-1 pointer-events-none z-10">
          {activeTypes.slice(0, 8).map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: NODE_COLORS[type] ?? "#445068" }} />
              <span className="text-[9px] font-mono text-[var(--text-3)] uppercase tracking-wider">
                {type.replace(/_/g, " ")}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Controls hint */}
      {graph.nodes.length > 0 && (
        <div className="absolute bottom-3 right-3 text-[9px] font-mono text-[var(--text-3)] text-right pointer-events-none z-10 leading-relaxed">
          {mode === "neural" ? <>คลิก · เลือก<br />ลาก · หมุน<br />scroll · zoom</> : <>ลาก · เลื่อน<br />scroll · zoom</>}
        </div>
      )}
    </div>
  );
}
