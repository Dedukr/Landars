import type { Metadata } from "next";
import HomeHero from "@/components/home/HomeHero";
import HowItWorksSection from "@/components/home/HowItWorksSection";
import CategoryGrid from "@/components/home/CategoryGrid";
import ProductPreviewSection from "@/components/home/ProductPreviewSection";
import FeaturedProductsSection from "@/components/home/FeaturedProductsSection";
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
      {/* ── Hero (search + CTAs + product preview) ───────── */}
      <HomeHero />

      {/* ── How it works ─────────────────────────────────── */}
      <HowItWorksSection />

      {/* ── Browse by category ───────────────────────────── */}
      <CategoryGrid />

      {/* ── Popular picks ────────────────────────────────── */}
      {/*
        Future: when backend exposes `sales_count` or `order_count`,
        pass sort="sales_count" to show genuinely popular products.
        For now, displays a curated selection from the catalogue.
      */}
      <ProductPreviewSection
        title="Popular picks"
        subtitle="Customer favourites"
        sort="name_asc"
        limit={8}
        background="subtle"
      />

      {/* ── Fresh picks (newest products) ───────────────── */}
      <FeaturedProductsSection
        title="Fresh picks"
        subtitle="Newly added"
        sort="created_at_desc"
        limit={4}
      />

      {/* ── Trust & benefits ─────────────────────────────── */}
      <TrustBenefitsSection />

      {/* ── Final CTA ────────────────────────────────────── */}
      <HomeCTASection />
    </div>
  );
}
