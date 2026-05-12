import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Your wishlist",
  robots: { index: false, follow: true },
};

export default function WishlistLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
