type DateTextProps = {
  value: string | Date | null | undefined;
  withTime?: boolean;
};

export function DateText({ value, withTime = false }: DateTextProps) {
  if (!value) return <span>-</span>;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return <span>-</span>;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });

  return <span>{formatter.format(date)}</span>;
}
