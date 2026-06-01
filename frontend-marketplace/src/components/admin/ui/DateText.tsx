type DateTextProps = {
  value: string | Date | null | undefined;
  includeTime?: boolean;
};

export function DateText({ value, includeTime = true }: DateTextProps) {
  if (!value) {
    return <span>-</span>;
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return <span>-</span>;
  }

  return (
    <span>
      {new Intl.DateTimeFormat("en-GB", {
        dateStyle: "medium",
        timeStyle: includeTime ? "short" : undefined,
      }).format(date)}
    </span>
  );
}
