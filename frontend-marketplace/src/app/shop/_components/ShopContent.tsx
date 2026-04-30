"use client";
import React, { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import FiltersSidebar from "@/components/FiltersSidebar";
import SortingBar from "@/components/SortingBar";
import ProductGrid from "@/components/ProductGrid";
import Breadcrumb from "@/components/Breadcrumb";

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

const DEFAULT_MIN_PRICE = 0;
const DEFAULT_MAX_PRICE = 100;

export default function ShopContent() {
  const searchParams = useSearchParams();

  const rawCategory = searchParams.get("category");
  const rawSearch = searchParams.get("q") || "";

  const [filters, setFilters] = useState<Filters>({
    categories: rawCategory ? [parseInt(rawCategory, 10)] : [],
    price: [DEFAULT_MIN_PRICE, DEFAULT_MAX_PRICE],
    inStock: false,
  });
  const [sort, setSort] = useState("name_asc");
  const [search, setSearch] = useState(rawSearch);

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

    window.addEventListener("product-search", handleGlobalSearch as EventListener);
    window.addEventListener("clear-filters", handleClearFilters as EventListener);

    return () => {
      window.removeEventListener("product-search", handleGlobalSearch as EventListener);
      window.removeEventListener("clear-filters", handleClearFilters as EventListener);
    };
  }, []);

  return (
    <div style={{ background: "var(--background)" }}>
      <div className="flex flex-col md:flex-row md:items-start md:justify-center min-h-[60vh] p-2 sm:p-4 md:p-6 md:ml-4">
        <FiltersSidebar filters={filters} setFilters={setFilters} />

        <section className="flex-1 w-full ml-0 content-offset-md">
          <Breadcrumb
            items={[{ label: "Home", href: "/" }, { label: "Shop" }]}
          />
          <div className="flex items-center justify-between mb-4">
            <h1
              className="text-2xl font-bold"
              style={{ color: "var(--foreground)" }}
            >
              {hasActiveFilters ? "Search Results" : "All Products"}
            </h1>
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
