import Image from "next/image";
import { cn } from "@/lib/utils";

type FoodHygieneRatingProps = {
  className?: string;
  /** Wrap the badge image in the branded success panel (header, hero). */
  framed?: boolean;
  frameClassName?: string;
  /** Grow to container width; height follows image aspect ratio (1079×601). */
  fluid?: boolean;
};

const HYGIENE_TITLE = "Food hygiene rating 5 (FSA scale — very good)";
const HYGIENE_ASPECT = "1079 / 601";

export function FoodHygieneRating({
  className = "h-7 w-auto",
  framed = false,
  frameClassName,
  fluid = false,
}: FoodHygieneRatingProps) {
  const image = (
    <Image
      src="/FoodHygiene.png"
      alt="Food hygiene rating 5 — very good (FSA scale)"
      width={1079}
      height={601}
      className={cn(
        "object-contain",
        fluid ? "h-auto w-full max-w-full" : className
      )}
      style={fluid ? { aspectRatio: HYGIENE_ASPECT } : undefined}
    />
  );

  if (!framed) {
    return image;
  }

  return (
    <div
      className={cn(
        "items-center justify-center border shadow-sm",
        fluid ? "flex min-w-0 flex-1" : "inline-flex",
        frameClassName
      )}
      style={{
        background: "var(--success-bg)",
        borderColor: "var(--success-border)",
      }}
      title={HYGIENE_TITLE}
    >
      {image}
    </div>
  );
}
