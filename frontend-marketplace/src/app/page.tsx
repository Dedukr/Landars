import type { Metadata } from "next";
import HomeHero from "@/components/home/HomeHero";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import CategoryGrid from "@/components/home/CategoryGrid";
import ProductPreviewSection from "@/components/home/ProductPreviewSection";
import TrustBenefitsSection from "@/components/home/TrustBenefitsSection";
import HomeCTASection from "@/components/home/HomeCTASection";

export const metadata: Metadata = {
  title:
    "Ukrainian, Slavic, European cuisine",
  description:
    "Homemade semi-prepared products, ready meals, sausages and meat products, fresh bakery items, and desserts.",
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
        background="transparent"
      />

      <HowItWorksSection />

      <TrustBenefitsSection />

      <HomeCTASection />
    </div>
  );
}
