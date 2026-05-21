import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { SearchNodeItem, Site } from "../api/types";
import { AvailabilityCalendar } from "./AvailabilityCalendar";
import { NodeSpecSummary, NodeSpecDetails, ReservationSnippets } from "./ReservationSnippets";
import type { ReservationWindow } from "./ReservationSnippets";

interface Props {
  node: SearchNodeItem | null;
  peerNodes: SearchNodeItem[];
  siteMap: Map<string, Site>;
  reservationWindow?: ReservationWindow | null;
  onClose: () => void;
}

type Tab = "info" | "reserve";

export function NodeDetail({ node, peerNodes, siteMap, reservationWindow, onClose }: Props) {
  const [tab, setTab] = useState<Tab>("info");
  const site = node ? siteMap.get(node.site_id) : null;

  function handleOpenChange(open: boolean) {
    if (!open) {
      onClose();
      setTab("info");
    }
  }

  return (
    <Dialog.Root open={!!node} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50 animate-in fade-in" />
        <Dialog.Content
          className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white z-50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
          aria-label={node ? `Details for ${node.node_type}` : "Node details"}
        >
          <div className="sticky top-0 bg-white border-b border-grey-light px-6 pt-4 z-10">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <Dialog.Title className="text-base font-semibold text-grey-dark">
                  {node?.node_type ?? ""}
                </Dialog.Title>
                <Dialog.Description className="text-xs text-grey mt-0.5">
                  {site?.name ?? node?.site_id}
                  {site?.location ? ` — ${site.location}` : ""}
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
                  className={`px-4 py-2 text-sm font-medium border-b-2 capitalize transition-colors ${
                    tab === t
                      ? "border-brand-info text-brand-info"
                      : "border-transparent text-grey hover:text-grey-dark"
                  }`}
                >
                  {t === "info" ? "Node Info" : "Reserve Node"}
                </button>
              ))}
            </div>
          </div>

          {node && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {node.admin_note && (
                <div className="bg-yellow-50 border border-yellow-300 rounded-md px-4 py-3 text-sm text-yellow-900">
                  <span className="font-semibold">Admin note: </span>{node.admin_note}
                </div>
              )}

              {tab === "info" && (
                <>
                  <section>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-grey mb-3">Specifications</h3>
                    <NodeSpecSummary node={node} />
                  </section>

                  <section>
                    <AvailabilityCalendar
                      node={node}
                      peerNodes={peerNodes}
                      siteName={site?.name ?? node.site_id}
                    />
                  </section>

                  <NodeSpecDetails node={node} />
                </>
              )}

              {tab === "reserve" && (
                <section>
                  <ReservationSnippets nodes={[node]} sites={site ? [site] : undefined} horizonUrl={site?.web} reservationWindow={reservationWindow} />
                </section>
              )}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
