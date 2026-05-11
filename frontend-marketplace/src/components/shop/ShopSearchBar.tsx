"use client";

import React, { useState, useRef, useId, useCallback } from "react";
import { Search, X } from "lucide-react";
import SortList from "@/components/SortList";
import type { SortOption } from "@/components/SortList";
import { scopeProductsQueryString } from "@/utils/catalogScope";
import { cn } from "@/lib/utils";

interface ProductSearchResponse {
  results: Array<{ id: number; name: string }>;
}

interface ShopSearchBarProps {
  search: string;
  setSearch: (v: string) => void;
  sort: string;
  setSort: (v: string) => void;
  sortOptions: SortOption[];
  mobileFilterSlot?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function ShopSearchBar({
  search,
  setSearch,
  sort,
  setSort,
  sortOptions,
  mobileFilterSlot,
  children,
  className,
}: ShopSearchBarProps) {
  const listboxId = useId();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(-1);
  const comboboxRootRef = useRef<HTMLDivElement>(null);
  const suggestionPickRef = useRef(false);
  const fetchSeqRef = useRef(0);

  const closeSuggestions = useCallback(() => {
    setShowSuggestions(false);
    setActiveSuggestionIndex(-1);
  }, []);

  const applySuggestionAndSearch = useCallback(
    (s: string) => {
      setSearch(s);
      setSuggestions([]);
      closeSuggestions();
      if (typeof window !== "undefined") {
        window.dispatchEvent(new CustomEvent("product-search", { detail: s }));
      }
    },
    [setSearch, closeSuggestions]
  );

  async function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setSearch(value);
    if (value.length > 1) {
      const seq = ++fetchSeqRef.current;
      const qs = scopeProductsQueryString(
        new URLSearchParams({ search: value }).toString()
      );
      const res = await fetch(`/api/products/?${qs}`);
      if (seq !== fetchSeqRef.current) return;
      if (res.ok) {
        const data = (await res.json()) as ProductSearchResponse | Array<{ name: string }>;
        const results = Array.isArray(data) ? data : data.results ?? [];
        const names = results.map((p) => p.name);
        setSuggestions(names);
        setShowSuggestions(true);
        setActiveSuggestionIndex(names.length ? 0 : -1);
      }
    } else {
      setSuggestions([]);
      closeSuggestions();
    }
  }

  function handleComboboxBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (suggestionPickRef.current) {
      suggestionPickRef.current = false;
      return;
    }
    const next = e.relatedTarget as Node | null;
    if (next && comboboxRootRef.current?.contains(next)) return;
    closeSuggestions();
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    const open = showSuggestions && suggestions.length > 0;

    if (e.key === "ArrowDown") {
      if (suggestions.length > 0) {
        e.preventDefault();
        setShowSuggestions(true);
        setActiveSuggestionIndex((i) => {
          if (!open) return 0;
          return Math.min(i < 0 ? 0 : i + 1, suggestions.length - 1);
        });
      }
      return;
    }

    if (e.key === "ArrowUp") {
      if (open && suggestions.length > 0) {
        e.preventDefault();
        setActiveSuggestionIndex((i) => {
          const cur = i < 0 ? 0 : i;
          return Math.max(cur - 1, 0);
        });
      }
      return;
    }

    if (e.key === "Escape") {
      if (open) {
        e.preventDefault();
        closeSuggestions();
      }
      return;
    }

    if (e.key === "Enter") {
      if (
        open &&
        activeSuggestionIndex >= 0 &&
        activeSuggestionIndex < suggestions.length
      ) {
        e.preventDefault();
        applySuggestionAndSearch(suggestions[activeSuggestionIndex]);
      }
    }
  }

  const expanded = Boolean(showSuggestions && suggestions.length > 0);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:gap-4">
        <div
          ref={comboboxRootRef}
          className="relative flex-1 w-full min-w-0"
          onBlur={handleComboboxBlur}
        >
          <label htmlFor="shop-search-input" className="sr-only">
            Search products by name
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden
          />
          <input
            id="shop-search-input"
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={expanded ? listboxId : undefined}
            aria-activedescendant={
              expanded && activeSuggestionIndex >= 0
                ? `shop-search-opt-${activeSuggestionIndex}`
                : undefined
            }
            autoComplete="off"
            value={search}
            onChange={handleSearchChange}
            placeholder="Search sausages, cuts, packs…"
            className="w-full rounded-xl py-3 pr-12 pl-11 text-sm outline-none transition-[box-shadow] focus:ring-2 focus:ring-[var(--ring)]"
            style={{
              border: "1px solid var(--sidebar-border)",
              background: "var(--card-bg)",
              color: "var(--foreground)",
            }}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onKeyDown={handleInputKeyDown}
          />
          {search.length > 0 && (
            <button
              type="button"
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-opacity hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              style={{ color: "var(--muted-foreground)" }}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setSearch("");
                setSuggestions([]);
                closeSuggestions();
              }}
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          )}
          {expanded && (
            <ul
              id={listboxId}
              role="listbox"
              aria-label="Search suggestions"
              className="absolute z-[60] mt-1 max-h-60 w-full overflow-y-auto rounded-xl border py-1 shadow-lg"
              style={{
                background: "var(--card-bg)",
                borderColor: "var(--sidebar-border)",
                boxShadow: "var(--card-shadow)",
              }}
            >
              {suggestions.slice(0, 8).map((s, i) => {
                const highlighted = activeSuggestionIndex === i;
                return (
                  <li key={`${s}-${i}`} role="presentation">
                    <div
                      id={`shop-search-opt-${i}`}
                      role="option"
                      tabIndex={-1}
                      aria-selected={highlighted}
                      className="w-full text-left px-4 py-2.5 text-sm cursor-pointer hover:opacity-90"
                      style={{
                        color: "var(--foreground)",
                        ...(highlighted
                          ? {
                              background: "var(--sidebar-bg)",
                              outline: "2px solid var(--ring)",
                              outlineOffset: -2,
                            }
                          : {}),
                      }}
                      onMouseEnter={() => setActiveSuggestionIndex(i)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        suggestionPickRef.current = true;
                        applySuggestionAndSearch(s);
                      }}
                    >
                      {s}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex shrink-0 gap-2 items-stretch sm:items-center w-full sm:w-auto">
          <div className="flex-1 sm:flex-initial sm:w-[min(100%,14rem)] lg:w-56 min-h-[48px]">
            <SortList
              options={sortOptions}
              value={sort}
              onChange={setSort}
              placeholder="Sort"
              className="w-full min-h-[48px]"
            />
          </div>
          {mobileFilterSlot ? (
            <div className="flex items-stretch md:hidden">{mobileFilterSlot}</div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
