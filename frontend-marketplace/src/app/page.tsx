"use client";
import React, { useState, useEffect, useRef } from "react";
import FiltersSidebar from "@/components/FiltersSidebar";
import SortingBar from "@/components/SortingBar";
import ProductGrid from "@/components/ProductGrid";
import Breadcrumb from "@/components/Breadcrumb";
import {
  Truck,
  Leaf,
  Star,
  ShieldCheck,
  ArrowDown,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

const DEFAULT_MIN_PRICE = 0;
const DEFAULT_MAX_PRICE = 100;

const trustFeatures = [
  {
    icon: Truck,
    title: "UK-Wide Delivery",
    description: "Royal Mail & courier delivery to your door",
  },
  {
    icon: Leaf,
    title: "Authentic & Fresh",
    description: "Genuine Eastern European recipes and ingredients",
  },
  {
    icon: Star,
    title: "Handpicked Quality",
    description: "Every product carefully selected for flavour",
  },
  {
    icon: ShieldCheck,
    title: "Safe & Trusted",
    description: "Chilled packaging for perishable items",
  },
];

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    categories: [],
    price: [DEFAULT_MIN_PRICE, DEFAULT_MAX_PRICE],
    inStock: false,
  });
  const [sort, setSort] = useState("name_asc");
  const [search, setSearch] = useState("");
  const shopRef = useRef<HTMLDivElement>(null);

  const hasActiveFilters =
    filters.categories.length > 0 ||
    filters.price[0] > DEFAULT_MIN_PRICE ||
    filters.price[1] < DEFAULT_MAX_PRICE ||
    filters.inStock ||
    search.length > 0;

  useEffect(() => {
    function handleGlobalSearch(e: CustomEvent<string>) {
      if (e.detail !== undefined) setSearch(e.detail);
    }
    function handleClearFilters() {
      setFilters({
        categories: [],
        price: [DEFAULT_MIN_PRICE, DEFAULT_MAX_PRICE],
        inStock: false,
      });
      setSearch("");
    }

    window.addEventListener(
      "product-search",
      handleGlobalSearch as EventListener
    );
    window.addEventListener(
      "clear-filters",
      handleClearFilters as EventListener
    );

    return () => {
      window.removeEventListener(
        "product-search",
        handleGlobalSearch as EventListener
      );
      window.removeEventListener(
        "clear-filters",
        handleClearFilters as EventListener
      );
    };
  }, []);

  function scrollToShop() {
    shopRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div style={{ background: "var(--background)" }}>
      {/* ── Hero Section ─────────────────────────────────────── */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(135deg, var(--sidebar-bg) 0%, var(--background) 60%, var(--sidebar-bg) 100%)",
          borderBottom: "1px solid var(--sidebar-border)",
        }}
      >
        {/* Decorative background circles */}
        <div
          className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10 pointer-events-none"
          style={{ background: "var(--accent)" }}
        />
        <div
          className="absolute -bottom-16 -left-16 w-64 h-64 rounded-full opacity-10 pointer-events-none"
          style={{ background: "var(--primary)" }}
        />

        <div
          className="relative max-w-7xl mx-auto py-14 md:py-20 lg:py-24"
          style={{
            paddingLeft: "max(1rem, calc(var(--sidebar-width) + 2rem))",
            paddingRight: "1rem",
          }}
        >
          <div className="max-w-2xl">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5 border"
              style={{
                background: "var(--success-bg)",
                borderColor: "var(--success-border)",
                color: "var(--success-text)",
              }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              Authentic Eastern European Foods
            </div>

            {/* Headline */}
            <h1
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold leading-tight tracking-tight mb-4"
              style={{ color: "var(--foreground)" }}
            >
              Taste the{" "}
              <span
                className="relative inline-block"
                style={{ color: "var(--accent)" }}
              >
                Tradition
              </span>
              <br />
              <span className="text-3xl sm:text-4xl lg:text-5xl font-bold opacity-80">
                Delivered to Your Door
              </span>
            </h1>

            {/* Subtext */}
            <p
              className="text-base sm:text-lg mb-8 leading-relaxed max-w-lg"
              style={{ color: "var(--muted-foreground)" }}
            >
              Shop premium Eastern European sausages, dairy, pastries and
              more — crafted with tradition, delivered fresh across the UK.
            </p>

            {/* CTA buttons */}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={scrollToShop}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm shadow-md transition-all duration-200 hover:opacity-90 hover:shadow-lg active:scale-[0.98]"
                style={{
                  background: "var(--primary)",
                  color: "white",
                }}
              >
                Shop Now
                <ChevronRight className="w-4 h-4" />
              </button>
              <Link
                href="/about"
                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm border transition-all duration-200 hover:opacity-80"
                style={{
                  borderColor: "var(--sidebar-border)",
                  color: "var(--foreground)",
                  background: "var(--card-bg)",
                }}
              >
                Our Story
              </Link>
            </div>
          </div>
        </div>

        {/* Trust features bar */}
        <div
          className="border-t"
          style={{ borderColor: "var(--sidebar-border)" }}
        >
          <div
            className="max-w-7xl mx-auto"
            style={{
              paddingLeft: "max(1rem, calc(var(--sidebar-width) + 2rem))",
              paddingRight: "1rem",
            }}
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-0 divide-x divide-y md:divide-y-0"
              style={{ borderColor: "var(--sidebar-border)" }}
            >
              {trustFeatures.map(({ icon: Icon, title, description }) => (
                <div key={title} className="flex items-center gap-3 px-4 py-4 md:py-5">
                  <div
                    className="flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: "var(--sidebar-bg)" }}
                  >
                    <Icon className="w-5 h-5" style={{ color: "var(--accent)" }} />
                  </div>
                  <div>
                    <p
                      className="text-xs font-semibold leading-tight"
                      style={{ color: "var(--foreground)" }}
                    >
                      {title}
                    </p>
                    <p
                      className="text-xs leading-tight mt-0.5 hidden sm:block"
                      style={{ color: "var(--muted-foreground)" }}
                    >
                      {description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <button
          onClick={scrollToShop}
          className="hidden md:flex absolute bottom-4 right-8 flex-col items-center gap-1 text-xs font-medium transition-opacity hover:opacity-70"
          style={{ color: "var(--muted-foreground)" }}
          aria-label="Scroll to shop"
        >
          <ArrowDown className="w-4 h-4 animate-bounce" />
          <span>Browse</span>
        </button>
      </section>

      {/* ── Shop Section ─────────────────────────────────────── */}
      <div
        ref={shopRef}
        className="flex flex-col md:flex-row md:items-start md:justify-center min-h-[60vh] p-2 sm:p-4 md:p-6 md:ml-4"
      >
        <FiltersSidebar filters={filters} setFilters={setFilters} />
        <section className="flex-1 w-full ml-0 content-offset-md">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Shop" }]}
          />
          <div className="flex items-center justify-between mb-4">
            <h2
              className="text-2xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {hasActiveFilters ? "Search Results" : "All Products"}
            </h2>
            {hasActiveFilters && (
              <button
                className="text-sm font-medium transition-opacity hover:opacity-70"
                style={{ color: "var(--accent)" }}
                onClick={() => {
                  setFilters({
                    categories: [],
                    price: [DEFAULT_MIN_PRICE, DEFAULT_MAX_PRICE],
                    inStock: false,
                  });
                  setSearch("");
                  window.dispatchEvent(new CustomEvent("clear-filters"));
                }}
              >
                Clear filters
              </button>
            )}
          </div>
          <SortingBar
            sort={sort}
            setSort={setSort}
            search={search}
            setSearch={setSearch}
          />
          <ProductGrid filters={filters} sort={sort} search={search} />
        </section>
      </div>
    </div>
  );
}
