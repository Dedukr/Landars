import type { Metadata } from "next";
import HomeHero from "@/components/home/HomeHero";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import CategoryGrid from "@/components/home/CategoryGrid";
import ProductPreviewSection from "@/components/home/ProductPreviewSection";
import TrustBenefitsSection from "@/components/home/TrustBenefitsSection";
import HomeCTASection from "@/components/home/HomeCTASection";

export const metadata: Metadata = {
  title: "Landar's Food — Authentic Eastern European Foods, Delivered UK-Wide",
  description:
    "Discover premium Eastern European sausages, dairy, pastries and pantry staples. Browse our full range and order for UK-wide delivery. Fresh, authentic, family business.",
};

export default function HomePage() {
  return (
    <div style={{ background: "var(--background)" }}>
      <HomeHero />

      <CategoryGrid />

      <ProductPreviewSection
        title="Most popular picks"
        subtitle="Best sellers by units sold"
        sort="sales_desc"
        limit={8}
        offset={0}
        background="subtle"
      />

      <ProductPreviewSection
        title="Fresh picks"
        subtitle="Newly added"
        sort="created_at_desc"
        limit={8}
        offset={0}
        background="default"
      />

      <HowItWorksSection />

      <TrustBenefitsSection />

      <HomeCTASection />
    </div>
  );
}
