import type { Protocol } from "../api/types";

export type SizeUnit = "GiB" | "TiB";

export interface VolumeForm {
  name: string;
  cluster: string;
  protocol: Protocol | "";
  size: string;
  unit: SizeUnit;
}

export type FormErrors = Partial<Record<keyof VolumeForm, string>>;

export const MIN_SIZE_GIB = 20;
export const MAX_SIZE_GIB = 100 * 1024; // 100 TiB
export const NAME_MAX = 40;

export const toGiB = (size: number, unit: SizeUnit) => (unit === "TiB" ? size * 1024 : size);

/**
 * Validates the create-volume form. Messages say what to do, not just what is wrong,
 * and the size limits are expressed in the unit the user picked.
 */
export function validateVolumeForm(form: VolumeForm, nameExists: (name: string) => boolean): FormErrors {
  const errors: FormErrors = {};
  const name = form.name.trim();

  if (name === "") errors.name = "Enter a volume name.";
  else if (name.length > NAME_MAX) errors.name = `Use ${NAME_MAX} characters or fewer (now ${name.length}).`;
  else if (!/^[a-z]/.test(name)) errors.name = "Start the name with a lowercase letter.";
  else if (!/^[a-z0-9-]+$/.test(name)) errors.name = "Use only lowercase letters, numbers and hyphens.";
  else if (name.endsWith("-")) errors.name = "The name can't end with a hyphen.";
  else if (nameExists(name)) errors.name = `"${name}" is already taken. Choose another name.`;

  if (form.cluster === "") errors.cluster = "Choose the cluster that will host the volume.";
  if (form.protocol === "") errors.protocol = "Choose an access protocol.";

  const raw = form.size.trim();
  const size = Number(raw);
  const min = form.unit === "TiB" ? MIN_SIZE_GIB / 1024 : MIN_SIZE_GIB;
  const max = form.unit === "TiB" ? MAX_SIZE_GIB / 1024 : MAX_SIZE_GIB;
  const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  if (raw === "") errors.size = "Enter a size.";
  else if (!Number.isFinite(size)) errors.size = "Enter the size as a number, for example 500.";
  else if (size <= 0) errors.size = "The size must be greater than zero.";
  else if (toGiB(size, form.unit) < MIN_SIZE_GIB) errors.size = `The minimum size is ${fmt(min)} ${form.unit}.`;
  else if (toGiB(size, form.unit) > MAX_SIZE_GIB) errors.size = `The maximum size is ${fmt(max)} ${form.unit}.`;
  else if (form.unit === "GiB" && !Number.isInteger(size)) errors.size = "Use whole GiB, or switch the unit to TiB.";

  return errors;
}
