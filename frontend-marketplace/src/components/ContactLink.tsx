"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

const linkUnderline = [
  "underline decoration-1 underline-offset-[0.22em]",
  "decoration-[color-mix(in_srgb,var(--primary)_28%,transparent)]",
  "hover:decoration-[color-mix(in_srgb,var(--accent)_45%,transparent)]",
] as const;

const variantStyles = {
  /** Inline within body text (order help, paragraphs). */
  inline: [
    "inline-flex items-center gap-1 font-semibold",
    "text-[var(--primary)]",
    ...linkUnderline,
    "transition-colors hover:text-[var(--accent)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 rounded-sm",
  ],
  /** Footer and compact list rows. */
  footer: [
    "inline-flex items-center gap-1 text-sm font-semibold",
    "text-[var(--primary)]",
    ...linkUnderline,
    "transition-colors hover:text-[var(--accent)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 rounded-sm break-all",
  ],
  /** Contact page cards — prominent tap target. */
  card: [
    "inline-flex items-center gap-1.5 text-sm sm:text-base font-semibold",
    "text-[var(--primary)]",
    ...linkUnderline,
    "transition-colors hover:text-[var(--accent)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 rounded-sm",
    "min-h-[44px] py-1",
  ],
} as const;

export type ContactLinkVariant = keyof typeof variantStyles;

export function contactLinkClasses(variant: ContactLinkVariant = "inline"): string {
  return cn(variantStyles[variant]);
}

export interface ContactLinkProps
  extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ContactLinkVariant;
  /** Show external-link icon (defaults true for http(s) URLs on card variant). */
  showExternalIcon?: boolean;
}

export function ContactLink({
  variant = "inline",
  className,
  children,
  showExternalIcon,
  href,
  target,
  rel,
  ...props
}: ContactLinkProps) {
  const isExternal = Boolean(href?.startsWith("http"));
  const showIcon =
    showExternalIcon ?? (variant === "card" && isExternal);

  return (
    <a
      href={href}
      className={cn(contactLinkClasses(variant), className)}
      target={target ?? (isExternal ? "_blank" : undefined)}
      rel={rel ?? (isExternal ? "noopener noreferrer" : undefined)}
      {...props}
    >
      {children}
      {showIcon ? (
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
      ) : null}
    </a>
  );
}
