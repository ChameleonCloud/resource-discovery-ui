import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { VmFlavor, Site } from "../api/types";
import { ReservationSnippets, SpecRow } from "./ReservationSnippets";
import type { ReservationWindow } from "./ReservationSnippets";
import { KVM_SITE_ID } from "../lib/sites";
import { clamp } from "../lib/flavorFilters";

interface Props {
  flavor: VmFlavor | null;
  siteName: string;
  sites?: Site[];
  count: number;
  onCountChange: (count: number) => void;
  horizonUrl?: string;
  reservationWindow?: ReservationWindow | null;
  onClose: () => void;
}

type Tab = "info" | "reserve";

export function FlavorDetail({ flavor, siteName, sites, count, onCountChange, horizonUrl, reservationWindow, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("info");

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
      setTab("info");
    }
  }

  const hasGpu = flavor?.gpu?.gpu ?? false;
  const openstackEntries = Object.entries(flavor?.openstack_properties ?? {});

  return (
    <Dialog.Root open={!!flavor} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-in fade-in" />
        <Dialog.Content
          className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          aria-label={flavor ? `Details for ${flavor.name}` : "Flavor details"}
        >
          <div className="sticky top-0 bg-white border-b border-grey-light px-6 pt-4 z-10">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <Dialog.Title className="text-base font-semibold text-grey-dark">
                  {flavor?.name ?? ""}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-grey mt-0.5">
                  {siteName} — Virtual machine flavor
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="text-grey hover:text-grey-dark p-1 rounded hover:bg-grey-lighter flex-shrink-0"
                aria-label="Close"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </Dialog.Close>
            </div>

            <div className="flex">
              {(["info", "reserve"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                    tab === t
                      ? "border-purple-500 text-purple-600"
                      : "border-transparent text-grey hover:text-grey-dark"
                  }`}
                >
                  {t === "info" ? "Flavor Info" : "Reserve"}
                </button>
              ))}
            </div>
          </div>

          {flavor && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {tab === "info" && (
                <>
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-3">Specifications</h3>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                      <SpecRow label="vCPUs" value={flavor.vcpus} />
                      <SpecRow label="RAM" value={flavor.humanized_ram_size} />
                      <SpecRow label="Disk" value={flavor.humanized_disk_size} />
                      <SpecRow
                        label="Cost"
                        value={typeof flavor.su_cost_per_hour === "number" ? `${flavor.su_cost_per_hour} SU/hr` : "—"}
                      />
                      {hasGpu && (
                        <SpecRow
                          label="GPU"
                          value={`${flavor.gpu.gpu_count ?? 1}${flavor.gpu.gpu_allocation ? ` (${flavor.gpu.gpu_allocation})` : ""}`}
                        />
                      )}
                    </dl>
                  </section>

                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-3">Quantity</h3>
                    <div className="flex items-center gap-3">
                      <div className="flex items-center border border-grey-light rounded overflow-hidden">
                        <button
                          onClick={() => onCountChange(clamp(count - 1))}
                          disabled={count === 0}
                          className="w-7 h-7 flex items-center justify-center text-grey-dark hover:bg-grey-lighter disabled:opacity-30"
                          aria-label="Decrease quantity"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          min={0}
                          value={count}
                          onChange={(e) => onCountChange(clamp(Number(e.target.value) || 0))}
                          className="w-12 text-center text-sm border-x border-grey-light focus:outline-none"
                          aria-label="Quantity"
                        />
                        <button
                          onClick={() => onCountChange(clamp(count + 1))}
                          className="w-7 h-7 flex items-center justify-center text-grey-dark hover:bg-grey-lighter"
                          aria-label="Increase quantity"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-xs text-grey">{count > 0 ? "In cart" : "Not in cart"}</span>
                    </div>
                  </section>

                  {openstackEntries.length > 0 && (
                    <section>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-3">OpenStack properties</h3>
                      <div className="space-y-0.5 text-xs">
                        {openstackEntries.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-2">
                            <span className="text-grey truncate">{k}</span>
                            <span className="text-grey-dark truncate">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </>
              )}

              {tab === "reserve" && (
                <section>
                  <ReservationSnippets
                    nodes={[]}
                    flavors={[{ siteId: KVM_SITE_ID, flavor, count: count > 0 ? count : 1 }]}
                    sites={sites}
                    horizonUrl={horizonUrl}
                    reservationWindow={reservationWindow}
                  />
                </section>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
