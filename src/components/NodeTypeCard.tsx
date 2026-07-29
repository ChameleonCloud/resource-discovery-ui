import * as Checkbox from "@radix-ui/react-checkbox";
import type { SearchNodeItem } from "../api/types";
import { isCoreSite } from "../lib/sites";
import { AVAILABILITY_STYLES, AVAILABILITY_LABELS, NodeSpecGrid } from "./NodeCard";

interface Props {
  nodes: SearchNodeItem[];
  siteName: string;
  selectedCount: number;
  onQuantityChange: (count: number) => void;
  onClick: () => void;
}

export function NodeTypeCard({ nodes, siteName, selectedCount, onQuantityChange, onClick }: Props) {
  const node = nodes[0];
  const isCore = isCoreSite(node.site_id);

  const availabilityCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.availability] = (acc[n.availability] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <article
      className={`bg-white rounded-lg shadow-sm border-2 transition-all cursor-pointer hover:shadow-md hover:border-brand-info ${
        selectedCount > 0 ? "border-brand-info ring-2 ring-brand-info/20" : isCore ? "border-grey-light" : "border-dashed border-grey-light"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-label={`${node.node_type} at ${siteName}`}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox.Root
              checked={selectedCount > 0}
              onCheckedChange={(v) => onQuantityChange(v ? 1 : 0)}
              className="w-4 h-4 rounded border-2 border-grey-med bg-white data-[state=checked]:bg-brand-info data-[state=checked]:border-brand-info flex-shrink-0"
              aria-label={selectedCount > 0 ? "Remove from selection" : "Add to reservation"}
            >
              <Checkbox.Indicator>
                <svg viewBox="0 0 10 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
          </div>
          <h2 className="font-semibold text-grey-dark truncate text-sm flex-1">{node.node_type}</h2>
          {selectedCount > 0 ? (
            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => onQuantityChange(Math.max(0, selectedCount - 1))}
                className="w-5 h-5 flex items-center justify-center rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info text-xs leading-none"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="text-xs font-medium text-brand-info w-6 text-center tabular-nums">{selectedCount}</span>
              <button
                onClick={() => onQuantityChange(Math.min(nodes.length, selectedCount + 1))}
                disabled={selectedCount >= nodes.length}
                className="w-5 h-5 flex items-center justify-center rounded border border-grey-light text-grey hover:border-brand-info hover:text-brand-info text-xs leading-none disabled:opacity-40 disabled:cursor-not-allowed"
                aria-label="Increase quantity"
              >
                +
              </button>
              <span className="text-xs text-grey-med">/{nodes.length}</span>
            </div>
          ) : (
            <span className="text-xs text-grey font-medium flex-shrink-0">
              {nodes.length} node{nodes.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        <div className="mb-1.5">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <span className="text-xs px-1 rounded bg-brand-info/10 text-brand-info font-medium leading-4">
              Bare metal
            </span>
            {(Object.keys(AVAILABILITY_LABELS) as (keyof typeof AVAILABILITY_LABELS)[])
              .filter((status) => availabilityCounts[status])
              .map((status) => (
                <span
                  key={status}
                  className={`text-xs px-1 rounded-full font-medium leading-4 ${AVAILABILITY_STYLES[status]}`}
                >
                  {availabilityCounts[status]} {AVAILABILITY_LABELS[status]}
                </span>
              ))}
            {!isCore && (
              <span className="text-xs px-1 rounded bg-grey-light text-grey font-medium leading-4">
                Associate
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-grey overflow-hidden">
            <span className="truncate shrink">{siteName}</span>
          </div>
        </div>

        <NodeSpecGrid node={node} />
      </div>
    </article>
  );
}
