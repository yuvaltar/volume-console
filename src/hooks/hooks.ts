import { useCallback, useEffect, useRef, useState } from "react";
import type { MockApi } from "../api/mockApi";
import type { Volume } from "../api/types";

export type LoadState =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; volumes: Volume[] };

/** Loads the volume list; ignores responses from superseded requests so a slow old call can't overwrite newer data. */
export function useVolumes(api: MockApi) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const requestId = useRef(0);

  const reload = useCallback(async () => {
    const id = ++requestId.current;
    setState({ kind: "loading" });
    try {
      const volumes = await api.listVolumes();
      if (id === requestId.current) setState({ kind: "ready", volumes });
    } catch (e) {
      if (id === requestId.current) setState({ kind: "error", message: e instanceof Error ? e.message : "Unknown error" });
    }
  }, [api]);

  useEffect(() => {
    void reload();
  }, [reload]);

  /** Optimistic local update after a successful write, without refetching 5,000 rows. */
  const patch = useCallback((fn: (vs: Volume[]) => Volume[]) => {
    setState((s) => (s.kind === "ready" ? { kind: "ready", volumes: fn(s.volumes) } : s));
  }, []);

  return { state, reload, patch };
}

export function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export type Theme = "light" | "dark";

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage can be blocked; fall back to the OS setting */
  }
  return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("theme", theme);
    } catch {
      /* ignore */
    }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === "dark" ? "light" : "dark")) };
}
