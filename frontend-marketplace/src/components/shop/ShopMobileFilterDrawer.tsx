"use client";

import React, { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getVisibleFocusables } from "@/lib/focusTrap";

interface ShopMobileFilterDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function ShopMobileFilterDrawer({
  open,
  onClose,
  title = "Filters",
  children,
}: ShopMobileFilterDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeBtnRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const root = panelRef.current;
    if (!root) return;

    function onKeyTrap(e: KeyboardEvent) {
      const panel = panelRef.current;
      if (!panel || e.key !== "Tab") return;
      const list = getVisibleFocusables(panel);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus({ preventScroll: true });
      }
    }

    root.addEventListener("keydown", onKeyTrap);
    return () => root.removeEventListener("keydown", onKeyTrap);
  }, [open]);

  useEffect(() => {
    if (wasOpenRef.current && !open) {
      const el = restoreFocusRef.current;
      if (el && document.body.contains(el)) {
        queueMicrotask(() => el.focus({ preventScroll: true }));
      }
      restoreFocusRef.current = null;
    }
    wasOpenRef.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] lg:hidden flex"
      role="dialog"
      aria-modal="true"
      aria-labelledby="shop-filter-drawer-title"
      style={{ isolation: "isolate" }}
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Dismiss filters backdrop"
        className="flex-1 min-h-[100dvh]"
        style={{ background: "rgba(0,0,0,0.45)" }}
        onClick={onClose}
      />
      <div
        ref={panelRef}
        id="shop-filter-panel"
        className="relative flex flex-col max-w-[90vw] w-[min(22rem,calc(100vw-24px))] h-[100dvh] shadow-xl border-l animate-fade-in"
        style={{
          background: "var(--card-bg)",
          borderLeftColor: "var(--sidebar-border)",
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b shrink-0"
          style={{ borderBottomColor: "var(--sidebar-border)" }}
        >
          <h2 id="shop-filter-drawer-title" className="text-lg font-bold" style={{ color: "var(--foreground)" }}>
            {title}
          </h2>
          <button
            type="button"
            ref={closeBtnRef}
            onClick={onClose}
            className="p-2.5 rounded-lg transition-opacity hover:opacity-80 outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            style={{ color: "var(--muted-foreground)" }}
            aria-label="Close filters"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        <div
          className="p-4 border-t shrink-0 sticky bottom-0"
          style={{ borderTopColor: "var(--sidebar-border)", background: "var(--card-bg)" }}
        >
          <Button type="button" variant="primary" fullWidth size="lg" onClick={onClose}>
            View results
          </Button>
        </div>
      </div>
    </div>
  );
}
