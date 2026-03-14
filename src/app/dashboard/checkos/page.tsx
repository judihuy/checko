// Checkos Kaufseite — Schnellwahl + flexibler Betrag mit Mengenrabatt
"use client";

import { Suspense, useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

// ==================== PREISLOGIK ====================

// Mengenrabatt-Staffeln
const DISCOUNT_TIERS = [
  { min: 5, max: 19, discount: 0, pricePerChecko: 1.0 },
  { min: 20, max: 49, discount: 5, pricePerChecko: 0.95 },
  { min: 50, max: 99, discount: 10, pricePerChecko: 0.9 },
  { min: 100, max: Infinity, discount: 15, pricePerChecko: 0.85 },
];

function getDiscountTier(amount: number) {
  return DISCOUNT_TIERS.find((t) => amount >= t.min && amount <= t.max) || DISCOUNT_TIERS[0];
}

function calculatePrice(amount: number): {
  totalCHF: number;
  pricePerChecko: number;
  discountPercent: number;
  savingsCHF: number;
} {
  const tier = getDiscountTier(amount);
  const totalCHF = parseFloat((amount * tier.pricePerChecko).toFixed(2));
  const fullPrice = amount * 1.0; // Ohne Rabatt
  const savingsCHF = parseFloat((fullPrice - totalCHF).toFixed(2));
  return {
    totalCHF,
    pricePerChecko: tier.pricePerChecko,
    discountPercent: tier.discount,
    savingsCHF,
  };
}

// Schnellwahl-Vorschläge
const QUICK_AMOUNTS = [20, 50, 100];

const MIN_CHECKOS = 5;
const MAX_CHECKOS = 500;

function CheckosKaufContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [customAmount, setCustomAmount] = useState<number>(20);
  const [error, setError] = useState("");

  const checkoutCanceled = searchParams.get("checkout") === "canceled";

  // Live-Preisberechnung
  const pricing = useMemo(() => calculatePrice(customAmount), [customAmount]);

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

  const handleSliderChange = (value: number) => {
    setCustomAmount(value);
    setError("");
  };

  const handleInputChange = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    if (num < MIN_CHECKOS) {
      setCustomAmount(MIN_CHECKOS);
    } else if (num > MAX_CHECKOS) {
      setCustomAmount(MAX_CHECKOS);
    } else {
      setCustomAmount(num);
    }
    setError("");
  };

  const handleQuickSelect = (amount: number) => {
    setCustomAmount(amount);
    setError("");
  };

  const handleCheckout = () => {
    // Stripe noch nicht konfiguriert — Platzhalter
    setError("Bezahlung ist bald verfügbar! Stripe wird gerade eingerichtet.");
  };

  // Fortschrittsanzeige für Rabattstufe
  const getNextTierInfo = (): string | null => {
    if (customAmount < 20) {
      const needed = 20 - customAmount;
      return `Noch ${needed} Checkos mehr für 5% Rabatt!`;
    }
    if (customAmount < 50) {
      const needed = 50 - customAmount;
      return `Noch ${needed} Checkos mehr für 10% Rabatt!`;
    }
    if (customAmount < 100) {
      const needed = 100 - customAmount;
      return `Noch ${needed} Checkos mehr für 15% Rabatt!`;
    }
    return null;
  };

  const nextTierHint = getNextTierInfo();

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
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 text-yellow-700 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        {/* Schnellwahl-Buttons */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          {QUICK_AMOUNTS.map((amount) => {
            const p = calculatePrice(amount);
            const isSelected = customAmount === amount;
            return (
              <button
                key={amount}
                onClick={() => handleQuickSelect(amount)}
                className={`relative rounded-2xl p-5 text-center transition-all ${
                  isSelected
                    ? "bg-emerald-600 text-white shadow-xl ring-2 ring-emerald-600 ring-offset-2 scale-105"
                    : "bg-white border-2 border-gray-200 hover:border-emerald-300"
                }`}
              >
                {/* Beliebt Badge für 50 */}
                {amount === 50 && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
                    Beliebteste Wahl
                  </div>
                )}

                {/* Sparhinweis */}
                {p.discountPercent > 0 && (
                  <div
                    className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-2 ${
                      isSelected
                        ? "bg-emerald-500 text-white"
                        : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    Spare {p.discountPercent}%
                  </div>
                )}
                {p.discountPercent === 0 && <div className="h-5 mb-2" />}

                {/* Menge */}
                <div className="mb-1">
                  <span className="text-3xl font-bold">{amount}</span>
                </div>
                <p
                  className={`text-sm mb-1 ${
                    isSelected ? "text-emerald-100" : "text-gray-500"
                  }`}
                >
                  Checkos
                </p>

                {/* Preis */}
                <div className="my-3">
                  <span className="text-xl font-bold">CHF {p.totalCHF.toFixed(2)}</span>
                </div>
                <p
                  className={`text-xs ${
                    isSelected ? "text-emerald-200" : "text-gray-400"
                  }`}
                >
                  CHF {p.pricePerChecko.toFixed(2)} pro Checko
                </p>
              </button>
            );
          })}
        </div>

        {/* Flexibler Kauf — Slider + Input */}
        <div className="bg-white rounded-2xl border-2 border-gray-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-4 text-center">
            Eigenen Betrag wählen
          </h2>

          {/* Slider */}
          <div className="mb-4">
            <input
              type="range"
              min={MIN_CHECKOS}
              max={MAX_CHECKOS}
              step={1}
              value={customAmount}
              onChange={(e) => handleSliderChange(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{MIN_CHECKOS}</span>
              <span>50</span>
              <span>100</span>
              <span>200</span>
              <span>{MAX_CHECKOS}</span>
            </div>
          </div>

          {/* Number-Input */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => handleSliderChange(Math.max(MIN_CHECKOS, customAmount - 5))}
              className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center justify-center"
            >
              −
            </button>
            <div className="relative">
              <input
                type="number"
                min={MIN_CHECKOS}
                max={MAX_CHECKOS}
                value={customAmount}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-28 text-center text-2xl font-bold px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
                Checkos
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSliderChange(Math.min(MAX_CHECKOS, customAmount + 5))}
              className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center justify-center"
            >
              +
            </button>
          </div>

          {/* Rabatt-Staffeln */}
          <div className="grid grid-cols-4 gap-1 mb-6 mt-8">
            {DISCOUNT_TIERS.map((tier) => {
              const isActive = customAmount >= tier.min && customAmount <= tier.max;
              return (
                <div
                  key={tier.min}
                  className={`text-center py-2 px-1 rounded-lg text-xs transition ${
                    isActive
                      ? "bg-emerald-100 border border-emerald-300 text-emerald-800 font-semibold"
                      : "bg-gray-50 text-gray-500"
                  }`}
                >
                  <div className="font-medium">
                    {tier.min}–{tier.max === Infinity ? "∞" : tier.max}
                  </div>
                  <div>{tier.discount > 0 ? `${tier.discount}% Rabatt` : "Kein Rabatt"}</div>
                  <div className="text-xs opacity-75">CHF {tier.pricePerChecko.toFixed(2)}</div>
                </div>
              );
            })}
          </div>

          {/* Live-Preisanzeige */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
            <div className="text-2xl font-bold text-emerald-800 mb-1">
              {customAmount} Checkos für CHF {pricing.totalCHF.toFixed(2)}
            </div>
            <div className="text-sm text-emerald-600">
              CHF {pricing.pricePerChecko.toFixed(2)} pro Checko
              {pricing.discountPercent > 0 && (
                <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-200 text-emerald-800 text-xs font-semibold">
                  −{pricing.discountPercent}%
                </span>
              )}
            </div>
            {pricing.savingsCHF > 0 && (
              <div className="text-sm font-semibold text-emerald-700 mt-2">
                🎉 Du sparst CHF {pricing.savingsCHF.toFixed(2)}!
              </div>
            )}
            {nextTierHint && (
              <div className="text-xs text-emerald-600 mt-2 pt-2 border-t border-emerald-200">
                💡 {nextTierHint}
              </div>
            )}
          </div>

          {/* Checkout-Button */}
          <button
            onClick={handleCheckout}
            className="w-full mt-4 py-3.5 bg-emerald-600 text-white rounded-xl font-semibold text-lg hover:bg-emerald-700 transition"
          >
            🦎 {customAmount} Checkos kaufen — CHF {pricing.totalCHF.toFixed(2)}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            Bezahlung via Stripe — bald verfügbar
          </p>
        </div>

        {/* Info */}
        <div className="bg-gray-50 rounded-xl p-6 text-center">
          <h3 className="font-semibold text-gray-900 mb-2">So funktionieren Checkos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-gray-600">
            <div>
              <span className="text-2xl block mb-1">🪙</span>
              <strong>Kaufen</strong>
              <p>Wähle deinen Betrag und bezahle sicher mit Stripe.</p>
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
            <div className="text-center p-4 bg-blue-50 rounded-lg border border-blue-200">
              <span className="text-xl font-bold text-blue-700">4</span>
              <span className="text-sm text-blue-600 ml-1">Checkos</span>
              <p className="text-sm font-medium text-blue-700 mt-1">Premium</p>
              <p className="text-xs text-blue-600">Bessere Qualität</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg border border-purple-200">
              <span className="text-xl font-bold text-purple-700">7</span>
              <span className="text-sm text-purple-600 ml-1">Checkos</span>
              <p className="text-sm font-medium text-purple-700 mt-1">Pro</p>
              <p className="text-xs text-purple-600">Maximale Qualität</p>
            </div>
          </div>
          <p className="text-center text-xs text-gray-400 mt-3">
            Beispiel Preisradar: 1 Tag Standard = 2 Checkos, 1 Tag Premium = 4 Checkos, 1 Tag Pro = 7 Checkos
          </p>
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
