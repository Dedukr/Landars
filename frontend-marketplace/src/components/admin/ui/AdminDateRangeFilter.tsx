import { Input } from "./input";

type AdminDateRangeFilterProps = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
};

export function AdminDateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
}: AdminDateRangeFilterProps) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-center">
      <Input
        type="date"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
      />
      <span className="hidden text-sm text-muted-foreground md:inline">to</span>
      <Input
        type="date"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
      />
    </div>
  );
}
