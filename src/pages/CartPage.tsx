import { useMemo } from "react";
import { Link } from "react-router-dom";
import type { SearchNodeItem } from "../api/types";
import { useSiteMap } from "../hooks/useSites";
import { ReservationSnippets } from "../components/ReservationSnippets";
import type { ReservationWindow } from "../components/ReservationSnippets";
import { formatRam } from "../lib/availability";
import { AVAILABILITY_STYLES, AVAILABILITY_LABELS } from "../components/NodeCard";

interface Props {
  cart: SearchNodeItem[];
  onRemove: (uid: string) => void;
  onClear: () => void;
}

function groupBySite(nodes: SearchNodeItem[]): Map<string, SearchNodeItem[]> {
  const map = new Map<string, SearchNodeItem[]>();
  for (const n of nodes) {
    const existing = map.get(n.site_id) ?? [];
    existing.push(n);
    map.set(n.site_id, existing);
  }
  return map;
}

export function CartPage({ cart, onRemove, onClear }: Props) {
  const siteMap = useSiteMap();

  const reservationWindow = useMemo((): ReservationWindow | null => {
    try {
      const raw = localStorage.getItem("reservation-window");
      return raw ? (JSON.parse(raw) as ReservationWindow) : null;
    } catch {
      return null;
    }
  }, []);
  const bySite = groupBySite(cart);
  const multiSite = bySite.size > 1;

  if (cart.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center px-4">
        <p className="text-2xl font-semibold text-grey-dark mb-3">Your cart is empty</p>
        <p className="text-grey mb-6">Select resources from the discovery page to reserve them.</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 bg-brand-info text-white px-4 py-2 rounded-lg hover:bg-link-hover transition-colors text-sm font-medium"
        >
          ← Browse resources
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-grey-dark">
            Cart — {cart.length} node{cart.length !== 1 ? "s" : ""}
          </h1>
          {multiSite && (
            <p className="text-sm text-grey mt-1">
              Nodes span {bySite.size} sites — reservation instructions are shown per site below.
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          <Link
            to="/"
            className="text-sm text-brand-info hover:text-blue-600 transition-colors"
          >
            ← Continue browsing
          </Link>
          <button
            onClick={onClear}
            className="text-sm text-grey hover:text-brand-danger transition-colors"
          >
            Remove all from cart
          </button>
        </div>
      </div>

      <div className="space-y-8">
        {Array.from(bySite).map(([siteId, siteNodes]) => {
          const site = siteMap.get(siteId);
          return (
            <section key={siteId} className="bg-white rounded-lg shadow-sm border border-grey-light overflow-hidden">
              <div className="px-5 py-3 border-b border-grey-light bg-grey-lighter flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-grey-dark text-sm">
                    {site?.name ?? siteId}
                  </h2>
                  {site?.location && (
                    <p className="text-xs text-grey">{site.location}</p>
                  )}
                </div>
                <span className="text-xs text-grey">{siteNodes.length} node{siteNodes.length !== 1 ? "s" : ""}</span>
              </div>

              <div className="divide-y divide-grey-light">
                {siteNodes.map((node) => (
                  <div key={node.uid} className="px-5 py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-grey-dark">{node.node_type}</p>
                      <p className="text-xs text-grey truncate">
                        RAM: {formatRam(node.main_memory?.ram_size)}
                        {node.gpu?.gpu ? ` · GPU: ${node.gpu.gpu_model ?? "Yes"}` : ""}
                        {node.infiniband ? " · InfiniBand" : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${AVAILABILITY_STYLES[node.availability] ?? AVAILABILITY_STYLES.unknown}`}>
                        {AVAILABILITY_LABELS[node.availability] ?? AVAILABILITY_LABELS.unknown}
                      </span>
                      <button
                        onClick={() => onRemove(node.uid)}
                        className="text-grey-med hover:text-brand-danger transition-colors text-xs"
                        aria-label={`Remove ${node.node_type} from cart`}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-5 py-4 border-t border-grey-light">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-3">Reserve these nodes</h3>
                <ReservationSnippets nodes={siteNodes} sites={site ? [site] : undefined} horizonUrl={site?.web} reservationWindow={reservationWindow} />
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
