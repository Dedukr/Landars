"use client";

import { useId, type ReactNode } from "react";
import { AlertTriangle, Info, Leaf, Package } from "lucide-react";
import type { ProductDetail } from "./types";

function hasNutrition(n?: ProductDetail["nutrition_info"]) {
  if (!n) return false;
  return [n.calories, n.protein, n.carbs, n.fat].some(
    (v) => v !== undefined && v !== null && Number(v) > 0
  );
}

function AccordionSection({
  title,
  icon,
  children,
  defaultOpen,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <details
      className="group border-b last:border-b-0"
      style={{ borderColor: "var(--sidebar-border)" }}
      open={defaultOpen}
    >
      <summary
        className="flex cursor-pointer list-none items-center gap-3 py-3.5 pr-1 text-left font-medium outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 rounded-md [&::-webkit-details-marker]:hidden"
        style={{ color: "var(--foreground)" }}
        aria-controls={id}
      >
        <span className="shrink-0 opacity-80" aria-hidden>
          {icon}
        </span>
        <span className="flex-1 min-w-0">{title}</span>
        <span
          className="shrink-0 text-lg leading-none transition-transform group-open:rotate-180"
          style={{ color: "var(--muted-foreground)" }}
          aria-hidden
        >
          ▼
        </span>
      </summary>
      <div id={id} className="pb-4 pl-9 pr-1 text-sm leading-relaxed" style={{ color: "var(--muted-foreground)" }}>
        {children}
      </div>
    </details>
  );
}

export default function ProductDetailsAccordion({ product }: { product: ProductDetail }) {
  const specs = product.specifications;
  const specEntries = specs ? Object.entries(specs).filter(([, v]) => v != null && String(v).trim() !== "") : [];
  const ingredients = product.ingredients?.filter((s) => s && String(s).trim());
  const allergens = product.allergens?.filter((s) => s && String(s).trim());
  const showNutrition = hasNutrition(product.nutrition_info);
  const showStorage = Boolean(
    (product.storage_instructions && product.storage_instructions.trim()) ||
      (product.shelf_life && product.shelf_life.trim())
  );

  if (
    specEntries.length === 0 &&
    !showNutrition &&
    (!ingredients || ingredients.length === 0) &&
    (!allergens || allergens.length === 0) &&
    !showStorage
  ) {
    return null;
  }

  return (
    <section
      className="rounded-2xl border overflow-hidden shadow-sm"
      style={{
        background: "var(--card-bg)",
        borderColor: "var(--sidebar-border)",
        boxShadow: "var(--card-shadow)",
      }}
      aria-labelledby="product-details-heading"
    >
      <div className="px-4 sm:px-5 pt-4 pb-1">
        <h2 id="product-details-heading" className="text-lg font-semibold" style={{ color: "var(--foreground)" }}>
          Product details
        </h2>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--muted-foreground)" }}>
          Tap a section to expand
        </p>
      </div>
      <div className="px-2 sm:px-3 pb-2">
        {specEntries.length > 0 && (
          <AccordionSection title="Specifications" icon={<Package className="h-4 w-4" />} defaultOpen>
            <dl className="space-y-2">
              {specEntries.map(([key, value]) => (
                <div key={key} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 sm:gap-4">
                  <dt className="font-medium capitalize shrink-0" style={{ color: "var(--foreground)" }}>
                    {key.replace(/_/g, " ")}
                  </dt>
                  <dd className="sm:text-right">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </AccordionSection>
        )}

        {showNutrition && product.nutrition_info && (
          <AccordionSection title="Nutrition" icon={<Info className="h-4 w-4" />}>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                ["Calories", product.nutrition_info.calories, ""],
                ["Protein", product.nutrition_info.protein, "g"],
                ["Carbs", product.nutrition_info.carbs, "g"],
                ["Fat", product.nutrition_info.fat, "g"],
              ].map(([label, val, suffix]) =>
                val != null && Number(val) > 0 ? (
                  <div
                    key={String(label)}
                    className="rounded-lg px-3 py-2 text-center"
                    style={{
                      background: "var(--sidebar-bg)",
                      border: "1px solid var(--sidebar-border)",
                    }}
                  >
                    <div className="text-lg font-bold tabular-nums" style={{ color: "var(--accent)" }}>
                      {val}
                      {suffix}
                    </div>
                    <div className="text-xs" style={{ color: "var(--muted-foreground)" }}>
                      {label}
                    </div>
                  </div>
                ) : null
              )}
            </div>
            {ingredients && ingredients.length > 0 && (
              <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--sidebar-border)" }}>
                <p className="font-medium text-foreground mb-1" style={{ color: "var(--foreground)" }}>
                  Ingredients
                </p>
                <p>{ingredients.join(", ")}</p>
              </div>
            )}
          </AccordionSection>
        )}

        {!showNutrition && ingredients && ingredients.length > 0 && (
          <AccordionSection title="Ingredients" icon={<Leaf className="h-4 w-4" />}>
            <p>{ingredients.join(", ")}</p>
          </AccordionSection>
        )}

        {allergens && allergens.length > 0 && (
          <AccordionSection title="Allergens" icon={<AlertTriangle className="h-4 w-4" />}>
            <p className="mb-2" style={{ color: "var(--foreground)" }}>
              Contains or may contain:
            </p>
            <ul className="flex flex-wrap gap-2">
              {allergens.map((a) => (
                <li
                  key={a}
                  className="rounded-full px-3 py-1 text-xs font-medium"
                  style={{
                    background: "var(--destructive)",
                    color: "white",
                  }}
                >
                  {a}
                </li>
              ))}
            </ul>
          </AccordionSection>
        )}

        {showStorage && (
          <AccordionSection title="Storage & shelf life" icon={<Package className="h-4 w-4" />}>
            {product.storage_instructions?.trim() && (
              <p className="mb-3">{product.storage_instructions}</p>
            )}
            {product.shelf_life?.trim() && (
              <p>
                <span className="font-medium" style={{ color: "var(--foreground)" }}>
                  Shelf life:{" "}
                </span>
                {product.shelf_life}
              </p>
            )}
          </AccordionSection>
        )}
      </div>
    </section>
  );
}
