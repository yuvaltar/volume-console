import { CLUSTERS, PROTOCOLS, type NewVolume, type Scenario, type Volume, type VolumeStatus } from "./types";

/** Small deterministic PRNG so the generated dataset is identical on every load (and in tests). */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIXES = ["finance", "hr", "analytics", "backup", "vm", "logs", "ml-train", "web", "db", "archive", "media", "build"];

export function generateVolumes(count: number, seed = 42): Volume[] {
  const rnd = mulberry32(seed);
  const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
  const start = Date.UTC(2023, 0, 1);
  const span = Date.UTC(2026, 10, 1) - start;
  const out: Volume[] = [];
  for (let i = 0; i < count; i++) {
    const r = rnd();
    const status: VolumeStatus = r < 0.82 ? "online" : r < 0.92 ? "degraded" : r < 0.97 ? "offline" : "provisioning";
    // Sizes from 10 GiB to ~100 TiB, skewed towards small volumes like real fleets.
    const sizeGiB = Math.round(10 * Math.pow(10, rnd() * 4));
    const fill = status === "provisioning" ? 0 : Math.min(1, Math.pow(rnd(), 0.6));
    out.push({
      id: `vol-${String(i + 1).padStart(5, "0")}`,
      name: `${pick(PREFIXES)}-${pick(PREFIXES)}-${String(i + 1).padStart(4, "0")}`,
      cluster: pick(CLUSTERS),
      protocol: pick(PROTOCOLS),
      status,
      sizeGiB,
      usedGiB: Math.round(sizeGiB * fill),
      snapshots: Math.floor(rnd() * 60),
      createdAt: new Date(start + rnd() * span).toISOString(),
    });
  }
  return out;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

export interface MockApiOptions {
  count?: number;
  /** Base latency in ms (multiplied for the "slow" scenario). */
  latency?: number;
}

/**
 * In-memory stand-in for a REST backend. Every call is async and honours the active scenario, so the UI
 * has to handle latency, failures and empty accounts exactly as it would against a real server.
 */
export function createMockApi({ count = 5000, latency = 450 }: MockApiOptions = {}) {
  let volumes = generateVolumes(count);
  let scenario: Scenario = "normal";
  let calls = 0;

  const wait = () => new Promise((r) => setTimeout(r, scenario === "slow" ? latency * 6 : latency));
  const maybeFail = () => {
    calls++;
    if (scenario === "error") throw new ApiError("The storage service is unavailable (503).", 503);
    // "flaky": every second write fails, to exercise partial-failure handling in bulk actions.
    if (scenario === "flaky" && calls % 2 === 0) throw new ApiError("Request timed out.", 504);
  };

  return {
    setScenario(s: Scenario) {
      scenario = s;
      calls = 0;
    },
    async listVolumes(): Promise<Volume[]> {
      await wait();
      if (scenario === "error") throw new ApiError("The storage service is unavailable (503).", 503);
      return scenario === "empty" ? [] : volumes.map((v) => ({ ...v }));
    },
    async createVolume(input: NewVolume): Promise<Volume> {
      await wait();
      maybeFail();
      if (volumes.some((v) => v.name === input.name)) {
        throw new ApiError(`A volume named "${input.name}" already exists.`, 409);
      }
      const vol: Volume = {
        id: `vol-${String(volumes.length + 1).padStart(5, "0")}`,
        ...input,
        status: "provisioning",
        usedGiB: 0,
        snapshots: 0,
        createdAt: new Date().toISOString(),
      };
      volumes = [vol, ...volumes];
      return vol;
    },
    async takeSnapshot(id: string): Promise<Volume> {
      await wait();
      maybeFail();
      const v = volumes.find((x) => x.id === id);
      if (!v) throw new ApiError("Volume not found.", 404);
      if (v.status === "offline") throw new ApiError(`${v.name} is offline.`, 409);
      v.snapshots += 1;
      return { ...v };
    },
    nameExists(name: string) {
      return volumes.some((v) => v.name === name);
    },
  };
}

export type MockApi = ReturnType<typeof createMockApi>;
export const api = createMockApi();
