import * as Checkbox from "@radix-ui/react-checkbox";
import type { SearchNodeItem } from "../api/types";
import { isCoreSite } from "../lib/sites";
import { AVAILABILITY_STYLES, AVAILABILITY_LABELS, NodeSpecGrid } from "./NodeCard";

interface Props {
  nodes: SearchNodeItem[];
  siteName: string;
  selectedCount: number;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
}

export function NodeTypeCard({ nodes, siteName, selectedCount, onSelect, onClick }: Props) {
  const node = nodes[0];
  const isCore = isCoreSite(node.site_id);

  const availabilityCounts = nodes.reduce<Record<string, number>>((acc, n) => {
    acc[n.availability] = (acc[n.availability] ?? 0) + 1;
    return acc;
  }, {});

  const allSelected = selectedCount === nodes.length;
  const checkedState: boolean | "indeterminate" = allSelected ? true : selectedCount > 0 ? "indeterminate" : false;

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
              checked={checkedState}
              onCheckedChange={(v) => onSelect(!!v)}
              className="w-4 h-4 rounded border-2 border-grey-med bg-white data-[state=checked]:bg-brand-info data-[state=checked]:border-brand-info data-[state=indeterminate]:bg-brand-info data-[state=indeterminate]:border-brand-info flex-shrink-0"
              aria-label={allSelected ? "Remove all from selection" : "Select all for reservation"}
            >
              <Checkbox.Indicator>
                <svg viewBox="0 0 10 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
          </div>
          <h2 className="font-semibold text-grey-dark truncate text-sm flex-1">{node.node_type}</h2>
          <span className="text-xs text-grey font-medium flex-shrink-0">
            {nodes.length} node{nodes.length !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-1 mb-1.5 overflow-hidden flex-wrap">
          <span className="text-xs text-grey truncate shrink">{siteName}</span>
          <span className="text-grey-med text-xs flex-shrink-0">·</span>
          <span className="text-xs px-1 rounded bg-brand-info/10 text-brand-info font-medium leading-4 flex-shrink-0">
            Bare metal
          </span>
          {(Object.keys(AVAILABILITY_LABELS) as (keyof typeof AVAILABILITY_LABELS)[])
            .filter((status) => availabilityCounts[status])
            .map((status) => (
              <span
                key={status}
                className={`text-xs px-1 rounded-full font-medium leading-4 flex-shrink-0 ${AVAILABILITY_STYLES[status]}`}
              >
                {availabilityCounts[status]} {AVAILABILITY_LABELS[status]}
              </span>
            ))}
          {!isCore && (
            <span className="text-xs px-1 rounded bg-grey-light text-grey font-medium leading-4 flex-shrink-0">
              Associate
            </span>
          )}
        </div>

        <NodeSpecGrid node={node} />
      </div>
    </article>
  );
}
