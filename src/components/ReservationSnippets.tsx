import { Fragment, useState, useMemo, useEffect } from "react";
import { useQueries } from "@tanstack/react-query";
import type { SearchNodeItem, Site, VmFlavor, StorageDevice } from "../api/types";
import { formatRam, findNextAvailableWindow } from "../lib/availability";
import { formatBytes, hasNvme, hasGpuDirect, hasNvmeOf, activeDeviceCount, isDeviceSsd, isAdapterEnabled } from "../lib/filters";
import { fetchNodeAvailability } from "../api/client";

type Mode = "cli" | "python" | "horizon";

export interface ReservationWindow {
  start: string; // ISO
  end: string;   // ISO
}

export interface FlavorLine {
  siteId: string;
  flavor: VmFlavor;
  count: number;
}

interface Props {
  nodes: SearchNodeItem[];
  flavors?: FlavorLine[];
  sites?: Site[];
  horizonUrl?: string;
  reservationWindow?: ReservationWindow | null;
}

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="relative">
      <pre className="bg-grey-dark text-grey-lighter text-xs p-3 rounded overflow-x-auto leading-relaxed font-mono whitespace-pre-wrap break-all">
        {code}
      </pre>
      <button
        onClick={copy}
        className="absolute top-2 right-2 text-xs bg-white/10 hover:bg-white/20 text-grey-lighter px-2 py-0.5 rounded transition-colors"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function fmtCliDate(date: string | Date): string {
  // "2026-06-01T14:00:00.000Z" → "2026-06-01 14:00"
  return new Date(date).toISOString().slice(0, 16).replace("T", " ");
}

function fmtPyDate(iso: string): string {
  const d = new Date(iso);
  return `datetime(${d.getUTCFullYear()}, ${d.getUTCMonth() + 1}, ${d.getUTCDate()}, ${d.getUTCHours()}, ${d.getUTCMinutes()}, tzinfo=timezone.utc)`;
}

function endDateFromNow(hours: number): string {
  const end = new Date();
  end.setTime(end.getTime() + hours * 3600 * 1000);
  end.setUTCMinutes(0, 0, 0);
  return fmtCliDate(end.toISOString());
}

function pyTimedelta(hours: number): string {
  return hours % 24 === 0 ? `timedelta(days=${hours / 24})` : `timedelta(hours=${hours})`;
}

const DURATION_PRESETS = [
  { label: "3h",     hours: 3 },
  { label: "6h",     hours: 6 },
  { label: "1 day",  hours: 24 },
  { label: "3 days", hours: 72 },
  { label: "1 week", hours: 168 },
];

type ReserveBy = "type" | "name";

function cliSnippet(
  nodesBySite: Map<string, SearchNodeItem[]>,
  flavorsBySite: Map<string, FlavorLine[]>,
  window?: ReservationWindow | null,
  reserveBy: ReserveBy = "type",
  durationHours = 24,
): string {
  const startDate = window ? `"${fmtCliDate(window.start)}"` : `"now"`;
  const endDate = window ? `"${fmtCliDate(window.end)}"` : `"${endDateFromNow(durationHours)}"`;

  const siteIds = Array.from(new Set([...nodesBySite.keys(), ...flavorsBySite.keys()]));
  const multiSite = siteIds.length > 1;
  const blocks: string[] = [];

  for (const siteId of siteIds) {
    const siteNodes = nodesBySite.get(siteId) ?? [];
    const siteFlavors = flavorsBySite.get(siteId) ?? [];
    const leaseName = multiSite ? `my-reservation-${siteId}` : `my-reservation`;
    const clauses: string[] = [];

    if (reserveBy === "name") {
      clauses.push(
        ...siteNodes.map((n) => {
          const prop = `["==","$node_name","${n.node_name}"]`;
          return `--reservation resource_type=physical:host,min=1,max=1,resource_properties='${prop}'`;
        }),
      );
    } else {
      const counts = countByNodeType(siteNodes);
      clauses.push(
        ...Array.from(counts).map(([nodeType, count]) => {
          const prop = `["==","$node_type","${nodeType}"]`;
          return `--reservation resource_type=physical:host,min=${count},max=${count},resource_properties='${prop}'`;
        }),
      );
    }

    clauses.push(
      ...siteFlavors.map(
        (f) => `--reservation resource_type=flavor:instance,flavor_id=$(openstack flavor show ${f.flavor.name} -f value -c id),amount=${f.count}`,
      ),
    );

    const resourceProps = clauses.join(" \\\n  ");
    blocks.push(
      [
        `openstack reservation lease create \\`,
        `  --start-date ${startDate} \\`,
        `  --end-date ${endDate} \\`,
        `  ${resourceProps} \\`,
        `  ${leaseName}`,
      ].join("\n"),
    );
  }
  return blocks.join("\n\n");
}

function pythonSnippet(
  nodesBySite: Map<string, SearchNodeItem[]>,
  flavorsBySite: Map<string, FlavorLine[]>,
  window?: ReservationWindow | null,
  siteNameMap?: Map<string, string>,
  reserveBy: ReserveBy = "type",
  durationHours = 24,
): string {
  const hasWindow = !!window;
  const lines = [
    "from chi import context, lease",
    hasWindow
      ? "from datetime import datetime, timezone"
      : "from datetime import datetime, timedelta, timezone",
    "",
    "# Reserve resources via python-chi",
    "# Requires: pip install python-chi",
    "",
  ];

  const siteIds = Array.from(new Set([...nodesBySite.keys(), ...flavorsBySite.keys()]));
  const multiSite = siteIds.length > 1;
  for (const siteId of siteIds) {
    const siteNodes = nodesBySite.get(siteId) ?? [];
    const siteFlavors = flavorsBySite.get(siteId) ?? [];
    const chiSiteName = siteNameMap?.get(siteId) ?? siteId;
    const leaseName = multiSite ? `my-reservation-${siteId}` : "my-reservation";

    lines.push(`context.use_device_auth()`);
    lines.push(`context.use_site("${chiSiteName}")`);
    lines.push(`context.use_project("CHI-XXXXXX")  # replace with your Chameleon project name`);
    lines.push(``);

    const leaseArgs: string[] = [`    "${leaseName}",`];
    if (hasWindow) {
      leaseArgs.push(`    start_date=${fmtPyDate(window!.start)},`);
      leaseArgs.push(`    end_date=${fmtPyDate(window!.end)},`);
    } else {
      leaseArgs.push(`    duration=${pyTimedelta(durationHours)},`);
    }
    lines.push(`my_lease = lease.Lease(`, ...leaseArgs, `)`);

    if (siteFlavors.length > 0 && siteNodes.length === 0) {
      for (const f of siteFlavors) {
        lines.push(`my_lease.add_flavor_reservation(name="${f.flavor.name}", amount=${f.count})`);
      }
    } else if (reserveBy === "name") {
      for (const n of siteNodes) {
        lines.push(`my_lease.add_node_reservation(amount=1, node_name="${n.node_name}")`);
      }
    } else {
      const counts = countByNodeType(siteNodes);
      for (const [nodeType, count] of counts) {
        lines.push(`my_lease.add_node_reservation(amount=${count}, node_type="${nodeType}")`);
      }
    }

    lines.push(`my_lease.submit(idempotent=True)`, `print(f"Lease created: {my_lease.id}")`, ``);
  }
  return lines.join("\n");
}

function countByNodeType(nodes: SearchNodeItem[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    counts.set(n.node_type, (counts.get(n.node_type) ?? 0) + 1);
  }
  return counts;
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

function groupFlavorsBySite(flavors: FlavorLine[]): Map<string, FlavorLine[]> {
  const map = new Map<string, FlavorLine[]>();
  for (const f of flavors) {
    const existing = map.get(f.siteId) ?? [];
    existing.push(f);
    map.set(f.siteId, existing);
  }
  return map;
}

export function ReservationSnippets({ nodes, flavors = [], sites, horizonUrl, reservationWindow }: Props) {
  const [mode, setMode] = useState<Mode>("cli");
  const [reserveBy, setReserveBy] = useState<ReserveBy>("type");
  const [durationHours, setDurationHours] = useState(24);
  const [adjustedWindow, setAdjustedWindow] = useState<{ start: Date; end: Date } | null>(null);

  const canReserveByName = nodes.length > 0 && nodes.every((n) => !!n.node_name);
  const siteNameMap = sites && new Map(sites.map((s) => [s.uid, s.name]));

  const nodesBySite = useMemo(() => groupBySite(nodes), [nodes]);
  const flavorsBySite = useMemo(() => groupFlavorsBySite(flavors), [flavors]);
  const siteIds = useMemo(
    () => Array.from(new Set([...nodesBySite.keys(), ...flavorsBySite.keys()])),
    [nodesBySite, flavorsBySite],
  );

  const unavailableNodes = useMemo(
    () => nodes.filter((n) => n.availability === "reserved" || n.availability === "maintenance"),
    [nodes],
  );

  const availQueries = useQueries({
    queries: nodes.map((n) => ({
      queryKey: ["availability", n.site_id, n.cluster_id, n.uid],
      queryFn: () => fetchNodeAvailability(n.site_id, n.cluster_id, n.uid),
      staleTime: 2 * 60 * 1000,
      retry: false,
    })),
  });

  const effectiveWindow = useMemo(() => {
    if (adjustedWindow) {
      return adjustedWindow;
    }
    if (reservationWindow) {
      return { start: new Date(reservationWindow.start), end: new Date(reservationWindow.end) };
    }
    if (mode === "cli" || mode === "python") {
      const start = new Date();
      const end = new Date(start.getTime() + durationHours * 3600 * 1000);
      return { start, end };
    }
    return null;
  }, [adjustedWindow, reservationWindow, mode, durationHours]);

  // Reset any local adjustment whenever the underlying window or duration changes.
  useEffect(() => {
    setAdjustedWindow(null);
  }, [reservationWindow?.start, reservationWindow?.end, durationHours]);

  const reservationIntervals = useMemo(() => {
    return nodes.flatMap((n, i) => {
      if (n.availability === "maintenance") return [];
      const reservations = availQueries[i]?.data?.reservations ?? [];
      return reservations.map((r) => ({ start: new Date(r.start).getTime(), end: new Date(r.end).getTime() }));
    });
  }, [nodes, availQueries]);

  const conflicts = useMemo(() => {
    if (!effectiveWindow || availQueries.some((q) => q.isPending)) return [];
    return nodes.flatMap((n, i) => {
      if (n.availability === "maintenance") return [];
      const reservations = availQueries[i]?.data?.reservations ?? [];
      return reservations
        .filter((r) => new Date(r.start) < effectiveWindow.end && new Date(r.end) > effectiveWindow.start)
        .map((r) => ({ node: n, start: r.start, end: r.end }));
    });
  }, [nodes, availQueries, effectiveWindow]);

  function adjustToNextAvailable() {
    if (!effectiveWindow) return;
    const durationMs = effectiveWindow.end.getTime() - effectiveWindow.start.getTime();
    const searchStart = new Date(Math.max(Date.now(), effectiveWindow.start.getTime()));
    setAdjustedWindow(findNextAvailableWindow(reservationIntervals, durationMs, searchStart));
  }

  // The window to use for generating snippets / Horizon links — reflects any local adjustment.
  const snippetWindow: ReservationWindow | null = adjustedWindow
    ? { start: adjustedWindow.start.toISOString(), end: adjustedWindow.end.toISOString() }
    : reservationWindow ?? null;

  const tabs: { key: Mode; label: string }[] = [
    { key: "cli", label: "OpenStack CLI" },
    { key: "python", label: "python-chi" },
    { key: "horizon", label: "Horizon" },
  ];

  return (
    <div>
      {unavailableNodes.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2.5 mb-3 text-xs">
          <p className="font-medium text-yellow-800 mb-0.5">
            ⚠{" "}
            {unavailableNodes.length === 1 && nodes.length === 1
              ? `This node is currently ${unavailableNodes[0].availability === "maintenance" ? "under maintenance" : "reserved"}`
              : `${unavailableNodes.length} of ${nodes.length} selected nodes are currently unavailable`}
          </p>
          <p className="text-yellow-700">
            {reservationWindow
              ? "One or more nodes in your selection are reserved or under maintenance during the selected time range — your reservation may fail."
              : "One or more nodes are currently reserved or under maintenance — your reservation may fail."}
          </p>
          {unavailableNodes.length <= 6 && (
            <ul className="mt-1.5 space-y-0.5">
              {unavailableNodes.map((n) => (
                <li key={n.uid} className="flex items-center gap-1.5 text-yellow-800">
                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.availability === "maintenance" ? "bg-yellow-500" : "bg-brand-danger"}`} />
                  <span>{n.node_name ?? n.node_type}</span>
                  <span className="text-yellow-600">({n.availability === "maintenance" ? "maintenance" : "reserved"})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {conflicts.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-2.5 mb-3 text-xs">
          <p className="font-medium text-yellow-800 mb-0.5">
            ⚠ {conflicts.length === 1 ? "1 reservation conflict" : `${conflicts.length} reservation conflicts`}
          </p>
          <p className="text-yellow-700 mb-1.5">
            {conflicts.length === 1 ? "A node has" : "Nodes have"} an existing reservation that overlaps with{" "}
            {adjustedWindow ? "the adjusted time range" : reservationWindow ? "the selected time range" : "this period"} — your reservation will likely fail.
          </p>
          <ul className="space-y-0.5 mb-2">
            {conflicts.map((c, i) => (
              <li key={i} className="flex items-start gap-1.5 text-yellow-800">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow-500 flex-shrink-0 mt-1" />
                <span>
                  <span className="font-medium">{c.node.node_name ?? c.node.node_type}</span>
                  {" "}— reserved {fmtCliDate(c.start)} → {fmtCliDate(c.end)}
                </span>
              </li>
            ))}
          </ul>
          <button
            onClick={adjustToNextAvailable}
            className="text-xs font-medium text-yellow-800 bg-white border border-yellow-300 rounded px-2 py-1 hover:bg-yellow-100 transition-colors"
          >
            Adjust to next available time →
          </button>
        </div>
      )}
      {adjustedWindow && conflicts.length === 0 && (
        <div className="bg-blue-50 border border-brand-info/30 rounded p-2.5 mb-3 text-xs">
          <p className="text-brand-info">
            Times have been adjusted to the soonest window with no conflicts for{" "}
            {nodes.length === 1 ? "this node" : "these nodes"}:{" "}
            <span className="font-medium">{fmtCliDate(adjustedWindow.start)} → {fmtCliDate(adjustedWindow.end)}</span>
          </p>
          <button
            onClick={() => setAdjustedWindow(null)}
            className="mt-1 text-xs font-medium text-brand-info underline hover:no-underline"
          >
            Reset to original time
          </button>
        </div>
      )}
      <div className="flex items-center justify-between border-b border-grey-light mb-3">
        <div className="flex">
          {tabs.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setMode(key)}
              className={`px-3 py-1.5 text-sm border-b-2 transition-colors ${
                mode === key
                  ? "border-brand-info text-brand-info font-medium"
                  : "border-transparent text-grey hover:text-grey-dark"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {canReserveByName && (
          <div className="flex text-xs border border-grey-light rounded overflow-hidden mb-1">
            <button
              onClick={() => setReserveBy("type")}
              className={`px-2 py-1 transition-colors ${reserveBy === "type" ? "bg-grey-dark text-white" : "text-grey hover:text-grey-dark"}`}
            >
              Reserve by node type
            </button>
            <button
              onClick={() => setReserveBy("name")}
              className={`px-2 py-1 transition-colors ${reserveBy === "name" ? "bg-grey-dark text-white" : "text-grey hover:text-grey-dark"}`}
            >
              Reserve by node name
            </button>
          </div>
        )}
      </div>

      {mode === "cli" && (
        <div className="text-xs text-grey-dark mb-3 space-y-1">
          <p>
            You must have credentials configured for{" "}
            {siteIds
              .map((id) => <strong key={id}>{siteNameMap?.get(id) ?? id}</strong>)
              .reduce<React.ReactNode[]>((acc, el, i) => i === 0 ? [el] : [...acc, ", ", el], [])}
            {" "}before running this. We recommend{" "}
            <a
              href="https://chameleoncloud.readthedocs.io/en/latest/technical/cli/ccauth.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:text-link-hover underline"
            >
              ccauth
            </a>
            {" "}to set up and manage your credentials. After setup, set{" "}
            <code className="bg-grey-lighter px-1 rounded">OS_CLOUD</code>
            {" "}to the cloud name from your clouds.yaml before running this.
          </p>
          {siteIds.length > 1 && (
            <p>
              Each site block requires its own{" "}
              <code className="bg-grey-lighter px-1 rounded">OS_CLOUD</code>
              {" "}set to the matching cloud name from your clouds.yaml.
            </p>
          )}
        </div>
      )}
      {mode === "python" && (
        <div className="text-xs text-grey-dark mb-3 space-y-1">
          <p>
            The snippet uses{" "}
            <a
              href="https://python-chi.readthedocs.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-link hover:text-link-hover underline"
            >
              python-chi
            </a>
            {" "}and manages authentication independently of your shell environment.
            When you run it, you'll be prompted to visit a URL to authenticate via your browser.
            Replace <code className="bg-grey-lighter px-1 rounded">CHI-XXXXXX</code> with your Chameleon project name before running.
          </p>
          {siteIds.length > 1 && (
            <p>
              Each site block will prompt for a separate authentication — run them one at a time.
            </p>
          )}
        </div>
      )}

      {(mode === "cli" || mode === "python") && !reservationWindow && !adjustedWindow && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs text-grey-med flex-shrink-0">Duration (from now):</span>
          <div className="flex gap-1 flex-wrap">
            {DURATION_PRESETS.map(({ label, hours }) => (
              <button
                key={hours}
                onClick={() => setDurationHours(hours)}
                className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                  durationHours === hours
                    ? "bg-brand-info text-white border-brand-info"
                    : "border-grey-light text-grey hover:border-brand-info hover:text-brand-info"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === "cli" && <CodeBlock code={cliSnippet(nodesBySite, flavorsBySite, snippetWindow, reserveBy, durationHours)} />}
      {mode === "python" && <CodeBlock code={pythonSnippet(nodesBySite, flavorsBySite, snippetWindow, siteNameMap, reserveBy, durationHours)} />}
      {mode === "horizon" && (
        <div className="space-y-2">
          {siteIds.map((siteId) => {
            const siteNodes = nodesBySite.get(siteId) ?? [];
            const siteFlavors = flavorsBySite.get(siteId) ?? [];
            const flavorUnitCount = siteFlavors.reduce((n, f) => n + f.count, 0);
            return (
              <div key={siteId} className="rounded border border-grey-light p-3">
                <p className="text-sm font-medium text-grey-dark mb-1">
                  {siteId.toUpperCase()}
                  {siteNodes.length > 0 && ` — ${siteNodes.length} node${siteNodes.length !== 1 ? "s" : ""}`}
                  {siteFlavors.length > 0 && ` — ${flavorUnitCount} VM instance${flavorUnitCount !== 1 ? "s" : ""}`}
                </p>
                {siteNodes.length > 0 && (
                  <p className="text-xs text-grey mb-1">
                    Types: {Array.from(new Set(siteNodes.map((n) => n.node_type))).join(", ")}
                  </p>
                )}
                {siteFlavors.length > 0 && (
                  <p className="text-xs text-grey mb-1">
                    Flavors: {siteFlavors.map((f) => `${f.flavor.name} × ${f.count}`).join(", ")}
                  </p>
                )}
                {snippetWindow && (
                  <p className="text-xs text-brand-info mb-2">
                    {fmtCliDate(snippetWindow.start)} → {fmtCliDate(snippetWindow.end)}
                  </p>
                )}
                {horizonUrl ? (
                  <div className="space-y-2">
                    {siteNodes.length > 0 &&
                      (() => {
                        const nodeTypes = [...new Set(siteNodes.map((n) => n.node_type))];
                        const allSameType = nodeTypes.length === 1;
                        const singleNodeWithName = siteNodes.length === 1 && !!siteNodes[0].node_name;

                        let param = "";
                        let hint = "";
                        if (reserveBy === "name" && singleNodeWithName) {
                          param = `?node_name=${siteNodes[0].node_name}`;
                          hint = "Node name is pre-filled. You will need to set dates and any other options manually.";
                        } else if (reserveBy === "name") {
                          hint = "No resource properties will be pre-filled — Horizon only supports pre-filling a single node name. You will need to set all options manually.";
                        } else if (allSameType) {
                          param = `?node_type=${nodeTypes[0]}`;
                          hint = "Node type is pre-filled. You will need to set dates and any other options manually.";
                        } else {
                          hint = "No resource properties will be pre-filled — nodes span multiple types. You will need to set all options manually.";
                        }

                        return (
                          <div>
                            <a
                              href={`${horizonUrl}/project/leases/create${param}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-sm text-link hover:text-link-hover font-medium"
                            >
                              Reserve nodes in Horizon ↗
                            </a>
                            <p className="text-xs text-grey-med mt-2">{hint}</p>
                          </div>
                        );
                      })()}
                    {siteFlavors.length > 0 && (
                      <div>
                        <a
                          href={`${horizonUrl}/project/leases/create`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-sm text-link hover:text-link-hover font-medium"
                        >
                          Reserve VM flavor in Horizon ↗
                        </a>
                        <p className="text-xs text-grey-med mt-2">
                          Choose &quot;Instance Reservation&quot; and select {siteFlavors.map((f) => f.flavor.name).join(", ")} — flavor and dates aren&apos;t pre-filled yet, set them manually.
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-grey-med">Horizon URL not available for this site</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function SpecRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <dt className="text-grey">{label}</dt>
      <dd className="text-grey-dark">{value}</dd>
    </>
  );
}

function ExpandableSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-grey-light mt-3 pt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-link hover:text-link-hover font-medium w-full text-left"
      >
        <span>{open ? "▾" : "▸"}</span>
        {title}
      </button>
      {open && <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm mt-2">{children}</dl>}
    </div>
  );
}

function formatTotalStorage(devices: StorageDevice[]): string {
  const total = devices.reduce((sum, d) => sum + (d.size ?? 0), 0);
  if (total === 0) return "—";
  const GB = 1e9;
  const TB = 1e12;
  if (total < 200 * GB) return "< 200 GB";
  if (total < 400 * GB) return "200–400 GB";
  if (total < TB) return "400 GB–1 TB";
  return "> 1 TB";
}

function formatRate(bps?: number): string {
  if (bps == null) return "—";
  if (bps >= 1e12) return `${(bps / 1e12).toFixed(2)} Tbps`;
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} Gbps`;
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(0)} Mbps`;
  return `${bps} bps`;
}

export function NodeSpecSummary({ node }: { node: SearchNodeItem }) {
  const cpu = node.processor;
  const arch = node.architecture;
  const mem = node.main_memory;
  const storage = node.storage_devices ?? [];

  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
      <SpecRow label="Node type" value={<span className="font-medium">{node.node_type}</span>} />
      {node.node_name && <SpecRow label="Node name" value={node.node_name} />}
      <SpecRow label="UUID" value={<span className="font-mono text-xs break-all">{node.uid}</span>} />
      <SpecRow label="Site" value={node.site_id} />
      <SpecRow label="Cluster" value={node.cluster_id} />
      {arch?.platform_type && (
        <SpecRow label="Architecture" value={arch.platform_type} />
      )}

      {cpu?.other_description
        ? <SpecRow label="CPU" value={cpu.other_description} />
        : cpu?.model
        ? <SpecRow label="CPU" value={`${cpu.vendor ? cpu.vendor + " " : ""}${cpu.model}`} />
        : null}
      <SpecRow label="RAM" value={mem?.humanized_ram_size ?? formatRam(mem?.ram_size)} />
      {storage.length > 0 && (
        <SpecRow label="Total storage" value={formatTotalStorage(storage)} />
      )}
      <SpecRow
        label="GPU"
        value={node.gpu?.gpu
          ? [node.gpu.gpu_vendor, node.gpu.gpu_model ?? "Yes"].filter(Boolean).join(" ")
          : "No"}
      />
      <SpecRow
        label="Availability"
        value={
          <span className={`font-medium ${node.availability === "available" ? "text-brand-success" : node.availability === "reserved" ? "text-brand-danger" : node.availability === "maintenance" ? "text-yellow-600" : "text-grey"}`}>
            {node.availability === "available" ? "Available Now" : node.availability === "reserved" ? "Reserved" : node.availability === "maintenance" ? "Maintenance" : "Unknown"}
          </span>
        }
      />
    </dl>
  );
}

export function NodeSpecDetails({ node }: { node: SearchNodeItem }) {
  const cpu = node.processor;
  const arch = node.architecture;
  const adapters = node.network_adapters ?? [];
  const storage = node.storage_devices ?? [];

  return (
    <div>
      {cpu && (
        <ExpandableSection title="Processor details">
          {(cpu.vendor || cpu.other_description || cpu.model) && <SpecRow label="Model" value={[cpu.vendor, cpu.other_description ?? cpu.model].filter(Boolean).join(" ")} />}
          {cpu.version && <SpecRow label="Version" value={cpu.version} />}
          {cpu.instruction_set && <SpecRow label="Instruction set" value={cpu.instruction_set} />}
          {cpu.clock_speed && <SpecRow label="Clock speed" value={`${(cpu.clock_speed / 1e9).toFixed(2)} GHz`} />}
          {arch?.smp_size && <SpecRow label="Sockets" value={arch.smp_size} />}
          {arch?.smt_size && <SpecRow label="Threads" value={arch.smt_size} />}
          {cpu.cache_l1d && <SpecRow label="L1d cache" value={formatBytes(cpu.cache_l1d)} />}
          {cpu.cache_l1i && <SpecRow label="L1i cache" value={formatBytes(cpu.cache_l1i)} />}
          {cpu.cache_l1 && !cpu.cache_l1d && !cpu.cache_l1i && <SpecRow label="L1 cache" value={formatBytes(cpu.cache_l1)} />}
          {cpu.cache_l2 && <SpecRow label="L2 cache" value={formatBytes(cpu.cache_l2)} />}
          {cpu.cache_l3 && <SpecRow label="L3 cache" value={formatBytes(cpu.cache_l3)} />}
        </ExpandableSection>
      )}

      <ExpandableSection title="GPU">
        {node.gpu?.gpu ? (
          <>
            {!!node.gpu.gpu_count && <SpecRow label="Count" value={node.gpu.gpu_count} />}
            {node.gpu.gpu_vendor && <SpecRow label="Vendor" value={node.gpu.gpu_vendor} />}
            {node.gpu.gpu_model && <SpecRow label="Model" value={node.gpu.gpu_model} />}
            {node.gpu.gpu_memory != null && <SpecRow label="Memory" value={formatBytes(node.gpu.gpu_memory)} />}
          </>
        ) : (
          <SpecRow label="GPU" value="No" />
        )}
      </ExpandableSection>

      {node.fpga && (
        <ExpandableSection title="FPGA">
          {node.fpga.board_vendor && <SpecRow label="Vendor" value={node.fpga.board_vendor} />}
          {node.fpga.board_model && <SpecRow label="Model" value={node.fpga.board_model} />}
        </ExpandableSection>
      )}

      <ExpandableSection title="Storage">
        {storage.length > 0 ? storage.map((d, i) => (
          <Fragment key={i}>
            {storage.length > 1 && (
              <dt className="col-span-2 text-xs font-medium text-grey-dark border-t border-grey-light mt-1 pt-1 first:border-0 first:mt-0 first:pt-0">
                {d.device ?? `Device ${i + 1}`}
              </dt>
            )}
            {storage.length === 1 && d.device && <SpecRow label="Device" value={d.device} />}
            <SpecRow label="Size" value={d.humanized_size ?? formatBytes(d.size)} />
            {d.model && <SpecRow label="Model" value={`${d.vendor ? d.vendor + " " : ""}${d.model}`} />}
            {[d.media_type, d.interface, d.driver].some(Boolean) && (
              <SpecRow label="Type" value={[d.media_type, d.interface, d.driver].filter(Boolean).join(" · ")} />
            )}
            <SpecRow label="SSD" value={isDeviceSsd(d) ? "Yes" : "No"} />
            {d.rev && <SpecRow label="Rev" value={d.rev} />}
            {d.serial && <SpecRow label="S/N" value={<span className="font-mono">{d.serial}</span>} />}
            {d.wwn && <SpecRow label="WWN" value={<span className="font-mono">{d.wwn}</span>} />}
          </Fragment>
        )) : (
          <SpecRow label="Devices" value="None" />
        )}
      </ExpandableSection>

      <ExpandableSection title="Placement">
        {node.placement?.rack != null
          ? <SpecRow label="Rack" value={node.placement.rack} />
          : <SpecRow label="Rack" value="—" />}
        {node.placement?.node != null && <SpecRow label="Node position" value={node.placement.node} />}
      </ExpandableSection>

      <ExpandableSection title="Network">
        {adapters.length > 0 ? (
          <>
            <SpecRow label="Active devices" value={activeDeviceCount(node)} />
            {adapters.map((a, i) => (
              <Fragment key={i}>
                {adapters.length > 1 && (
                  <dt className="col-span-2 text-xs font-medium text-grey-dark border-t border-grey-light mt-1 pt-1 first:border-0 first:mt-0 first:pt-0">
                    {a.device ?? `Adapter ${i + 1}`}
                  </dt>
                )}
                {adapters.length === 1 && a.device && <SpecRow label="Device" value={a.device} />}
                {a.name && <SpecRow label="Name" value={a.name} />}
                <SpecRow label="Rate" value={formatRate(a.rate)} />
                {a.model && <SpecRow label="Model" value={a.model} />}
                {a.vendor && <SpecRow label="Vendor" value={a.vendor} />}
                {a.interface && <SpecRow label="Interface" value={a.interface} />}
                {a.driver && <SpecRow label="Driver" value={a.driver} />}
                <SpecRow label="Enabled" value={isAdapterEnabled(a.enabled) ? "Yes" : "No"} />
                {a.mac && <SpecRow label="MAC" value={<span className="font-mono">{a.mac}</span>} />}
                {a.management != null && <SpecRow label="Management" value={a.management ? "Yes" : "No"} />}
                {a.bridged != null && <SpecRow label="Bridged" value={a.bridged ? "Yes" : "No"} />}
                {a.mounted != null && <SpecRow label="Mounted" value={a.mounted ? "Yes" : "No"} />}
              </Fragment>
            ))}
          </>
        ) : (
          <SpecRow label="Adapters" value="None" />
        )}
      </ExpandableSection>

      <ExpandableSection title="NVMe">
        <SpecRow label="NVMe" value={hasNvme(node) ? "Yes" : "No"} />
      </ExpandableSection>

      <ExpandableSection title="RDMA">
        <SpecRow label="InfiniBand" value={node.infiniband ? "Yes" : "No"} />
        <SpecRow label="GPUDirect" value={hasGpuDirect(node) ? "Yes" : "No"} />
        <SpecRow label="NVMEoF" value={hasNvmeOf(node) ? "Yes" : "No"} />
      </ExpandableSection>

      {node.bios && (
        <ExpandableSection title="BIOS">
          {node.bios.vendor && <SpecRow label="Vendor" value={node.bios.vendor} />}
          {node.bios.version && <SpecRow label="Version" value={node.bios.version} />}
          {node.bios.release_date && <SpecRow label="Release date" value={node.bios.release_date} />}
          {node.boot_mode && <SpecRow label="Boot mode" value={node.boot_mode.toUpperCase()} />}
        </ExpandableSection>
      )}

      {node.chassis && (
        <ExpandableSection title="Chassis">
          {node.chassis.manufacturer && <SpecRow label="Manufacturer" value={node.chassis.manufacturer} />}
          {node.chassis.name && <SpecRow label="Name" value={node.chassis.name} />}
          {node.chassis.serial && <SpecRow label="Serial" value={node.chassis.serial} />}
        </ExpandableSection>
      )}

      {(node.supported_job_types ?? node.monitoring) && (
        <ExpandableSection title="Job types & monitoring">
          {node.supported_job_types?.deploy != null && (
            <SpecRow label="Deploy" value={node.supported_job_types.deploy ? "Yes" : "No"} />
          )}
          {node.supported_job_types?.besteffort != null && (
            <SpecRow label="Best-effort" value={node.supported_job_types.besteffort ? "Yes" : "No"} />
          )}
          {node.supported_job_types?.virtual && (
            <SpecRow label="Virtualization" value={node.supported_job_types.virtual} />
          )}
          {node.monitoring?.wattmeter != null && (
            <SpecRow label="Wattmeter" value={node.monitoring.wattmeter ? "Yes" : "No"} />
          )}
        </ExpandableSection>
      )}
    </div>
  );
}
