import { CheckCircle2 } from "lucide-react";

const ITEMS = [
  "Simple ordering process",
  "Clear product information",
  "Fresh selection",
  "Easy to browse",
] as const;

export default function ProductTrustStrip() {
  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{
        background: "var(--sidebar-bg)",
        borderColor: "var(--sidebar-border)",
      }}
    >
      <p
        className="text-xs font-semibold uppercase tracking-wider mb-3"
        style={{ color: "var(--muted-foreground)" }}
      >
        Why shop with us
      </p>
      <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {ITEMS.map((label) => (
          <li key={label} className="flex items-start gap-2 text-sm">
            <CheckCircle2
              className="h-4 w-4 shrink-0 mt-0.5"
              style={{ color: "var(--success)" }}
              aria-hidden
            />
            <span style={{ color: "var(--foreground)" }}>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
