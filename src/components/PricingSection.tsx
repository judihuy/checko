// Pricing section — Checko-Pakete klickbar mit Stripe Checkout
// Eingeloggt → POST /api/stripe/checkout → Stripe
// Nicht eingeloggt → Redirect zu /login?callbackUrl=/dashboard/checkos
"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

const PACKAGES = [
  {
    amount: 20,
    priceId: "price_1TBA0mDu7PSxvnovrngeJBlq",
    price: "CHF 20.00",
    perChecko: "CHF 1.00",
    savings: "",
    discountPercent: 0,
    popular: false,
    emoji: "🦎",
  },
  {
    amount: 50,
    priceId: "price_1TBA19Du7PSxvnovj3OaduIm",
    price: "CHF 45.00",
    perChecko: "CHF 0.90",
    savings: "Spare 10%",
    discountPercent: 10,
    popular: true,
    emoji: "🔥",
  },
  {
    amount: 100,
    priceId: "price_1TBA1IDu7PSxvnovyfotwnT5",
    price: "CHF 85.00",
    perChecko: "CHF 0.85",
    savings: "Spare 15%",
    discountPercent: 15,
    popular: false,
    emoji: "⚡",
  },
  {
    amount: 250,
    priceId: "price_1TBA1JDu7PSxvnovEKMNnI4R",
    price: "CHF 200.00",
    perChecko: "CHF 0.80",
    savings: "Spare 20%",
    discountPercent: 20,
    popular: false,
    emoji: "💎",
  },
];

export function PricingSection() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [loadingPkg, setLoadingPkg] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function handleBuy(amount: number, priceId: string) {
    // Nicht eingeloggt → Login mit Callback
    if (!session) {
      router.push("/login?callbackUrl=/dashboard/checkos");
      return;
    }

    if (loadingPkg !== null) return;
    setLoadingPkg(amount);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkos: amount, priceId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler beim Erstellen der Checkout-Session");
        return;
      }

      if (data.url) {
        window.open(data.url, "_blank");
      } else {
        setError("Keine Checkout-URL erhalten");
      }
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
    } finally {
      setLoadingPkg(null);
    }
  }

  const isLoading = status === "loading";

  return (
    <section id="preise" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Checkos — Bezahle nur, was du nutzt
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Kein Abo, keine Flatrate. Kaufe Checkos und setze sie für jede Modulnutzung ein.
            Je grösser das Paket, desto günstiger pro Checko.
          </p>
        </div>

        {/* Fehlermeldung */}
        {error && (
          <div className="mb-6 max-w-3xl mx-auto p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
          {PACKAGES.map((pkg) => {
            const isThisLoading = loadingPkg === pkg.amount;
            const isAnyLoading = loadingPkg !== null;

            return (
              <button
                key={pkg.amount}
                onClick={() => handleBuy(pkg.amount, pkg.priceId)}
                disabled={isAnyLoading || isLoading}
                className={`relative rounded-2xl p-6 text-center transition-all duration-200 cursor-pointer
                  ${isAnyLoading || isLoading ? "opacity-50 cursor-not-allowed" : "hover:scale-105 hover:border-emerald-500 hover:shadow-lg"}
                  ${pkg.popular
                    ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-400 shadow-lg"
                    : "bg-gray-50 border-2 border-gray-200"
                  }
                `}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
                    🔥 Beliebt
                  </div>
                )}

                {pkg.savings && (
                  <div
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${
                      pkg.popular
                        ? "bg-emerald-200 text-emerald-800"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {pkg.savings}
                  </div>
                )}
                {!pkg.savings && <div className="h-6 mb-3" />}

                {/* Emoji */}
                <div className="text-3xl mb-2">{pkg.emoji}</div>

                <div className="mb-1">
                  <span className="text-3xl font-bold text-gray-900">{pkg.amount}</span>
                </div>
                <p className="text-sm text-gray-500 mb-3">Checkos</p>

                <div className="mb-1">
                  <span className="text-xl font-bold text-gray-900">{pkg.price}</span>
                </div>
                <p className="text-xs text-gray-400 mb-2">
                  {pkg.perChecko} pro Checko
                </p>

                {/* Loading-Indikator */}
                {isThisLoading && (
                  <div className="mt-2">
                    <div className="animate-spin inline-block w-5 h-5 border-2 border-emerald-600 border-t-transparent rounded-full" />
                    <p className="text-xs text-emerald-600 mt-1">Wird vorbereitet...</p>
                  </div>
                )}

                {/* CTA-Hinweis wenn nicht loading */}
                {!isThisLoading && (
                  <div className="mt-2 text-xs font-medium text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                    {session ? "Jetzt kaufen →" : "Anmelden & kaufen →"}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Qualitätsstufen */}
        <div className="mt-12 max-w-2xl mx-auto">
          <h3 className="text-center font-semibold text-gray-900 mb-4">
            Kosten pro Modulnutzung
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-lg font-bold text-gray-900">2</span>
              <span className="text-gray-500 ml-1">Checkos</span>
              <p className="text-gray-700 font-medium mt-1">Standard</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <span className="text-lg font-bold text-emerald-700">4</span>
              <span className="text-emerald-600 ml-1">Checkos</span>
              <p className="text-emerald-700 font-medium mt-1">Premium</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-lg font-bold text-gray-900">7</span>
              <span className="text-gray-500 ml-1">Checkos</span>
              <p className="text-gray-700 font-medium mt-1">Pro</p>
            </div>
          </div>
        </div>

        <div className="text-center mt-10">
          <p className="text-gray-500 text-sm">
            Alle Preise in CHF inkl. MwSt. Kein Abo. Kein Verfall. Keine versteckten Kosten.
          </p>
        </div>
      </div>
    </section>
  );
}
