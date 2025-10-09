"use client";

import React from "react";

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold text-foreground mb-8">
            About Landar&apos;s Food
          </h1>

          <div className="prose prose-lg max-w-none">
            <p className="text-lg text-muted-foreground mb-6">
              Welcome to Landar&apos;s Food, your premier destination for
              authentic Eastern European cuisine. We bring you the finest
              traditional foods, carefully selected and prepared to maintain the
              authentic flavors of Eastern Europe.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Our Story
            </h2>
            <p className="text-muted-foreground mb-6">
              Founded with a passion for preserving and sharing the rich
              culinary traditions of Eastern Europe, Landar&apos;s Food has been
              serving authentic dishes to food lovers around the world. Our
              commitment to quality and authenticity ensures that every product
              meets the highest standards.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Our Mission
            </h2>
            <p className="text-muted-foreground mb-6">
              To provide authentic Eastern European foods that bring families
              together and preserve the culinary heritage of our ancestors. We
              believe that food is more than sustenance—it&apos;s a connection
              to culture, family, and tradition.
            </p>

            <h2 className="text-2xl font-semibold text-foreground mb-4">
              Quality Promise
            </h2>
            <p className="text-muted-foreground mb-6">
              Every product in our selection is carefully chosen for its
              authenticity and quality. We work directly with trusted suppliers
              and producers to ensure that our customers receive the finest
              Eastern European foods available.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
