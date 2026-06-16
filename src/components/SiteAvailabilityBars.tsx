import { useState } from "react";
import type { SearchNodeItem, Site } from "../api/types";
import { isCoreSite } from "../lib/sites";

interface NodeTypeCount {
  type: string;
  available: number;
  reserved: number;
  maintenance: number;
  unknown: number;
}

interface SiteData {
  siteId: string;
  siteName: string;
  available: number;
  reserved: number;
  maintenance: number;
  unknown: number;
  total: number;
  byNodeType: NodeTypeCount[];
}

function buildSiteData(nodes: SearchNodeItem[], siteMap: Map<string, Site>): SiteData[] {
  const map = new Map<string, SiteData>();

  for (const node of nodes) {
    if (!map.has(node.site_id)) {
      map.set(node.site_id, {
        siteId: node.site_id,
        siteName: siteMap.get(node.site_id)?.name ?? node.site_id,
        available: 0, reserved: 0, maintenance: 0, unknown: 0, total: 0, byNodeType: [],
      });
    }
    const s = map.get(node.site_id)!;
    s.total++;
    if (node.availability === "available") s.available++;
    else if (node.availability === "reserved") s.reserved++;
    else if (node.availability === "maintenance") s.maintenance++;
    else s.unknown++;
  }

  for (const [siteId, siteData] of map) {
    const typeMap = new Map<string, NodeTypeCount>();
    for (const node of nodes) {
      if (node.site_id !== siteId) continue;
      if (!typeMap.has(node.node_type)) {
        typeMap.set(node.node_type, { type: node.node_type, available: 0, reserved: 0, maintenance: 0, unknown: 0 });
      }
      const t = typeMap.get(node.node_type)!;
      if (node.availability === "available") t.available++;
      else if (node.availability === "reserved") t.reserved++;
      else if (node.availability === "maintenance") t.maintenance++;
      else t.unknown++;
    }
    siteData.byNodeType = Array.from(typeMap.values()).sort((a, b) => b.available - a.available);
  }

  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

interface Props {
  nodes: SearchNodeItem[];
  siteMap: Map<string, Site>;
  controls?: React.ReactNode;
  onFilter?: (siteId: string, nodeType: string) => void;
  selectedChips?: Set<string>;
  selectedSites?: Set<string>;
  onSiteToggle?: (siteId: string) => void;
  siteOrder?: string[];
}

export function SiteAvailabilityBars({ nodes, siteMap, controls, onFilter, selectedChips, selectedSites, onSiteToggle, siteOrder }: Props) {
  const [showAssociate, setShowAssociate] = useState(false);

  if (nodes.length === 0) return null;

  const allSites = buildSiteData(nodes, siteMap);
  if (siteOrder) {
    allSites.sort((a, b) => {
      const ai = siteOrder.indexOf(a.siteId);
      const bi = siteOrder.indexOf(b.siteId);
      return (ai === -1 ? 9999 : ai) - (bi === -1 ? 9999 : bi);
    });
  }
  const coreSites = allSites.filter((s) => isCoreSite(s.siteId));
  const associateSites = allSites.filter((s) => !isCoreSite(s.siteId));
  const renderBar = (site: SiteData, core: boolean) => {
    const isSiteSelected = selectedSites ? (selectedSites.has(site.siteId)) : true;
    const availPct = (site.available / site.total) * 100;
    const resPct = (site.reserved / site.total) * 100;
    const maintPct = (site.maintenance / site.total) * 100;
    const unkPct = (site.unknown / site.total) * 100;

    return (
      <div
        key={site.siteId}
        className={`transition-opacity ${!isSiteSelected ? "opacity-40" : !core ? "opacity-60" : ""}`}
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => onSiteToggle?.(site.siteId)}
            className={`text-xs w-24 flex-shrink-0 text-right flex items-center justify-end gap-1.5 group ${
              onSiteToggle ? "cursor-pointer" : "cursor-default"
            } ${core ? "font-medium" : ""} ${isSiteSelected ? "text-grey-dark" : "text-grey-med"}`}
            title={site.siteName}
            disabled={!onSiteToggle}
          >
            <span className="truncate">{site.siteName}</span>
            {onSiteToggle && (
              <span className={`w-3.5 h-3.5 flex-shrink-0 rounded border flex items-center justify-center transition-colors ${
                isSiteSelected
                  ? "bg-brand-info border-brand-info"
                  : "border-grey-med group-hover:border-brand-info"
              }`}>
                {isSiteSelected && (
                  <svg viewBox="0 0 10 10" className="w-2 h-2 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                  </svg>
                )}
              </span>
            )}
          </button>

          <div className={`flex-1 rounded-full overflow-hidden bg-grey-lighter flex ${core ? "h-4" : "h-2.5"}`}>
            {availPct > 0 && (
              <div className="h-full bg-brand-success transition-all flex items-center justify-center overflow-hidden" style={{ width: `${availPct}%` }}>
                {core && availPct >= 5 && <span className="text-[8px] font-semibold text-white leading-none">{Math.round(availPct)}%</span>}
              </div>
            )}
            {resPct > 0 && (
              <div className="h-full bg-brand-danger transition-all flex items-center justify-center overflow-hidden" style={{ width: `${resPct}%` }}>
                {core && resPct >= 5 && <span className="text-[8px] font-semibold text-white leading-none">{Math.round(resPct)}%</span>}
              </div>
            )}
            {maintPct > 0 && (
              <div className="h-full bg-yellow-500 transition-all flex items-center justify-center overflow-hidden" style={{ width: `${maintPct}%` }}>
                {core && maintPct >= 5 && <span className="text-[8px] font-semibold text-white leading-none">{Math.round(maintPct)}%</span>}
              </div>
            )}
            {unkPct > 0 && (
              <div className="h-full bg-grey-med transition-all flex items-center justify-center overflow-hidden" style={{ width: `${unkPct}%` }}>
                {core && unkPct >= 5 && <span className="text-[8px] font-semibold text-white leading-none">{Math.round(unkPct)}%</span>}
              </div>
            )}
          </div>

          <span className="text-xs text-grey w-44 flex-shrink-0 whitespace-nowrap">
            {site.available > 0 && (
              <span className={`font-medium ${core ? "text-brand-success" : "text-grey"}`}>
                {site.available} avail
              </span>
            )}
            {site.reserved > 0 && (
              <span className="font-medium text-brand-danger">
                {site.available > 0 ? " · " : ""}{site.reserved} res
              </span>
            )}
            {site.maintenance > 0 && (
              <span className="font-medium text-yellow-600">
                {(site.available > 0 || site.reserved > 0) ? " · " : ""}{site.maintenance} maint
              </span>
            )}
            {site.unknown > 0 && (
              <span className="text-grey-med">
                {(site.available > 0 || site.reserved > 0 || site.maintenance > 0) ? " · " : ""}{site.unknown} unk
              </span>
            )}
          </span>
        </div>

        <div className="mt-1 flex gap-3">
          <div className="w-24 flex-shrink-0" />
          <div className="flex-1 flex flex-wrap gap-1">
            {site.byNodeType.map((nt) => {
              const chipKey = `${site.siteId}:${nt.type}`;
              const isSelected = selectedChips?.has(chipKey) ?? false;
              return (
                <button
                  key={nt.type}
                  onClick={(e) => { e.stopPropagation(); onFilter?.(site.siteId, nt.type); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium transition-all ${
                    onFilter ? "cursor-pointer" : "cursor-default"
                  } ${
                    isSelected
                      ? "bg-brand-info text-white ring-2 ring-brand-info ring-offset-1"
                      : nt.available > 0
                      ? "bg-brand-success/10 text-brand-success hover:opacity-75"
                      : nt.reserved > 0
                      ? "bg-brand-danger/10 text-brand-danger hover:opacity-75"
                      : nt.maintenance > 0
                      ? "bg-yellow-100 text-yellow-700 hover:opacity-75"
                      : "bg-grey-light text-grey hover:opacity-75"
                  }`}
                >
                  {nt.type} ({nt.available > 0 ? nt.available : nt.reserved > 0 ? `${nt.reserved} res` : nt.maintenance > 0 ? `${nt.maintenance} maint` : "?"})
                </button>
              );
            })}
          </div>
          <div className="w-44 flex-shrink-0" />
        </div>
      </div>
    );
  };

  return (
    <div className="bg-white border-b border-grey-light px-6 py-3">
      <div className="space-y-2">
        {coreSites.map((s) => renderBar(s, true))}

        {associateSites.length > 0 && (
          <>
            {showAssociate && (
              <div className="border-t border-grey-light pt-2 mt-1 space-y-2">
                {associateSites.map((s) => renderBar(s, false))}
              </div>
            )}
            <button
              onClick={() => setShowAssociate((v) => !v)}
              className="text-[10px] text-link hover:text-link-hover ml-28 mt-1 transition-colors"
            >
              {showAssociate
                ? "Hide associate sites"
                : `Show associate sites (${associateSites.length})`}
            </button>
          </>
        )}
      </div>

      <div className="flex items-center justify-between mt-2.5 ml-28">
        <div className="flex items-center gap-4">
          {[
            { color: "bg-brand-success", label: "Available" },
            { color: "bg-brand-danger", label: "Reserved" },
            { color: "bg-yellow-500", label: "Maintenance" },
            { color: "bg-grey-med", label: "Unknown" },
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1 text-[10px] text-grey">
              <span className={`w-2 h-2 rounded-full ${color} inline-block`} />
              {label}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {controls}
        </div>
      </div>
    </div>
  );
}
