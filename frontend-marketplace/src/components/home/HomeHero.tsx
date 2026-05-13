"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Search, ChevronRight, Truck, Leaf, Star, ShieldCheck, Award } from "lucide-react";
import HeroProductPreview from "./HeroProductPreview";

const trustItems = [
  { icon: Truck, label: "UK-Wide Delivery" },
  { icon: Leaf, label: "Freshly Selected" },
  { icon: Star, label: "100+ Products" },
  { icon: ShieldCheck, label: "Trusted by Families" },
];

export default function HomeHero() {
  const router = useRouter();
  const [query, setQuery] = useState("");

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/shop?q=${encodeURIComponent(query.trim())}`);
    } else {
      router.push("/shop");
    }
  }

  return (
    <section
      className="relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background) 55%, var(--sidebar-bg) 100%)",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Decorative circles */}
      <div
        className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full opacity-10 pointer-events-none"
        style={{ background: "var(--accent)" }}
      />
      <div
        className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full opacity-[0.08] pointer-events-none"
        style={{ background: "var(--primary)" }}
      />

      {/* ── Main hero content ─────────────────────────────── */}
      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 md:py-22 lg:py-28">
        {/* Two-column layout: content left, product cards right (desktop) */}
        <div className="flex items-center justify-between gap-10 xl:gap-16">
          {/* Left column */}
          <div className="flex-1 min-w-0">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 sm:mb-6 border"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Authentic Eastern European Foods · Delivered Across the UK
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
            </div>

            {/* Headline */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight mb-4 sm:mb-5"
              style={{ color: "var(--foreground)" }}
            >
              Discover the{" "}
              <span style={{ color: "var(--accent)" }}>Flavours</span>
              <br />
              <span className="text-3xl sm:text-4xl lg:text-5xl font-bold opacity-75">
                of Eastern Europe
              </span>
            </h1>

            {/* Subtitle */}
            <div
              className="text-base sm:text-lg mb-7 sm:mb-8 leading-relaxed max-w-2xl space-y-3"
              style={{ color: "var(--muted-foreground)" }}
            >
              <p>
                Homemade semi-ready products, ready meals, sausages and meat products,
                bakery and desserts. Catering, in-house delivery throughout England.
              </p>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-2">
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold border -translate-y-px"
                  style={{
                    background: "var(--success-bg)",
                    borderColor: "var(--success-border)",
                    color: "var(--success-text)",
                  }}
                >
                  <Award className="w-4 h-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  Four years of experience
                </span>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-bold border -translate-y-px"
                  style={{
                    background: "var(--success-bg)",
                    borderColor: "var(--success-border)",
                    color: "var(--success-text)",
                  }}
                >
                  <ShieldCheck className="w-4 h-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  food hygiene <span className="tabular-nums">5</span>
                  <span aria-hidden>★</span>
                </span>
              </p>
              <p>Ukrainian, Slavic, European cuisine</p>
            </div>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="mb-6 sm:mb-7">
              <div className="flex gap-2 max-w-lg">
                <div className="relative flex-1">
                  <Search
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4"
                    style={{ color: "var(--muted-foreground)" }}
                  />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search sausages, cheese, bread…"
                    className="w-full pl-10 pr-4 py-3 rounded-xl text-sm border outline-none transition-colors"
                    style={{
                      background: "var(--card-bg)",
                      color: "var(--foreground)",
                      borderColor: "var(--sidebar-border)",
                    }}
                    aria-label="Search products"
                  />
                </div>
                <button
                  type="submit"
                  className="px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 hover:opacity-90 shadow-sm flex-shrink-0"
                  style={{ background: "var(--primary)", color: "white" }}
                >
                  Search
                </button>
              </div>
            </form>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3">
              <Link
                href="/shop"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl font-semibold text-sm shadow-md transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-[0.98]"
                style={{ background: "var(--primary)", color: "white" }}
              >
                Browse All Products
                <ChevronRight className="w-4 h-4" />
              </Link>
              <a
                href="#how-it-works"
                className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl font-semibold text-sm border transition-all duration-200 hover:opacity-80"
                style={{
                  borderColor: "var(--sidebar-border)",
                  color: "var(--foreground)",
                  background: "var(--card-bg)",
                }}
              >
                How it works
              </a>
            </div>
          </div>

          {/* Right column — product preview (desktop only, graceful no-op if API down) */}
          <HeroProductPreview />
        </div>
      </div>

      {/* ── Trust bar ─────────────────────────────────────── */}
      <div
        className="border-t"
        style={{ borderColor: "var(--sidebar-border)" }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div
            className="grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0"
            style={{ borderColor: "var(--sidebar-border)" }}
          >
            {trustItems.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-3 px-4 sm:px-5 py-4 md:py-5"
              >
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                  style={{ background: "var(--sidebar-bg)" }}
                >
                  <Icon
                    className="w-5 h-5"
                    style={{ color: "var(--accent)" }}
                  />
                </div>
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--foreground)" }}
                >
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
