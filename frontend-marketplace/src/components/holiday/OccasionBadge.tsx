import type { HolidayEvent } from "@/lib/holidayApi";

interface OccasionBadgeProps {
  event: Pick<HolidayEvent, "theme" | "label" | "name"> | null | undefined;
  size?: "sm" | "md";
  className?: string;
}

/** Gift-tag pill marking a Christmas / New Year order. Renders nothing for regular orders. */
export default function OccasionBadge({
  event,
  size = "sm",
  className = "",
}: OccasionBadgeProps) {
  if (!event) return null;
  return (
    <span
      className={`season-tag season-tag--${event.theme} season-tag--${size} ${className}`.trim()}
      title={`${event.name} order`}
    >
      <span className="season-tag-hole" aria-hidden="true" />
      {event.label} order
    </span>
  );
}
