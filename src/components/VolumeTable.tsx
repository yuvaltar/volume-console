import type { Volume } from "../api/types";
import { formatCapacity, type Query, type SortKey } from "../lib/query";
import { CapacityBar, StatusBadge } from "./ui";

const COLUMNS: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "cluster", label: "Cluster" },
  { key: "sizeGiB", label: "Size", numeric: true },
  { key: "used", label: "Used" },
  { key: "snapshots", label: "Snapshots", numeric: true },
  { key: "createdAt", label: "Created" },
];

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

interface Props {
  rows: Volume[];
  sort: Query["sort"];
  onSort: (key: SortKey) => void;
  selected: Set<string>;
  onToggle: (id: string) => void;
  onTogglePage: (select: boolean) => void;
  busyIds: Set<string>;
}

export function VolumeTable({ rows, sort, onSort, selected, onToggle, onTogglePage, busyIds }: Props) {
  const selectedOnPage = rows.filter((r) => selected.has(r.id)).length;
  const allOnPage = rows.length > 0 && selectedOnPage === rows.length;

  return (
    <div className="table-wrap" tabIndex={0} aria-label="Volumes table, scroll horizontally on small screens">
      <table className="table">
        <caption className="sr-only">Storage volumes. Column headers are buttons that sort the table.</caption>
        <thead>
          <tr>
            <th scope="col" className="col-check">
              <input
                type="checkbox"
                aria-label={allOnPage ? "Deselect all volumes on this page" : "Select all volumes on this page"}
                checked={allOnPage}
                ref={(el) => {
                  if (el) el.indeterminate = selectedOnPage > 0 && !allOnPage;
                }}
                onChange={(e) => onTogglePage(e.target.checked)}
              />
            </th>
            {COLUMNS.map((c) => {
              const active = sort.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={c.numeric ? "num" : undefined}
                  aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
                >
                  <button type="button" className="sort-btn" onClick={() => onSort(c.key)}>
                    {c.label}
                    <span className={`sort-icon${active ? " active" : ""}`} aria-hidden="true">
                      {active ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((v) => (
            <tr key={v.id} className={selected.has(v.id) ? "selected" : undefined} aria-busy={busyIds.has(v.id) || undefined}>
              <td className="col-check">
                <input
                  type="checkbox"
                  aria-label={`Select ${v.name}`}
                  checked={selected.has(v.id)}
                  onChange={() => onToggle(v.id)}
                />
              </td>
              <th scope="row" className="cell-name">
                <span className="vol-name">{v.name}</span>
                <span className="vol-meta">
                  {v.id} · {v.protocol}
                </span>
              </th>
              <td>
                <StatusBadge status={v.status} />
              </td>
              <td className="mono">{v.cluster}</td>
              <td className="num">{formatCapacity(v.sizeGiB)}</td>
              <td>
                <CapacityBar used={v.usedGiB} size={v.sizeGiB} label={`${v.name} capacity`} />
              </td>
              <td className="num">
                {busyIds.has(v.id) ? <span className="spinner" aria-label="Taking snapshot" /> : v.snapshots}
              </td>
              <td>
                <time dateTime={v.createdAt}>{dateFmt.format(new Date(v.createdAt))}</time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function SkeletonTable({ rows = 8 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <table className="table skeleton">
        <tbody>
          {Array.from({ length: rows }, (_, i) => (
            <tr key={i}>
              {Array.from({ length: 6 }, (_, j) => (
                <td key={j}>
                  <span className="skeleton-bar" style={{ width: `${40 + ((i * 7 + j * 13) % 50)}%` }} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Table pages">
      <label className="page-size">
        Rows per page
        <select value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))}>
          {[10, 25, 50, 100].map((n) => (
            <option key={n}>{n}</option>
          ))}
        </select>
      </label>
      <span className="page-range">
        {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </span>
      <div className="page-btns">
        <button type="button" className="icon-btn" onClick={() => onPage(1)} disabled={page === 1} aria-label="First page">
          «
        </button>
        <button type="button" className="icon-btn" onClick={() => onPage(page - 1)} disabled={page === 1} aria-label="Previous page">
          ‹
        </button>
        <span aria-current="page">
          Page {page} of {pageCount}
        </span>
        <button type="button" className="icon-btn" onClick={() => onPage(page + 1)} disabled={page === pageCount} aria-label="Next page">
          ›
        </button>
        <button type="button" className="icon-btn" onClick={() => onPage(pageCount)} disabled={page === pageCount} aria-label="Last page">
          »
        </button>
      </div>
    </nav>
  );
}
