"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Search, ChevronRight, Truck, Leaf, Star, ShieldCheck, Award } from "lucide-react";
import HeroProductPreview from "./HeroProductPreview";
import { FoodHygieneRating } from "@/components/FoodHygieneRating";

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
            <div className="mb-5 sm:mb-6 flex flex-wrap items-center gap-2">
              <div
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border"
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

              {/* Desktop-only: show experience next to the badge */}
              <span
                className="hidden lg:inline-flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold"
                style={{
                  background: "var(--success-bg)",
                  borderColor: "var(--success-border)",
                  color: "var(--success-text)",
                }}
              >
                <Award className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                Four years of experience
              </span>
            </div>

            {/* Headline + logo */}
            <div className="flex items-center justify-between gap-4 sm:gap-6 mb-4 sm:mb-5 min-w-0">
              <h1
                className="min-w-0 flex-1 text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-[1.1] tracking-tight"
                style={{ color: "var(--foreground)" }}
              >
                Discover the{" "}
                <span style={{ color: "var(--accent)" }}>Flavours</span>
                <br />
                <span className="text-3xl sm:text-4xl lg:text-5xl font-bold opacity-75">
                  of Eastern Europe
                </span>
              </h1>
              <Image
                src="/landars_food_logo.svg"
                alt=""
                width={320}
                height={320}
                priority
                aria-hidden
                className="shrink-0 w-auto object-contain h-[6.25rem] sm:h-[8rem] lg:h-[10rem]"
              />
            </div>

            {/* Subtitle */}
            <div className="mb-7 sm:mb-8 max-w-2xl flex flex-col gap-4">
              <p
                className="block w-full text-base sm:text-lg font-semibold leading-snug"
                style={{ color: "var(--foreground)" }}
              >
                Homemade Food &amp; Catering Delivered Across England
              </p>
              <p
                className="block w-full text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                Homemade semi-prepared products, ready meals, sausages and meat products, fresh bakery items, and desserts.
              </p>
              <p
                className="block w-full text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                Catering services for private and corporate events.
              </p>
              <p
                className="block w-full text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                Own delivery across England.
              </p>
              <p
                className="block w-full text-base sm:text-lg leading-relaxed"
                style={{ color: "var(--muted-foreground)" }}
              >
                Ukrainian, Slavic, European cuisine
              </p>
              <div className="flex w-full max-w-2xl flex-col items-center gap-2 pt-1 text-center lg:flex-row lg:items-center lg:justify-between lg:gap-3 lg:text-left">
                <div className="order-2 min-w-0 w-full max-w-[18rem] sm:max-w-[20rem] lg:order-1 lg:w-auto lg:flex-none lg:max-w-[9.5rem] xl:max-w-[11rem]">
                  <FoodHygieneRating fluid />
                </div>
                <span
                  className="order-1 inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-sm font-bold lg:order-2 lg:hidden"
                  style={{
                    background: "var(--success-bg)",
                    borderColor: "var(--success-border)",
                    color: "var(--success-text)",
                  }}
                >
                  <Award className="h-4 w-4 shrink-0" strokeWidth={2.25} aria-hidden />
                  Four years of experience
                </span>
              </div>
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
