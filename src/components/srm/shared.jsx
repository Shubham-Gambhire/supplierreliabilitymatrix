import React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { C } from "./tokens.js";

export const RISK_META = {
  "Low Risk": { color: C.low, dim: C.lowDim, code: "LOW" },
  "Medium Risk": { color: C.medium, dim: C.mediumDim, code: "MEDIUM" },
  "High Risk": { color: C.high, dim: C.highDim, code: "HIGH" },
  "Critical Risk": { color: C.critical, dim: C.criticalDim, code: "CRITICAL" },
  "Insufficient Data": { color: C.insufficient, dim: C.insufficientDim, code: "INSUFFICIENT DATA" },
  "Invalid Data": { color: C.critical, dim: C.criticalDim, code: "INVALID DATA" },
};
export const TIER_ORDER = [
  "Low Risk",
  "Medium Risk",
  "High Risk",
  "Critical Risk",
  "Insufficient Data",
  "Invalid Data",
];

const CATEGORICAL_PALETTE = [
  "#2C5AA0",
  "#5B4B8A",
  "#1F6F72",
  "#46586B",
  "#6B4A2E",
  "#38477A",
  "#8A5A2E",
  "#3D6B7A",
];
/** Safe Map-based color map (category names like "__proto__" are fine). */
export function buildColorMap(values) {
  const unique = Array.from(new Set(values.filter(Boolean))).sort();
  const map = new Map();
  unique.forEach((v, i) => map.set(v, CATEGORICAL_PALETTE[i % CATEGORICAL_PALETTE.length]));
  return map;
}
export function deriveRegion(location) {
  if (!location || typeof location !== "string") return "Unspecified";
  const parts = location
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return parts[parts.length - 1] || "Unspecified";
}
export function formatCurrency(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return "N/A";
  if (n >= 1000000) return `$${+(n / 1000000).toFixed(2)}M`;
  if (n >= 1000) return `$${Math.round(n / 1000)}k`;
  return `$${Math.round(n)}`;
}
export const pct = (r) =>
  typeof r === "number" && Number.isFinite(r) ? `${Math.round(r * 100)}%` : "N/A";

export function Stamp({ tier, size = "sm" }) {
  const m = RISK_META[tier] || RISK_META["Insufficient Data"];
  const big = size === "lg";
  return (
    <span
      className="stamp"
      style={{
        color: m.color,
        borderColor: m.color,
        fontSize: big ? 15 : 11,
        padding: big ? "6px 14px" : "2px 8px",
        borderStyle: tier === "Invalid Data" ? "dashed" : "solid",
      }}
    >
      {m.code}
    </span>
  );
}

export function HeroStat({ label, value, sub, color }) {
  return (
    <div className="hero-stat">
      <div className="hero-stat-label">{label}</div>
      <div className="hero-stat-value" style={{ color: color || C.ink }}>
        {value}
      </div>
      {sub && <div className="hero-stat-sub">{sub}</div>}
    </div>
  );
}

export function StatStrip({ items }) {
  return (
    <div className="stat-strip">
      {items.map((it, i) => (
        <span className="stat-strip-item" key={it.label}>
          {i > 0 && (
            <span className="stat-strip-sep" aria-hidden="true">
              &middot;
            </span>
          )}
          <span className="stat-strip-label">{it.label}</span>
          <span className="stat-strip-value" style={it.color ? { color: it.color } : undefined}>
            {it.value}
          </span>
        </span>
      ))}
    </div>
  );
}

export function InfoTip({ text }) {
  return (
    <span className="info-tip" tabIndex={0} role="note" aria-label={text}>
      <span aria-hidden="true">?</span>
      <span className="info-tip-bubble" aria-hidden="true">
        {text}
      </span>
    </span>
  );
}

/** Accessible modal on Radix Dialog: focus trap, initial focus, focus restore, inert background, scroll lock. */
export function Modal({ open, onClose, title, children }) {
  const returnRef = React.useRef(null);
  if (open && !returnRef.current && typeof document !== "undefined")
    returnRef.current = document.activeElement;
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="modal-backdrop">
          <Dialog.Content
            className="modal-panel ledger-dialog"
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              const el = returnRef.current;
              returnRef.current = null;
              if (el && typeof el.focus === "function") {
                e.preventDefault();
                el.focus();
              }
            }}
          >
            <div className="modal-head">
              <Dialog.Title asChild>
                <h2>{title}</h2>
              </Dialog.Title>
              <Dialog.Close className="modal-close" aria-label="Close">
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="modal-body">{children}</div>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/**
 * Numeric input that never coerces: a cleared field reports "" (which the
 * validator treats as invalid, never as zero).
 */
export function NumInput({
  value,
  onChange,
  label,
  step = 1,
  width = 72,
  invalid,
  describedBy,
  min,
  max,
  className,
}) {
  const shown =
    value === "" ||
    value === null ||
    value === undefined ||
    (typeof value === "number" && !Number.isFinite(value))
      ? ""
      : value;
  return (
    <input
      type="number"
      inputMode="decimal"
      value={shown}
      step={step}
      min={min}
      max={max}
      aria-label={label}
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      onChange={(e) => {
        const raw = e.target.value;
        onChange(raw === "" ? "" : Number(raw));
      }}
      className={`field-num ${invalid ? "field-invalid" : ""} ${className || ""}`}
      style={{ width }}
    />
  );
}

export function downloadText(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
