import type { VmFlavor } from "../api/types";
import { clamp } from "../lib/flavorFilters";

interface Props {
  flavor: VmFlavor;
  siteName: string;
  count: number;
  onCountChange: (count: number) => void;
  onClick: () => void;
}

export function FlavorCard({ flavor, siteName, count, onCountChange, onClick }: Props) {
  const hasGpu = flavor.gpu?.gpu ?? false;
  const selected = count > 0;

  return (
    <article
      className={`bg-white rounded-lg shadow-sm border-2 border-l-4 border-l-purple-400 transition-all cursor-pointer hover:shadow-md hover:border-purple-400 ${
        selected ? "border-purple-500 ring-2 ring-purple-500/20" : "border-grey-light"
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      aria-label={`${flavor.name} details`}
    >
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <h2 className="font-semibold text-grey-dark truncate text-sm flex-1">{flavor.name}</h2>
          <span className="text-xs text-grey font-medium flex-shrink-0">
            {typeof flavor.su_cost_per_hour === "number" ? `${flavor.su_cost_per_hour} SU/hr` : "—"}
          </span>
        </div>

        <div className="mb-1.5">
          <div className="flex items-center gap-1 mb-0.5">
            <span className="text-xs px-1 rounded bg-purple-100 text-purple-700 font-medium leading-4">
              Virtual machine
            </span>
            {hasGpu && (
              <span className="text-xs px-1 rounded-full font-medium leading-4 bg-brand-success text-white">
                {flavor.gpu.gpu_count ?? 1} GPU
              </span>
            )}
          </div>
          <div className="flex items-center gap-1 text-xs text-grey overflow-hidden">
            <span className="truncate shrink">{siteName}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-grey mb-3">
          <span>vCPUs: {flavor.vcpus}</span>
          <span>RAM: {flavor.humanized_ram_size}</span>
          <span>Disk: {flavor.humanized_disk_size}</span>
          {hasGpu && <span>GPU: {flavor.gpu.gpu_allocation ?? "yes"}</span>}
        </div>

        <div className="flex items-center justify-between gap-2" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center border border-grey-light rounded overflow-hidden">
            <button
              onClick={() => onCountChange(clamp(count - 1))}
              disabled={count === 0}
              className="w-6 h-6 flex items-center justify-center text-grey-dark hover:bg-grey-lighter disabled:opacity-30"
              aria-label={`Decrease ${flavor.name} quantity`}
            >
              −
            </button>
            <input
              type="number"
              min={0}
              value={count}
              onChange={(e) => onCountChange(clamp(Number(e.target.value) || 0))}
              className="w-10 text-center text-sm border-x border-grey-light focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              aria-label={`${flavor.name} quantity`}
            />
            <button
              onClick={() => onCountChange(clamp(count + 1))}
              className="w-6 h-6 flex items-center justify-center text-grey-dark hover:bg-grey-lighter"
              aria-label={`Increase ${flavor.name} quantity`}
            >
              +
            </button>
          </div>
          {selected && <span className="text-xs text-purple-600 font-medium">In cart</span>}
        </div>
      </div>
    </article>
  );
}
