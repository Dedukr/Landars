import React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

type ShelfSectionProps = {
  title: string;
  subtitle?: string;
  /** Background style: "default" = var(--background), "subtle" = var(--sidebar-bg) */
  background?: "default" | "subtle";
  /** Optional "See all" link on the right side of the header. */
  seeAllHref?: string;
  seeAllLabel?: string;
  className?: string;
  children: React.ReactNode;
};

export default function ShelfSection({
  title,
  subtitle,
  background = "default",
  seeAllHref = "/shop",
  seeAllLabel = "See all",
  className = "",
  children,
}: ShelfSectionProps) {
  const bg =
    background === "subtle" ? "var(--sidebar-bg)" : "var(--background)";

  return (
    <section
      className={`py-16 md:py-20 ${className}`}
      style={{
        background: bg,
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between mb-8">
          <div>
            {subtitle ? (
              <p
                className="text-xs font-semibold uppercase tracking-widest mb-1"
                style={{ color: "var(--accent)" }}
              >
                {subtitle}
              </p>
            ) : null}
            <h2
              className="text-3xl sm:text-4xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {title}
            </h2>
          </div>
          {seeAllHref ? (
            <Link
              href={seeAllHref}
              className="hidden sm:inline-flex items-center gap-1.5 text-sm font-medium transition-opacity hover:opacity-70"
              style={{ color: "var(--accent)" }}
            >
              {seeAllLabel}
              <ChevronRight className="w-4 h-4" />
            </Link>
          ) : null}
        </div>

        {children}
      </div>
    </section>
  );
}

