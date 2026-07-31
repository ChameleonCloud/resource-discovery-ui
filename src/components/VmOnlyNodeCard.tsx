import type { SearchNodeItem } from "../api/types";
import { NodeSpecGrid } from "./NodeCard";

interface Props {
  node: SearchNodeItem;
  siteName: string;
  onClick: () => void;
}

export function VmOnlyNodeCard({ node, siteName, onClick }: Props) {
  return (
    <article
      className="bg-white rounded-lg shadow-sm border-2 border-l-4 border-l-grey-dark border-grey-light opacity-80 cursor-pointer hover:opacity-100 hover:shadow-md transition-all"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-label={`${node.node_name || node.node_type} at ${siteName}`}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-grey-dark truncate text-sm flex-1">{node.node_name || node.node_type}</h2>
        </div>
        <div className="mb-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs px-1 rounded bg-grey-light text-grey font-medium leading-4">Bare metal</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-grey overflow-hidden">
            <span className="truncate shrink">{siteName}</span>
            <span className="text-grey-med flex-shrink-0">·</span>
            <span className="truncate shrink" title={node.node_type}>{node.node_type}</span>
          </div>
        </div>
        <NodeSpecGrid node={node} />
      </div>
    </article>
  );
}
