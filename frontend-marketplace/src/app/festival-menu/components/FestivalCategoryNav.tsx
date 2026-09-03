"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { FestivalMenuCategory } from "@/lib/festivalMenuApi";
import { categorySectionId } from "../utils";

type FestivalCategoryNavProps = {
  categories: FestivalMenuCategory[];
};

type StuckMetrics = {
  left: number;
  width: number;
  height: number;
};

export function FestivalCategoryNav({ categories }: FestivalCategoryNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [stuck, setStuck] = useState(false);
  const [metrics, setMetrics] = useState<StuckMetrics>({
    left: 0,
    width: 0,
    height: 0,
  });
  const slotRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    const nav = navRef.current;
    if (!slot || !nav) return;

    const rect = slot.getBoundingClientRect();
    setMetrics({
      left: rect.left,
      width: rect.width,
      height: nav.offsetHeight,
    });
  }, [categories, stuck]);

  useEffect(() => {
    const slot = slotRef.current;
    if (!slot) return;

    let frame = 0;
    const update = () => {
      const rect = slot.getBoundingClientRect();
      setMetrics({
        left: rect.left,
        width: rect.width,
        height: navRef.current?.offsetHeight || rect.height,
      });
      setStuck(rect.top <= 0);
    };

    const onScrollOrResize = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        update();
      });
    };

    update();
    window.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });
    window.addEventListener("resize", onScrollOrResize);
    document.addEventListener("scroll", onScrollOrResize, {
      passive: true,
      capture: true,
    });

    let node: HTMLElement | null = slot.parentElement;
    const extraRoots: HTMLElement[] = [];
    while (node) {
      extraRoots.push(node);
      node.addEventListener("scroll", onScrollOrResize, { passive: true });
      node = node.parentElement;
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScrollOrResize, { capture: true });
      window.removeEventListener("resize", onScrollOrResize);
      document.removeEventListener("scroll", onScrollOrResize, {
        capture: true,
      });
      for (const root of extraRoots) {
        root.removeEventListener("scroll", onScrollOrResize);
      }
    };
  }, [categories]);

  useEffect(() => {
    const sectionIds = categories.map((c) => categorySectionId(c.name));
    const sections = sectionIds
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null);

    if (sections.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target.id) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-72px 0px -65% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [categories]);

  return (
    <div
      ref={slotRef}
      className="festival-menu-nav-slot"
      style={{ height: metrics.height || undefined }}
    >
      <nav
        ref={navRef}
        className={`festival-menu-nav${stuck ? " festival-menu-nav--stuck" : ""}`}
        style={
          stuck
            ? {
                left: metrics.left,
                width: metrics.width,
              }
            : undefined
        }
        aria-label="Menu categories"
      >
        <div className="festival-menu-nav-inner">
          {categories.map((category) => {
            const sectionId = categorySectionId(category.name);
            const isActive = activeId === sectionId;
            return (
              <Link
                key={category.name}
                href={`#${sectionId}`}
                className="festival-menu-nav-link"
                aria-current={isActive ? "true" : undefined}
              >
                {category.name}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
