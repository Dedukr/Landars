import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Package } from "lucide-react";

export default function ProductNotFoundState() {
  return (
    <div
      className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-16"
      style={{ background: "var(--background)" }}
    >
      <div
        className="max-w-md w-full rounded-2xl border p-8 text-center shadow-sm"
        style={{
          background: "var(--card-bg)",
          borderColor: "var(--sidebar-border)",
        }}
      >
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: "var(--sidebar-bg)" }}
        >
          <Package className="h-7 w-7" style={{ color: "var(--muted-foreground)" }} aria-hidden />
        </div>
        <h1 className="text-xl font-semibold mb-2" style={{ color: "var(--foreground)" }}>
          We could not find this product.
        </h1>
        <p className="text-sm mb-1" style={{ color: "var(--muted-foreground)" }}>
          This item may no longer be available.
        </p>
        <div className="h-2" />
        <Button variant="primary" size="md" fullWidth asChild>
          <Link href="/shop/">Back to shop</Link>
        </Button>
      </div>
    </div>
  );
}
