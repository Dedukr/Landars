import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Order details | LandarsFood",
  robots: { index: false, follow: false },
};

export default function OrderDetailLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
