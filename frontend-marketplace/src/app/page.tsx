"use client";
import React, { useState, useEffect } from "react";
import FiltersSidebar from "@/components/FiltersSidebar";
import SortingBar from "@/components/SortingBar";
import ProductGrid from "@/components/ProductGrid";

interface Filters {
  categories: number[];
  price: [number, number];
  inStock: boolean;
}

const DEFAULT_MIN_PRICE = 0;
const DEFAULT_MAX_PRICE = 100;

export default function Home() {
  const [filters, setFilters] = useState<Filters>({
    categories: [],
    price: [DEFAULT_MIN_PRICE, DEFAULT_MAX_PRICE],
    inStock: false,
  });
  const [sort, setSort] = useState("name_asc");
  const [search, setSearch] = useState("");

  useEffect(() => {
    function handleGlobalSearch(e: CustomEvent<string>) {
      if (e.detail !== undefined) setSearch(e.detail);
    }
    window.addEventListener(
      "product-search",
      handleGlobalSearch as EventListener
    );
    return () =>
      window.removeEventListener(
        "product-search",
        handleGlobalSearch as EventListener
      );
  }, []);

  return (
    <main className="flex flex-col md:flex-row md:items-start md:justify-center min-h-screen p-2 sm:p-4 md:p-6 md:ml-4">
      <FiltersSidebar filters={filters} setFilters={setFilters} />
      <section className="flex-1 w-full ml-0 content-offset-md">
        <h1 className="text-3xl font-bold mb-8 tablet-title-margin large-tablet-title-margin">
          Welcome to the Food Marketplace
        </h1>
        {/* Search bar removed from here */}
        <SortingBar
          sort={sort}
          setSort={setSort}
          search={search}
          setSearch={setSearch}
        />
        <ProductGrid filters={filters} sort={sort} search={search} />
      </section>
    </main>
  );
}
