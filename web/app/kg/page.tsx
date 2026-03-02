"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Search,
  ZoomIn,
  ZoomOut,
  Maximize2,
  X,
  Loader2,
  Network,
  ChevronDown,
} from "lucide-react";
import { apiUrl } from "@/lib/api";

interface GraphNode {
  id: string;
  label: string;
  type: string;
  description: string;
}
interface GraphEdge {
  source: string;
  target: string;
  label: string;
  weight: number;
}
interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: { total_nodes: number; total_edges: number; entity_types: Record<string, number> };
}

const ENTITY_COLORS: Record<string, string> = {
  concept: "#8b5cf6",
  method: "#3b82f6",
  data: "#22d3ee",
  organization: "#f59e0b",
  technology: "#10b981",
  person: "#ec4899",
  event: "#f97316",
  location: "#6366f1",
  category: "#a855f7",
  geo: "#14b8a6",
};
const fallbackColor = "#6b7280";

export default function KnowledgeGraphPage() {
  const cyRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [kbs, setKbs] = useState<string[]>([]);
  const [selectedKb, setSelectedKb] = useState<string>("");
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [hiddenTypes, setHiddenTypes] = useState<Set<string>>(new Set());
  const [showKbDropdown, setShowKbDropdown] = useState(false);

  // Fetch KB list
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch(apiUrl("/api/v1/knowledge/list"), { signal: controller.signal }).then((r) => r.json()),
      fetch(apiUrl("/api/v1/knowledge/default"), { signal: controller.signal }).then((r) => r.json()),
    ])
      .then(([list, def]) => {
        const names = list.map((kb: any) => kb.name);
        setKbs(names);
        const defaultKb = def.default_kb || names[0] || "";
        if (defaultKb) setSelectedKb(defaultKb);
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  // Fetch graph data when KB changes
  useEffect(() => {
    if (!selectedKb) return;
    setLoading(true);
    setError(null);
    setGraphData(null);
    setSelectedNode(null);
    fetch(apiUrl(`/api/v1/knowledge/${selectedKb}/graph`))
      .then((r) => {
        if (!r.ok) throw new Error(`Graph not available (${r.status})`);
        return r.json();
      })
      .then((data: GraphData) => {
        setGraphData(data);
        setHiddenTypes(new Set());
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedKb]);

  // Initialize Cytoscape
  useEffect(() => {
    if (!graphData || !containerRef.current) return;

    let cy: any = null;

    import("cytoscape").then((cytoscapeModule) => {
      const cytoscape = cytoscapeModule.default;

      // Cap nodes for performance
      const maxNodes = 300;
      const nodes = graphData.nodes.slice(0, maxNodes);
      const nodeIds = new Set(nodes.map((n) => n.id));
      const edges = graphData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));

      cy = cytoscape({
        container: containerRef.current,
        elements: [
          ...nodes.map((n) => ({
            data: {
              id: n.id,
              label: n.label.length > 30 ? n.label.slice(0, 27) + "..." : n.label,
              fullLabel: n.label,
              type: n.type,
              description: n.description,
              color: ENTITY_COLORS[n.type] || fallbackColor,
            },
          })),
          ...edges.map((e, i) => ({
            data: { id: `e${i}`, source: e.source, target: e.target, label: e.label, weight: e.weight },
          })),
        ],
        style: [
          {
            selector: "node",
            style: {
              "label": "data(label)",
              "font-size": "11px",
              "color": "#e2e8f0",
              "text-valign": "bottom",
              "text-margin-y": 6,
              "background-color": "data(color)",
              "width": 28,
              "height": 28,
              "border-width": 2,
              "border-color": "rgba(255,255,255,0.15)",
              "text-outline-width": 2,
              "text-outline-color": "#0f0d1a",
              "text-max-width": "100px",
              "text-wrap": "ellipsis",
            } as any,
          },
          {
            selector: "edge",
            style: {
              "width": 1.5,
              "line-color": "rgba(139,92,246,0.2)",
              "curve-style": "bezier",
              "target-arrow-shape": "triangle",
              "target-arrow-color": "rgba(139,92,246,0.2)",
              "arrow-scale": 0.7,
            } as any,
          },
          {
            selector: "node.highlighted",
            style: {
              "border-width": 3,
              "border-color": "#8b5cf6",
              "width": 40,
              "height": 40,
              "font-size": "13px",
              "z-index": 10,
            } as any,
          },
          {
            selector: "node.dimmed",
            style: { "opacity": 0.15 } as any,
          },
          {
            selector: "edge.dimmed",
            style: { "opacity": 0.05 } as any,
          },
          {
            selector: "node.hidden",
            style: { "display": "none" } as any,
          },
        ],
        layout: {
          name: "cose",
          animate: false,
          nodeOverlap: 20,
          idealEdgeLength: 100,
          nodeRepulsion: () => 10000,
          gravity: 0.25,
        } as any,
      });

      cy.on("tap", "node", (evt: any) => {
        const data = evt.target.data();
        setSelectedNode({ id: data.id, label: data.fullLabel, type: data.type, description: data.description });
      });

      cy.on("tap", (evt: any) => {
        if (evt.target === cy) setSelectedNode(null);
      });

      cyRef.current = cy;
    });

    return () => {
      if (cy) cy.destroy();
      cyRef.current = null;
    };
  }, [graphData]);

  // Search highlighting
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("highlighted dimmed");
    if (!searchQuery.trim()) return;
    const q = searchQuery.toLowerCase();
    const matched = cy.nodes().filter((n: any) => {
      const label = (n.data("fullLabel") || "").toLowerCase();
      const type = (n.data("type") || "").toLowerCase();
      return label.includes(q) || type.includes(q);
    });
    if (matched.length > 0) {
      cy.elements().addClass("dimmed");
      matched.removeClass("dimmed").addClass("highlighted");
      matched.connectedEdges().removeClass("dimmed");
      matched.neighborhood().nodes().removeClass("dimmed");
    }
  }, [searchQuery]);

  // Toggle entity type visibility
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.nodes().forEach((n: any) => {
      if (hiddenTypes.has(n.data("type"))) {
        n.addClass("hidden");
      } else {
        n.removeClass("hidden");
      }
    });
  }, [hiddenTypes]);

  const toggleType = (type: string) => {
    setHiddenTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const handleZoomIn = useCallback(() => { cyRef.current?.zoom(cyRef.current.zoom() * 1.3); }, []);
  const handleZoomOut = useCallback(() => { cyRef.current?.zoom(cyRef.current.zoom() / 1.3); }, []);
  const handleFit = useCallback(() => { cyRef.current?.fit(undefined, 40); }, []);

  const entityTypes = graphData ? Object.entries(graphData.stats.entity_types) : [];

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#0f0d1a]">
      {/* Header */}
      <div className="shrink-0 px-6 py-3.5 flex items-center justify-between border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-violet-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Network className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Knowledge Graph</h1>
            <p className="text-xs text-slate-500 -mt-0.5">
              {graphData ? `${graphData.stats.total_nodes} entities, ${graphData.stats.total_edges} relations` : "Select a knowledge base"}
            </p>
          </div>
        </div>

        {/* KB Selector */}
        <div className="relative">
          <button
            onClick={() => setShowKbDropdown(!showKbDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.04] border border-white/[0.08] text-sm text-slate-300 hover:border-violet-500/30 transition"
          >
            {selectedKb || "Select KB"}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showKbDropdown ? "rotate-180" : ""}`} />
          </button>
          {showKbDropdown && (
            <div className="absolute right-0 mt-1 w-56 rounded-xl bg-[#1e1b2e] border border-white/[0.1] shadow-2xl z-50 py-1 max-h-60 overflow-y-auto">
              {kbs.map((kb) => (
                <button
                  key={kb}
                  onClick={() => { setSelectedKb(kb); setShowKbDropdown(false); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-white/[0.06] transition ${kb === selectedKb ? "text-violet-400 bg-violet-500/10" : "text-slate-300"}`}
                >
                  {kb}
                </button>
              ))}
              {kbs.length === 0 && (
                <p className="px-4 py-3 text-xs text-slate-500">No knowledge bases found</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 relative overflow-hidden">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#0f0d1a]/80 z-20">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-sm text-slate-400">Loading knowledge graph...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-20">
            <div className="text-center max-w-sm">
              <Network className="w-12 h-12 text-slate-700 mx-auto mb-3" />
              <p className="text-sm text-slate-400 mb-1">Graph not available</p>
              <p className="text-xs text-slate-600">{error}</p>
            </div>
          </div>
        )}

        {!loading && !error && !graphData && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Network className="w-16 h-16 text-slate-800 mx-auto mb-4" />
              <p className="text-sm text-slate-500">Select a knowledge base to visualize its graph</p>
            </div>
          </div>
        )}

        {/* Cytoscape container */}
        <div ref={containerRef} className="absolute inset-0" />

        {/* Search overlay */}
        {graphData && (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:w-72 z-10">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entities..."
                className="w-full pl-9 pr-8 py-2 rounded-xl bg-[#1e1b2e]/90 backdrop-blur-sm border border-white/[0.1] text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500/40"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Entity type filters */}
        {graphData && entityTypes.length > 0 && (
          <div className="absolute bottom-4 left-4 z-10 flex flex-wrap gap-1.5 max-w-sm">
            {entityTypes.map(([type, count]) => (
              <button
                key={type}
                onClick={() => toggleType(type)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  hiddenTypes.has(type)
                    ? "bg-white/[0.02] border-white/[0.06] text-slate-600 line-through"
                    : "bg-[#1e1b2e]/90 backdrop-blur-sm border-white/[0.1] text-slate-300"
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[type] || fallbackColor, opacity: hiddenTypes.has(type) ? 0.3 : 1 }} />
                {type} ({count})
              </button>
            ))}
          </div>
        )}

        {/* Zoom controls */}
        {graphData && (
          <div className="absolute bottom-4 right-4 z-10 flex flex-col gap-1">
            {[
              { icon: ZoomIn, action: handleZoomIn, title: "Zoom in" },
              { icon: ZoomOut, action: handleZoomOut, title: "Zoom out" },
              { icon: Maximize2, action: handleFit, title: "Fit to screen" },
            ].map(({ icon: Icon, action, title }) => (
              <button key={title} onClick={action} title={title} className="w-9 h-9 rounded-xl bg-[#1e1b2e]/90 backdrop-blur-sm border border-white/[0.1] flex items-center justify-center text-slate-400 hover:text-white hover:border-violet-500/30 transition">
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
        )}

        {/* Node detail sidebar */}
        {selectedNode && (
          <div className="absolute top-0 right-0 h-full w-96 bg-[#1e1b2e]/95 backdrop-blur-sm border-l border-white/[0.08] z-20 overflow-y-auto">
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-4 h-4 rounded-full flex-shrink-0" style={{ backgroundColor: ENTITY_COLORS[selectedNode.type] || fallbackColor }} />
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{selectedNode.type}</span>
                </div>
                <button onClick={() => setSelectedNode(null)} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-slate-500 hover:text-white transition">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <h3 className="text-lg font-bold text-white mb-3 leading-snug">{selectedNode.label}</h3>
              {selectedNode.description ? (
                <p className="text-base text-slate-400 leading-relaxed">{selectedNode.description}</p>
              ) : (
                <p className="text-base text-slate-600 italic">No description available</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
