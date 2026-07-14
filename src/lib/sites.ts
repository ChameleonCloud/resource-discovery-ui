const raw = import.meta.env.VITE_CORE_SITE_IDS ?? "uc,tacc,ncar";
export const CORE_SITE_IDS: Set<string> = new Set(
  raw.split(",").map((s: string) => s.trim()).filter(Boolean),
);

export function isCoreSite(uid: string): boolean {
  return CORE_SITE_IDS.has(uid);
}

export const KVM_SITE_ID = "kvm";

export const KVM_ENABLED = import.meta.env.VITE_FEATURE_KVM !== "false" && import.meta.env.VITE_FEATURE_KVM !== "0";
