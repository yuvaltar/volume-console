import type { Protocol, Volume, VolumeStatus } from "../api/types";

export type SortKey = "name" | "cluster" | "status" | "sizeGiB" | "used" | "snapshots" | "createdAt";
export type SortDir = "asc" | "desc";

export interface Query {
  search: string;
  statuses: VolumeStatus[];
  protocol: Protocol | "all";
  sort: { key: SortKey; dir: SortDir };
  page: number;
  pageSize: number;
}

export const DEFAULT_QUERY: Query = {
  search: "",
  statuses: [],
  protocol: "all",
  sort: { key: "name", dir: "asc" },
  page: 1,
  pageSize: 25,
};

export const usedRatio = (v: Volume) => (v.sizeGiB === 0 ? 0 : v.usedGiB / v.sizeGiB);

const STATUS_ORDER: Record<VolumeStatus, number> = { offline: 0, degraded: 1, provisioning: 2, online: 3 };

function compare(a: Volume, b: Volume, key: SortKey): number {
  switch (key) {
    case "name":
    case "cluster":
      return a[key].localeCompare(b[key], undefined, { numeric: true });
    case "status":
      return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    case "used":
      return usedRatio(a) - usedRatio(b);
    case "createdAt":
      return a.createdAt.localeCompare(b.createdAt);
    default:
      return a[key] - b[key];
  }
}

export function filterVolumes(volumes: Volume[], q: Pick<Query, "search" | "statuses" | "protocol">): Volume[] {
  const term = q.search.trim().toLowerCase();
  return volumes.filter(
    (v) =>
      (term === "" || v.name.toLowerCase().includes(term) || v.id.includes(term) || v.cluster.includes(term)) &&
      (q.statuses.length === 0 || q.statuses.includes(v.status)) &&
      (q.protocol === "all" || v.protocol === q.protocol),
  );
}

/** Stable sort; ties fall back to name so the order never jumps between renders. */
export function sortVolumes(volumes: Volume[], sort: Query["sort"]): Volume[] {
  const dir = sort.dir === "asc" ? 1 : -1;
  return [...volumes].sort((a, b) => dir * compare(a, b, sort.key) || a.name.localeCompare(b.name));
}

export function paginate<T>(rows: T[], page: number, pageSize: number) {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const current = Math.min(Math.max(1, page), pageCount); // clamp: filtering can shrink the result under the user
  const start = (current - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), page: current, pageCount, total: rows.length };
}

export function applyQuery(volumes: Volume[], q: Query) {
  return paginate(sortVolumes(filterVolumes(volumes, q), q.sort), q.page, q.pageSize);
}

const UNITS = ["GiB", "TiB", "PiB"];
export function formatCapacity(gib: number): string {
  let value = gib;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${value >= 100 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${UNITS[unit]}`;
}
