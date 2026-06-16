import * as Checkbox from "@radix-ui/react-checkbox";
import type { SearchNodeItem } from "../api/types";
import { formatRam } from "../lib/availability";
import { isCoreSite } from "../lib/sites";

interface Props {
  node: SearchNodeItem;
  siteName: string;
  selected: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
}

export const AVAILABILITY_STYLES = {
  available: "bg-brand-success text-white",
  reserved: "bg-brand-danger text-white",
  maintenance: "bg-yellow-500 text-white",
  unknown: "bg-grey-med text-white",
} as const;

export const AVAILABILITY_LABELS = {
  available: "Available",
  reserved: "Reserved",
  maintenance: "Maintenance",
  unknown: "Unknown",
} as const;

const AVAILABILITY_TITLES = {
  available: undefined,
  reserved: undefined,
  maintenance: "Node is under maintenance",
  unknown: "Unknown availability",
} as const;

export function NodeSpecGrid({ node }: { node: SearchNodeItem }) {
  const hasGpu = node.gpu?.gpu ?? false;

  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-grey">
      {node.processor?.other_description || node.processor?.model ? (
        <span className="col-span-2 truncate" title={node.processor.other_description ?? node.processor.model}>
          CPU: {node.processor.other_description ?? node.processor.model}
        </span>
      ) : null}
      <span>RAM: {formatRam(node.main_memory?.ram_size)}</span>
      <span className="truncate" title={hasGpu ? (node.gpu?.gpu_model ?? "Yes") : undefined}>
        GPU: {hasGpu ? (node.gpu?.gpu_model ?? "Yes") : "No"}
      </span>
      {node.architecture?.platform_type && <span>Arch: {node.architecture.platform_type}</span>}
      {node.infiniband && <span>InfiniBand</span>}
      <span>
        SSD:{" "}
        {node.storage_devices?.some((d) => d.interface?.toLowerCase().includes("ssd") || d.driver?.toLowerCase() === "nvme")
          ? "Yes"
          : "No"}
      </span>
    </div>
  );
}

export function NodeCard({ node, siteName, selected, onSelect, onClick }: Props) {
  const isCore = isCoreSite(node.site_id);

  return (
    <article
      className={`bg-white rounded-lg shadow-sm border-2 transition-all cursor-pointer hover:shadow-md hover:border-brand-info ${
        selected ? "border-brand-info ring-2 ring-brand-info/20" : isCore ? "border-grey-light" : "border-dashed border-grey-light"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-label={`${node.node_name || node.node_type} at ${siteName}`}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <Checkbox.Root
              checked={selected}
              onCheckedChange={(v) => onSelect(!!v)}
              className="w-4 h-4 rounded border-2 border-grey-med bg-white data-[state=checked]:bg-brand-info data-[state=checked]:border-brand-info flex-shrink-0"
              aria-label={selected ? "Remove from selection" : "Select for reservation"}
            >
              <Checkbox.Indicator>
                <svg viewBox="0 0 10 10" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1.5 5l2.5 2.5 4.5-4.5" />
                </svg>
              </Checkbox.Indicator>
            </Checkbox.Root>
          </div>
          <h2 className="font-semibold text-grey-dark truncate text-sm flex-1">{node.node_name || node.node_type}</h2>
        </div>

        <div className="flex items-center gap-1 mb-1.5 overflow-hidden">
          <span className="text-xs text-grey truncate shrink">{siteName}</span>
          <span className="text-grey-med text-xs flex-shrink-0">·</span>
          <span className="text-xs text-grey truncate shrink" title={node.node_type}>
            {node.node_type}
          </span>
          <span className="text-grey-med text-xs flex-shrink-0">·</span>
          <span className="text-xs px-1 rounded bg-brand-info/10 text-brand-info font-medium leading-4 flex-shrink-0">
            Bare metal
          </span>
          <span
            className={`text-xs px-1 rounded-full font-medium leading-4 flex-shrink-0 ${AVAILABILITY_STYLES[node.availability] ?? AVAILABILITY_STYLES.unknown}`}
            title={AVAILABILITY_TITLES[node.availability]}
          >
            {AVAILABILITY_LABELS[node.availability] ?? AVAILABILITY_LABELS.unknown}
          </span>
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
