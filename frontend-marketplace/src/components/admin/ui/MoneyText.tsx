type MoneyTextProps = {
  value: number | string | null | undefined;
  currency?: string;
};

export function MoneyText({ value, currency = "GBP" }: MoneyTextProps) {
  if (value === null || value === undefined || value === "") {
    return <span>-</span>;
  }

  const amount = typeof value === "string" ? Number(value) : value;

  if (Number.isNaN(amount)) {
    return <span>-</span>;
  }

  return (
    <span>
      {new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
      }).format(amount)}
    </span>
  );
}
