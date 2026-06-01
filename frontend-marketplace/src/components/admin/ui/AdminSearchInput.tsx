"use client";

import { Search } from "lucide-react";

import { Input } from "./input";

type AdminSearchInputProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
};

export function AdminSearchInput({
  value,
  onChange,
  placeholder = "Search...",
}: AdminSearchInputProps) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="pl-9"
      />
    </div>
  );
}
