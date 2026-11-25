export type VolumeStatus = "online" | "degraded" | "offline" | "provisioning";
export type Protocol = "NFS" | "SMB" | "iSCSI";

export interface Volume {
  id: string;
  name: string;
  cluster: string;
  protocol: Protocol;
  status: VolumeStatus;
  /** Provisioned size in GiB. */
  sizeGiB: number;
  /** Used capacity in GiB (0 ≤ usedGiB ≤ sizeGiB). */
  usedGiB: number;
  snapshots: number;
  /** ISO timestamp. */
  createdAt: string;
}

export interface NewVolume {
  name: string;
  cluster: string;
  protocol: Protocol;
  sizeGiB: number;
}

/** Scenarios the demo panel can force, so every UI state can be seen without a real backend. */
export type Scenario = "normal" | "slow" | "error" | "empty" | "flaky";

export const STATUSES: VolumeStatus[] = ["online", "degraded", "offline", "provisioning"];
export const PROTOCOLS: Protocol[] = ["NFS", "SMB", "iSCSI"];
export const CLUSTERS = ["cluster-tlv-01", "cluster-tlv-02", "cluster-fra-01", "cluster-nyc-01"];
