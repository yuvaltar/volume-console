import { useRef, useState, type FormEvent } from "react";
import { ApiError, type MockApi } from "../api/mockApi";
import { CLUSTERS, PROTOCOLS, type Protocol, type Volume } from "../api/types";
import { formatCapacity } from "../lib/query";
import {
  MAX_SIZE_GIB,
  MIN_SIZE_GIB,
  NAME_MAX,
  toGiB,
  validateVolumeForm,
  type FormErrors,
  type VolumeForm,
} from "../lib/validation";
import { Button, Dialog, Field } from "./ui";

const EMPTY: VolumeForm = { name: "", cluster: "", protocol: "", size: "", unit: "GiB" };

export function CreateVolumeDialog({
  open,
  onClose,
  onCreated,
  api,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (v: Volume) => void;
  api: MockApi;
}) {
  const [form, setForm] = useState<VolumeForm>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const close = () => {
    setForm(EMPTY);
    setErrors({});
    setSubmitted(false);
    setServerError(null);
    onClose();
  };

  // Validate on every change only after the first submit attempt: no red errors while the user is still typing.
  const update = <K extends keyof VolumeForm>(key: K, value: VolumeForm[K]) => {
    const next = { ...form, [key]: value };
    setForm(next);
    if (submitted) setErrors(validateVolumeForm(next, api.nameExists));
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    setServerError(null);
    const errs = validateVolumeForm(form, api.nameExists);
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      // Move focus to the first invalid field so keyboard and screen-reader users land on the problem.
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus());
      return;
    }
    setSaving(true);
    try {
      const vol = await api.createVolume({
        name: form.name.trim(),
        cluster: form.cluster,
        protocol: form.protocol as Protocol,
        sizeGiB: Math.round(toGiB(Number(form.size), form.unit)),
      });
      onCreated(vol);
      close();
    } catch (err) {
      // Keep everything the user typed; only explain what happened and let them retry.
      setServerError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const sizeNum = Number(form.size);
  const preview =
    form.size.trim() !== "" && Number.isFinite(sizeNum) && sizeNum > 0 && !errors.size
      ? `Will be provisioned as ${formatCapacity(Math.round(toGiB(sizeNum, form.unit)))}.`
      : `Between ${MIN_SIZE_GIB} GiB and ${formatCapacity(MAX_SIZE_GIB)}.`;

  return (
    <Dialog open={open} title="Create volume" onClose={close}>
      <form ref={formRef} className="form" noValidate onSubmit={submit}>
        {serverError && (
          <div className="banner banner-error" role="alert">
            <strong>Couldn't create the volume.</strong> {serverError}
          </div>
        )}
        <Field label="Name" error={errors.name} hint={`Lowercase letters, numbers and hyphens, up to ${NAME_MAX} characters.`}>
          {(p) => (
            <input
              {...p}
              value={form.name}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. analytics-prod"
              onChange={(e) => update("name", e.target.value)}
            />
          )}
        </Field>
        <div className="form-row">
          <Field label="Cluster" error={errors.cluster}>
            {(p) => (
              <select {...p} value={form.cluster} onChange={(e) => update("cluster", e.target.value)}>
                <option value="">Select…</option>
                {CLUSTERS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
          <Field label="Protocol" error={errors.protocol}>
            {(p) => (
              <select {...p} value={form.protocol} onChange={(e) => update("protocol", e.target.value as Protocol | "")}>
                <option value="">Select…</option>
                {PROTOCOLS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <Field label="Size" error={errors.size} hint={preview}>
          {(p) => (
            <div className="input-group">
              <input
                {...p}
                inputMode="decimal"
                value={form.size}
                placeholder="500"
                onChange={(e) => update("size", e.target.value)}
              />
              <select
                aria-label="Size unit"
                value={form.unit}
                onChange={(e) => update("unit", e.target.value as VolumeForm["unit"])}
              >
                <option>GiB</option>
                <option>TiB</option>
              </select>
            </div>
          )}
        </Field>
        <footer className="dialog-footer">
          <Button type="button" variant="ghost" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={saving}>
            {saving ? "Creating…" : "Create volume"}
          </Button>
        </footer>
      </form>
    </Dialog>
  );
}
