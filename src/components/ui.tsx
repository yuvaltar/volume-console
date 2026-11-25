/* Small design-system layer: every screen is built from these, and they only read design tokens (CSS variables). */
import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { VolumeStatus } from "../api/types";

type Variant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  loading = false,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button
      className={`btn btn-${variant}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className="spinner" aria-hidden="true" />}
      {children}
    </button>
  );
}

const STATUS_LABEL: Record<VolumeStatus, string> = {
  online: "Online",
  degraded: "Degraded",
  offline: "Offline",
  provisioning: "Provisioning",
};

/** Status is never conveyed by colour alone: each badge has an icon shape and a text label. */
export function StatusBadge({ status }: { status: VolumeStatus }) {
  const icon = { online: "●", degraded: "▲", offline: "■", provisioning: "◌" }[status];
  return (
    <span className={`badge badge-${status}`}>
      <span aria-hidden="true">{icon}</span> {STATUS_LABEL[status]}
    </span>
  );
}

export function CapacityBar({ used, size, label }: { used: number; size: number; label: string }) {
  const pct = size === 0 ? 0 : Math.round((used / size) * 100);
  const level = pct >= 90 ? "critical" : pct >= 75 ? "warning" : "ok";
  return (
    <div className="capacity">
      <div
        className="capacity-track"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={`${label}: ${pct}% used`}
      >
        <div className={`capacity-fill capacity-${level}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="capacity-pct">{pct}%</span>
    </div>
  );
}

export function StatePanel({
  title,
  children,
  action,
  tone = "neutral",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  return (
    <div className={`state-panel state-${tone}`} role={tone === "error" ? "alert" : undefined}>
      <div className="state-icon" aria-hidden="true">
        {tone === "error" ? "!" : "∅"}
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** Native <dialog>: focus trapping, Esc and the backdrop come from the browser; we return focus on close. */
export function Dialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      const opener = document.activeElement as HTMLElement | null;
      d.showModal();
      return () => opener?.focus();
    }
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} onClose={onClose}>
      <header className="dialog-header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </header>
      {open && children}
    </dialog>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: (props: { id: string; "aria-invalid"?: true; "aria-describedby"?: string }) => ReactNode;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = error ? errId : hint ? hintId : undefined;
  return (
    <div className={`field${error ? " field-invalid" : ""}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy })}
      {hint && !error && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errId}>
          {error}
        </p>
      )}
    </div>
  );
}
