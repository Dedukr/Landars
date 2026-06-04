type Props = {
  message: string;
};

/**
 * Reusable empty state for dashboard chart cards.
 * Fixed height matches chart height so the card doesn't collapse.
 */
export function DashboardEmptyState({ message }: Props) {
  return (
    <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}
