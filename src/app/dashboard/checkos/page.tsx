// Checkos Kaufseite — 3 Pakete mit Stripe Checkout
"use client";

import { Suspense, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

interface CheckoPackageDisplay {
  id: string;
  amount: number;
  priceDisplay: string;
  savings: string;
  popular: boolean;
  pricePerChecko: string;
}

const PACKAGES: CheckoPackageDisplay[] = [
  {
    id: "checkos-20",
    amount: 20,
    priceDisplay: "CHF 20.00",
    savings: "",
    popular: false,
    pricePerChecko: "CHF 1.00",
  },
  {
    id: "checkos-50",
    amount: 50,
    priceDisplay: "CHF 45.00",
    savings: "Spare 10%",
    popular: true,
    pricePerChecko: "CHF 0.90",
  },
  {
    id: "checkos-100",
    amount: 100,
    priceDisplay: "CHF 85.00",
    savings: "Spare 15%",
    popular: false,
    pricePerChecko: "CHF 0.85",
  },
];

function CheckosKaufContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (!session) {
    router.push("/login");
    return null;
  }

  const handlePurchase = async (packageId: string) => {
    setLoading(packageId);
    setError("");

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Fehler beim Checkout");
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ein Fehler ist aufgetreten");
      setLoading(null);
    }
  };

  return (
    <main className="flex-1 py-12">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Zurück zum Dashboard */}
        <Link
          href="/dashboard"
          className="inline-flex items-center text-sm text-gray-500 hover:text-emerald-600 mb-6 transition"
        >
          ← Zurück zum Dashboard
        </Link>

        {/* Header */}
        <div className="text-center mb-10">
          <span className="text-5xl block mb-4">🦎</span>
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Checkos aufladen</h1>
          <p className="text-gray-600 max-w-xl mx-auto">
            Kaufe Checkos und nutze sie für alle Module. Je mehr du kaufst, desto günstiger
            wird jeder Checko.
          </p>
        </div>

        {/* Checkout abgebrochen */}
        {checkoutCanceled && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm text-center">
            Checkout abgebrochen. Du kannst es jederzeit erneut versuchen.
          </div>
        )}

        {/* Fehler */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {/* Pakete */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.id}
              className={`relative rounded-2xl p-6 text-center transition-all ${
                pkg.popular
                  ? "bg-emerald-600 text-white shadow-xl ring-2 ring-emerald-600 ring-offset-2 scale-105"
                  : "bg-white border-2 border-gray-200 hover:border-emerald-300"
              }`}
            >
              {/* Beliebt Badge */}
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-xs px-3 py-1 rounded-full font-medium">
                  Beliebteste Wahl
                </div>
              )}

              {/* Sparhinweis */}
              {pkg.savings && (
                <div
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${
                    pkg.popular
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {pkg.savings}
                </div>
              )}
              {!pkg.savings && <div className="h-6 mb-3" />}

              {/* Menge */}
              <div className="mb-2">
                <span className="text-4xl font-bold">{pkg.amount}</span>
              </div>
              <p
                className={`text-sm mb-1 ${
                  pkg.popular ? "text-emerald-100" : "text-gray-500"
                }`}
              >
                Checkos
              </p>

              {/* Preis */}
              <div className="my-4">
                <span className="text-2xl font-bold">{pkg.priceDisplay}</span>
              </div>
              <p
                className={`text-xs mb-6 ${
                  pkg.popular ? "text-emerald-200" : "text-gray-400"
                }`}
              >
                {pkg.pricePerChecko} pro Checko
              </p>

              {/* Kaufen Button */}
              <button
                onClick={() => handlePurchase(pkg.id)}
                disabled={loading !== null}
                className={`w-full py-3 rounded-lg font-semibold transition ${
                  pkg.popular
                    ? "bg-white text-emerald-700 hover:bg-emerald-50"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                } disabled:opacity-50 disabled:cursor-not-allowed`}
              >
                {loading === pkg.id ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-2 border-current border-t-transparent" />
                    Wird geladen…
                  </span>
                ) : (
                  "Jetzt kaufen"
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Info */}
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <h3 className="font-semibold text-gray-900 mb-2">So funktionieren Checkos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <span className="text-2xl block mb-1">🪙</span>
              <strong>Kaufen</strong>
              <p>Wähle ein Paket und bezahle sicher mit Stripe.</p>
            </div>
            <div>
              <span className="text-2xl block mb-1">⚡</span>
              <strong>Nutzen</strong>
              <p>Jede Modulnutzung kostet Checkos — je nach Qualitätsstufe.</p>
            </div>
            <div>
              <span className="text-2xl block mb-1">♻️</span>
              <strong>Kein Verfall</strong>
              <p>Deine Checkos haben kein Ablaufdatum.</p>
            </div>
          </div>
        </div>

        {/* Qualitätsstufen Info */}
        <div className="mt-8 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900 mb-4 text-center">
            Checko-Kosten pro Modulnutzung
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <span className="text-xl font-bold text-gray-900">2</span>
              <span className="text-sm text-gray-500 ml-1">Checkos</span>
              <p className="text-sm font-medium text-gray-700 mt-1">Standard</p>
              <p className="text-xs text-gray-500">Schnell und zuverlässig</p>
            </div>
            <div className="text-center p-4 bg-emerald-50 rounded-lg border border-emerald-200">
              <span className="text-xl font-bold text-emerald-700">4</span>
              <span className="text-sm text-emerald-600 ml-1">Checkos</span>
              <p className="text-sm font-medium text-emerald-700 mt-1">Premium</p>
              <p className="text-xs text-emerald-600">Bessere Qualität und mehr Details</p>
            </div>
            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <span className="text-xl font-bold text-gray-900">7</span>
              <span className="text-sm text-gray-500 ml-1">Checkos</span>
              <p className="text-sm font-medium text-gray-700 mt-1">Pro</p>
              <p className="text-xs text-gray-500">Maximale Qualität und Tiefe</p>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Alle Preise in CHF inkl. MwSt. Bezahlung via Stripe. Checkos sind nicht rückerstattbar.
        </p>
      </div>
    </main>
  );
}

export default function CheckosKaufSeite() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
          </div>
        }
      >
        <CheckosKaufContent />
      </Suspense>
      <Footer />
    </div>
  );
}
