import { useEffect, useMemo, useState } from "react";
import { api as defaultApi, type MockApi } from "./api/mockApi";
import { PROTOCOLS, STATUSES, type Protocol, type Scenario, type Volume, type VolumeStatus } from "./api/types";
import { CreateVolumeDialog } from "./components/CreateVolumeDialog";
import { Button, StatePanel } from "./components/ui";
import { Pagination, SkeletonTable, VolumeTable } from "./components/VolumeTable";
import { useDebounced, useTheme, useVolumes } from "./hooks/hooks";
import { applyQuery, DEFAULT_QUERY, formatCapacity, type Query, type SortKey } from "./lib/query";

const SCENARIOS: { value: Scenario; label: string }[] = [
  { value: "normal", label: "Normal" },
  { value: "slow", label: "Slow network" },
  { value: "error", label: "Server down" },
  { value: "empty", label: "New account (no data)" },
  { value: "flaky", label: "Flaky (every 2nd write fails)" },
];

interface Toast {
  id: number;
  tone: "success" | "error" | "info";
  text: string;
}

export default function App({ api = defaultApi }: { api?: MockApi }) {
  const { theme, toggle } = useTheme();
  const { state, reload, patch } = useVolumes(api);
  const [query, setQuery] = useState<Query>(DEFAULT_QUERY);
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("normal");
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = (tone: Toast["tone"], text: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 6000);
  };

  // Any change to what is shown sends the user back to page 1.
  useEffect(() => setQuery((q) => ({ ...q, search, page: 1 })), [search]);

  const volumes = state.kind === "ready" ? state.volumes : [];
  const result = useMemo(() => applyQuery(volumes, query), [volumes, query]);
  const filtersActive = query.search !== "" || query.statuses.length > 0 || query.protocol !== "all";

  const totals = useMemo(() => {
    const size = volumes.reduce((s, v) => s + v.sizeGiB, 0);
    const used = volumes.reduce((s, v) => s + v.usedGiB, 0);
    const attention = volumes.filter((v) => v.status === "degraded" || v.status === "offline").length;
    const nearlyFull = volumes.filter((v) => v.sizeGiB > 0 && v.usedGiB / v.sizeGiB >= 0.9).length;
    return { size, used, attention, nearlyFull };
  }, [volumes]);

  const onSort = (key: SortKey) =>
    setQuery((q) => ({
      ...q,
      sort: { key, dir: q.sort.key === key && q.sort.dir === "asc" ? "desc" : "asc" },
    }));

  const toggleStatus = (s: VolumeStatus) =>
    setQuery((q) => ({
      ...q,
      page: 1,
      statuses: q.statuses.includes(s) ? q.statuses.filter((x) => x !== s) : [...q.statuses, s],
    }));

  const clearFilters = () => {
    setSearchInput("");
    setQuery((q) => ({ ...q, search: "", statuses: [], protocol: "all", page: 1 }));
  };

  const changeScenario = (s: Scenario) => {
    setScenario(s);
    api.setScenario(s);
    setSelected(new Set());
    void reload();
  };

  const snapshotSelected = async () => {
    const ids = [...selected];
    setBusyIds(new Set(ids));
    // Run the writes in parallel and report each outcome: one failure must not hide the successes.
    const results = await Promise.allSettled(ids.map((id) => api.takeSnapshot(id)));
    const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
    const failed = ids.filter((_, i) => results[i].status === "rejected");
    const byId = new Map(ok.map((v) => [v.id, v]));
    patch((vs) => vs.map((v) => byId.get(v.id) ?? v));
    setBusyIds(new Set());
    setSelected(new Set(failed)); // keep only the failed ones selected so "retry" is one click
    if (failed.length === 0) toast("success", `Snapshot taken for ${ok.length} volume${ok.length === 1 ? "" : "s"}.`);
    else if (ok.length === 0) toast("error", `No snapshots were taken. ${failed.length} failed and are still selected.`);
    else toast("error", `${ok.length} snapshot${ok.length === 1 ? "" : "s"} taken, ${failed.length} failed. The failed volumes are still selected; try again.`);
  };

  const onCreated = (v: Volume) => {
    patch((vs) => [v, ...vs]);
    setQuery((q) => ({ ...q, sort: { key: "createdAt", dir: "desc" }, page: 1 }));
    toast("success", `Volume ${v.name} is being provisioned.`);
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main">
        Skip to volumes
      </a>
      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          Volume Console
        </div>
        <div className="topbar-actions">
          <label className="scenario">
            <span>Demo scenario</span>
            <select value={scenario} onChange={(e) => changeScenario(e.target.value as Scenario)}>
              {SCENARIOS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="icon-btn"
            onClick={toggle}
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {theme === "dark" ? "☀" : "☾"}
          </button>
        </div>
      </header>

      <main id="main" className="content">
        <div className="page-head">
          <div>
            <h1>Volumes</h1>
            <p className="muted">Provisioned storage across all clusters.</p>
          </div>
          <Button variant="primary" onClick={() => setCreateOpen(true)} disabled={state.kind !== "ready"}>
            + Create volume
          </Button>
        </div>

        {state.kind === "ready" && volumes.length > 0 && (
          <section className="stats" aria-label="Summary">
            <div className="stat">
              <span className="stat-label">Volumes</span>
              <span className="stat-value">{volumes.length.toLocaleString()}</span>
            </div>
            <div className="stat">
              <span className="stat-label">Capacity used</span>
              <span className="stat-value">
                {formatCapacity(totals.used)} <small>of {formatCapacity(totals.size)}</small>
              </span>
            </div>
            <button type="button" className="stat stat-link" onClick={() => setQuery((q) => ({ ...q, statuses: ["degraded", "offline"], page: 1 }))}>
              <span className="stat-label">Need attention</span>
              <span className="stat-value warn">{totals.attention.toLocaleString()}</span>
              <span className="stat-hint">Show them →</span>
            </button>
            <button type="button" className="stat stat-link" onClick={() => setQuery((q) => ({ ...q, sort: { key: "used", dir: "desc" }, page: 1 }))}>
              <span className="stat-label">Over 90% full</span>
              <span className="stat-value warn">{totals.nearlyFull.toLocaleString()}</span>
              <span className="stat-hint">Sort by usage →</span>
            </button>
          </section>
        )}

        <section className="card" aria-label="Volumes">
          <div className="toolbar" role="search">
            <input
              type="search"
              className="search"
              placeholder="Search by name, ID or cluster"
              aria-label="Search volumes"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              disabled={state.kind !== "ready"}
            />
            <fieldset className="chips" disabled={state.kind !== "ready"}>
              <legend className="sr-only">Filter by status</legend>
              {STATUSES.map((s) => (
                <label key={s} className={`chip${query.statuses.includes(s) ? " on" : ""}`}>
                  <input type="checkbox" checked={query.statuses.includes(s)} onChange={() => toggleStatus(s)} />
                  {s[0].toUpperCase() + s.slice(1)}
                </label>
              ))}
            </fieldset>
            <select
              aria-label="Filter by protocol"
              value={query.protocol}
              onChange={(e) => setQuery((q) => ({ ...q, protocol: e.target.value as Protocol | "all", page: 1 }))}
              disabled={state.kind !== "ready"}
            >
              <option value="all">All protocols</option>
              {PROTOCOLS.map((p) => (
                <option key={p}>{p}</option>
              ))}
            </select>
            {filtersActive && (
              <Button variant="ghost" onClick={clearFilters}>
                Clear filters
              </Button>
            )}
          </div>

          {selected.size > 0 && (
            <div className="bulkbar" role="region" aria-label="Bulk actions">
              <span>
                <strong>{selected.size}</strong> selected
              </span>
              <Button variant="primary" onClick={snapshotSelected} loading={busyIds.size > 0}>
                Take snapshot
              </Button>
              <Button variant="ghost" onClick={() => setSelected(new Set())} disabled={busyIds.size > 0}>
                Clear selection
              </Button>
            </div>
          )}

          {/* Polite live region: screen readers hear the result count after each search or filter change. */}
          <p className="sr-only" aria-live="polite">
            {state.kind === "loading" ? "Loading volumes" : state.kind === "ready" ? `${result.total} volumes shown` : ""}
          </p>

          {state.kind === "loading" && <SkeletonTable />}

          {state.kind === "error" && (
            <StatePanel
              tone="error"
              title="Couldn't load volumes"
              action={
                <Button variant="primary" onClick={() => void reload()}>
                  Try again
                </Button>
              }
            >
              {state.message} Your filters are kept; nothing was changed.
            </StatePanel>
          )}

          {state.kind === "ready" && volumes.length === 0 && (
            <StatePanel
              title="No volumes yet"
              action={
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  Create your first volume
                </Button>
              }
            >
              Volumes you create appear here with their status and capacity.
            </StatePanel>
          )}

          {state.kind === "ready" && volumes.length > 0 && result.total === 0 && (
            <StatePanel title="No volumes match these filters" action={<Button onClick={clearFilters}>Clear filters</Button>}>
              {query.search ? `Nothing matches "${query.search}". ` : ""}Try a different search or fewer filters.
            </StatePanel>
          )}

          {state.kind === "ready" && result.total > 0 && (
            <>
              <VolumeTable
                rows={result.rows}
                sort={query.sort}
                onSort={onSort}
                selected={selected}
                busyIds={busyIds}
                onToggle={(id) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    if (n.has(id)) n.delete(id);
                    else n.add(id);
                    return n;
                  })
                }
                onTogglePage={(on) =>
                  setSelected((s) => {
                    const n = new Set(s);
                    result.rows.forEach((r) => (on ? n.add(r.id) : n.delete(r.id)));
                    return n;
                  })
                }
              />
              <Pagination
                page={result.page}
                pageCount={result.pageCount}
                total={result.total}
                pageSize={query.pageSize}
                onPage={(page) => setQuery((q) => ({ ...q, page }))}
                onPageSize={(pageSize) => setQuery((q) => ({ ...q, pageSize, page: 1 }))}
              />
            </>
          )}
        </section>
      </main>

      <CreateVolumeDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={onCreated} api={api} />

      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.tone}`}>
            {t.text}
            <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setToasts((x) => x.filter((y) => y.id !== t.id))}>
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
