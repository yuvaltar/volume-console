import { generateVolumes } from "../api/mockApi";
import { applyQuery, DEFAULT_QUERY, filterVolumes, formatCapacity, paginate, sortVolumes } from "./query";
import { validateVolumeForm, type VolumeForm } from "./validation";

const data = generateVolumes(500);

describe("dataset", () => {
  it("is deterministic and internally consistent", () => {
    expect(generateVolumes(500)).toEqual(data);
    for (const v of data) {
      expect(v.usedGiB).toBeGreaterThanOrEqual(0);
      expect(v.usedGiB).toBeLessThanOrEqual(v.sizeGiB);
    }
  });
});

describe("filter / sort / paginate", () => {
  it("combines search, status and protocol filters", () => {
    const rows = filterVolumes(data, { search: "BACKUP", statuses: ["online"], protocol: "NFS" });
    expect(rows.length).toBeGreaterThan(0);
    rows.forEach((v) => {
      expect(v.name).toContain("backup");
      expect(v.status).toBe("online");
      expect(v.protocol).toBe("NFS");
    });
  });

  it("sorts by usage ratio descending and is stable on ties", () => {
    const rows = sortVolumes(data, { key: "used", dir: "desc" });
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].usedGiB / rows[i - 1].sizeGiB).toBeGreaterThanOrEqual(rows[i].usedGiB / rows[i].sizeGiB);
    }
  });

  it("sorts names naturally (vol-2 before vol-10)", () => {
    const vs = [data[0], data[1]].map((v, i) => ({ ...v, name: i ? "vol-2" : "vol-10" }));
    expect(sortVolumes(vs, { key: "name", dir: "asc" }).map((v) => v.name)).toEqual(["vol-2", "vol-10"]);
  });

  it("clamps the page when filters shrink the result", () => {
    const r = paginate([1, 2, 3], 9, 2);
    expect(r).toMatchObject({ page: 2, pageCount: 2, rows: [3], total: 3 });
    expect(paginate([], 3, 25)).toMatchObject({ page: 1, pageCount: 1, rows: [] });
  });

  it("applies the whole query", () => {
    const r = applyQuery(data, { ...DEFAULT_QUERY, pageSize: 10 });
    expect(r.rows).toHaveLength(10);
    expect(r.total).toBe(500);
  });

  it("formats capacity in binary units", () => {
    expect(formatCapacity(512)).toBe("512 GiB");
    expect(formatCapacity(1536)).toBe("1.5 TiB");
    expect(formatCapacity(102400)).toBe("100 TiB");
  });
});

describe("create-volume validation", () => {
  const ok: VolumeForm = { name: "analytics-prod", cluster: "cluster-tlv-01", protocol: "NFS", size: "500", unit: "GiB" };
  const none = () => false;

  it("accepts a valid form", () => {
    expect(validateVolumeForm(ok, none)).toEqual({});
  });

  it.each([
    ["", "Enter a volume name."],
    ["1abc", "Start the name with a lowercase letter."],
    ["Bad_Name", "Start the name with a lowercase letter."],
    ["bad_name", "Use only lowercase letters, numbers and hyphens."],
    ["trailing-", "The name can't end with a hyphen."],
  ])("rejects the name %j", (name, msg) => {
    expect(validateVolumeForm({ ...ok, name }, none).name).toBe(msg);
  });

  it("reports a taken name", () => {
    expect(validateVolumeForm(ok, () => true).name).toMatch(/already taken/);
  });

  it("checks size limits in the unit the user chose", () => {
    expect(validateVolumeForm({ ...ok, size: "10" }, none).size).toBe("The minimum size is 20 GiB.");
    expect(validateVolumeForm({ ...ok, size: "101", unit: "TiB" }, none).size).toBe("The maximum size is 100 TiB.");
    expect(validateVolumeForm({ ...ok, size: "0.01", unit: "TiB" }, none).size).toBe("The minimum size is 0.02 TiB.");
    expect(validateVolumeForm({ ...ok, size: "1.5", unit: "TiB" }, none).size).toBeUndefined();
    expect(validateVolumeForm({ ...ok, size: "20.5" }, none).size).toMatch(/whole GiB/);
    expect(validateVolumeForm({ ...ok, size: "abc" }, none).size).toMatch(/as a number/);
  });

  it("requires cluster and protocol", () => {
    const e = validateVolumeForm({ ...ok, cluster: "", protocol: "" }, none);
    expect(e.cluster).toBeDefined();
    expect(e.protocol).toBeDefined();
  });
});
