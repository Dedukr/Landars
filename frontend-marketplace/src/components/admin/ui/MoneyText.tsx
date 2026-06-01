type MoneyTextProps = {
  amount: number | string | null | undefined;
  currency?: string;
};

export function MoneyText({ amount, currency = "GBP" }: MoneyTextProps) {
  const value = Number(amount ?? 0);
  const formatted = new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(Number.isFinite(value) ? value : 0);

  return <span>{formatted}</span>;
}
