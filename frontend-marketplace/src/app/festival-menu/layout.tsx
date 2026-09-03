import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Festival Menu",
  description:
    "Browse Landar's Food festival menu — authentic Ukrainian street food, jerky, and drinks.",
};

export default function FestivalMenuLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
