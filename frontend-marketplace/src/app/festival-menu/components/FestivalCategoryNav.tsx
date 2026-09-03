"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FestivalMenuCategory } from "@/lib/festivalMenuApi";
import { categorySectionId } from "../utils";

type FestivalCategoryNavProps = {
  categories: FestivalMenuCategory[];
};

export function FestivalCategoryNav({ categories }: FestivalCategoryNavProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

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
      { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    for (const section of sections) {
      observer.observe(section);
    }

    return () => observer.disconnect();
  }, [categories]);

  return (
    <nav className="festival-menu-nav" aria-label="Menu categories">
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
  );
}
