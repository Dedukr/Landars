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
    const isMobileViewport =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;

    if (isMobileViewport) {
      setSuggestions([]);
      closeSuggestions();
      return;
    }

    if (value.length > 1) {
      const seq = ++fetchSeqRef.current;
      const qs = scopeProductsQueryString(
        new URLSearchParams({
          search: value,
          sort: "name_asc",
          limit: "8",
          offset: "0",
        }).toString()
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
    if (next && e.currentTarget.contains(next)) return;
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
      <div
        className="md:hidden"
      >
        <div
          className="relative w-full rounded-full border p-1 shadow-2xl backdrop-blur-xl mb-2"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 30%, var(--sidebar-border))",
            background:
              "linear-gradient(165deg, color-mix(in srgb, var(--card-bg) 86%, white 14%) 0%, color-mix(in srgb, var(--card-bg) 90%, transparent) 100%)",
            boxShadow:
              "0 10px 30px color-mix(in srgb, var(--accent) 20%, transparent), inset 0 1px 0 color-mix(in srgb, white 55%, transparent)",
          }}
        >
          <div className="relative" onBlur={handleComboboxBlur}>
            <label htmlFor="shop-search-input-mobile" className="sr-only">
              Search products by name
            </label>
            <Search
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4"
              style={{ color: "var(--muted-foreground)" }}
              aria-hidden
            />
            <input
              id="shop-search-input-mobile"
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
              placeholder="Search products..."
              className="w-full rounded-full py-3 pr-12 pl-11 text-[16px] outline-none transition-[box-shadow] focus:ring-2 focus:ring-[var(--ring)]"
              style={{
                border: "1px solid color-mix(in srgb, var(--accent) 18%, var(--sidebar-border))",
                background: "color-mix(in srgb, var(--card-bg) 92%, transparent)",
                color: "var(--foreground)",
                WebkitTextSizeAdjust: "100%",
              }}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              onKeyDown={handleInputKeyDown}
            />
            {search.length > 0 && (
              <button
                type="button"
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-full transition-opacity hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
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
                className="absolute z-[70] bottom-[calc(100%+0.45rem)] max-h-60 w-full overflow-y-auto rounded-2xl border py-1 shadow-xl"
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
        </div>
      </div>

      <div className="md:hidden flex gap-2 items-stretch w-full">
        <div className="flex-1 min-h-[48px]">
          <SortList
            options={sortOptions}
            value={sort}
            onChange={setSort}
            placeholder="Sort"
            className="w-full min-h-[48px]"
          />
        </div>
        {mobileFilterSlot ? (
          <div className="flex items-stretch">{mobileFilterSlot}</div>
        ) : null}
      </div>

      <div className="hidden md:flex flex-col sm:flex-row gap-3 sm:items-center sm:gap-4">
        <div
          className="relative flex-1 w-full min-w-0"
          onBlur={handleComboboxBlur}
        >
          <label htmlFor="shop-search-input-desktop" className="sr-only">
            Search products by name
          </label>
          <Search
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4"
            style={{ color: "var(--muted-foreground)" }}
            aria-hidden
          />
          <input
            id="shop-search-input-desktop"
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
            <div className="hidden md:flex items-stretch">{mobileFilterSlot}</div>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}
