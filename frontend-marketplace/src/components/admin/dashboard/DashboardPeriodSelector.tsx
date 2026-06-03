"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { DashboardPeriod, PERIOD_OPTIONS } from "@/lib/api/dashboard";

type Props = {
  value: DashboardPeriod;
};

export function DashboardPeriodSelector({ value }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", e.target.value);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <select
      value={value}
      onChange={handleChange}
      className="h-9 rounded-lg border bg-background px-3 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
      aria-label="Select dashboard period"
    >
      {PERIOD_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
