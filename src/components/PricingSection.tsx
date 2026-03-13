// Pricing section showing volume discount tiers
"use client";

import { DISCOUNT_TIERS } from "@/lib/stripe";

export function PricingSection() {
  return (
    <section id="preise" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Faire Preise, mehr sparen mit mehr Modulen
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Jedes Modul hat seinen eigenen monatlichen Preis. Je mehr Module du nutzt, desto
            groesser dein Rabatt.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-4xl mx-auto">
          {DISCOUNT_TIERS.map((tier, index) => {
            const isPopular = index === 2; // 5-7 modules tier
            return (
              <div
                key={index}
                className={`relative rounded-xl p-6 text-center transition-all ${
                  isPopular
                    ? "bg-emerald-600 text-white shadow-xl scale-105"
                    : "bg-gray-50 border border-gray-200"
                }`}
              >
                {isPopular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-xs px-3 py-1 rounded-full font-medium">
                    Beliebt
                  </div>
                )}
                <div
                  className={`text-sm font-medium mb-2 ${
                    isPopular ? "text-emerald-100" : "text-gray-500"
                  }`}
                >
                  {tier.maxModules
                    ? `${tier.minModules}–${tier.maxModules} Module`
                    : `${tier.minModules}+ Module`}
                </div>
                <div
                  className={`text-4xl font-bold mb-2 ${
                    isPopular ? "text-white" : "text-gray-900"
                  }`}
                >
                  {tier.discountPercent > 0 ? `-${tier.discountPercent}%` : "0%"}
                </div>
                <div
                  className={`text-sm ${isPopular ? "text-emerald-100" : "text-gray-500"}`}
                >
                  {tier.discountPercent > 0 ? tier.label : "Einzelpreis"}
                </div>
              </div>
            );
          })}
        </div>

        <div className="text-center mt-10">
          <p className="text-gray-500 text-sm">
            Alle Preise in CHF inkl. MwSt. Monatlich kuendbar. Keine versteckten Kosten.
          </p>
        </div>
      </div>
    </section>
  );
}
