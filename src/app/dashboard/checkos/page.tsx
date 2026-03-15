// Checkos Kaufseite — 4 feste Pakete + Slider mit dynamischem Preis
// Preis-Staffelung: 1-49=1.00CHF, 50-99=0.90, 100-249=0.85, 250+=0.80
"use client";

import { Suspense, useState, useMemo, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

// ==================== PREISLOGIK (muss mit Server übereinstimmen) ====================

const PRICE_TIERS = [
  { min: 1, max: 49, pricePerChecko: 1.0, discountPercent: 0 },
  { min: 50, max: 99, pricePerChecko: 0.9, discountPercent: 10 },
  { min: 100, max: 249, pricePerChecko: 0.85, discountPercent: 15 },
  { min: 250, max: Infinity, pricePerChecko: 0.8, discountPercent: 20 },
];

function getPriceTier(amount: number) {
  return PRICE_TIERS.find((t) => amount >= t.min && amount <= t.max) || PRICE_TIERS[0];
}

function calculatePrice(amount: number) {
  const tier = getPriceTier(amount);
  const totalCHF = parseFloat((amount * tier.pricePerChecko).toFixed(2));
  const fullPrice = amount * 1.0;
  const savingsCHF = parseFloat((fullPrice - totalCHF).toFixed(2));
  return {
    totalCHF,
    pricePerChecko: tier.pricePerChecko,
    discountPercent: tier.discountPercent,
    savingsCHF,
  };
}

// ==================== FESTE PAKETE ====================

const FIXED_PACKAGES = [
  {
    checkos: 20,
    priceId: "price_1TBA0mDu7PSxvnovrngeJBlq",
    totalCHF: 20.0,
    pricePerChecko: 1.0,
    discountPercent: 0,
    savingsCHF: 0,
    popular: false,
    emoji: "🦎",
  },
  {
    checkos: 50,
    priceId: "price_1TBA19Du7PSxvnovj3OaduIm",
    totalCHF: 45.0,
    pricePerChecko: 0.9,
    discountPercent: 10,
    savingsCHF: 5.0,
    popular: true,
    emoji: "🔥",
  },
  {
    checkos: 100,
    priceId: "price_1TBA1IDu7PSxvnovyfotwnT5",
    totalCHF: 85.0,
    pricePerChecko: 0.85,
    discountPercent: 15,
    savingsCHF: 15.0,
    popular: false,
    emoji: "⚡",
  },
  {
    checkos: 250,
    priceId: "price_1TBA1JDu7PSxvnovEKMNnI4R",
    totalCHF: 200.0,
    pricePerChecko: 0.8,
    discountPercent: 20,
    savingsCHF: 50.0,
    popular: false,
    emoji: "💎",
  },
];

const MIN_CHECKOS = 10;
const MAX_CHECKOS = 500;

// ==================== KONFETTI ====================

function ConfettiEffect() {
  const colors = [
    "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#8b5cf6",
    "#ec4899", "#14b8a6", "#f97316", "#06b6d4", "#84cc16",
  ];

  const particles = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    x: Math.random() * 100,
    y: -10 - Math.random() * 20,
    color: colors[i % colors.length],
    rotation: Math.random() * 360,
    scale: 0.5 + Math.random() * 1,
    delay: Math.random() * 0.8,
    duration: 2 + Math.random() * 2.5,
    shape: Math.random() > 0.5 ? "rect" : "circle",
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute animate-confetti-fall"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        >
          <div
            className={p.shape === "circle" ? "w-3 h-3 rounded-full" : "w-3 h-3 rounded-sm"}
            style={{
              backgroundColor: p.color,
              transform: `rotate(${p.rotation}deg) scale(${p.scale})`,
            }}
          />
        </div>
      ))}
    </div>
  );
}

// ==================== HAUPTKOMPONENTE ====================

function CheckosKaufContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sliderAmount, setSliderAmount] = useState<number>(50);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const isSuccess = searchParams.get("success") === "true";
  const isCanceled = searchParams.get("canceled") === "true";

  // Konfetti bei Erfolg
  useEffect(() => {
    if (isSuccess) {
      setShowConfetti(true);
      setSuccessMessage("🎉 Checkos erfolgreich gekauft! Dein Guthaben wurde aufgeladen.");
      const timer = setTimeout(() => setShowConfetti(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [isSuccess]);

  // Live-Preisberechnung für Slider
  const pricing = useMemo(() => calculatePrice(sliderAmount), [sliderAmount]);

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

  // Stripe Checkout starten
  const handleCheckout = useCallback(async (checkos: number, priceId?: string) => {
    if (purchasing) return;
    setPurchasing(true);
    setError("");

    try {
      const body: { checkos: number; priceId?: string } = { checkos };
      if (priceId) body.priceId = priceId;

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Fehler beim Erstellen der Checkout-Session");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      } else {
        setError("Keine Checkout-URL erhalten");
      }
    } catch {
      setError("Netzwerkfehler. Bitte versuche es erneut.");
    } finally {
      setPurchasing(false);
    }
  }, [purchasing]);

  const handleSliderChange = (value: number) => {
    setSliderAmount(value);
    setError("");
  };

  const handleInputChange = (value: string) => {
    const num = parseInt(value, 10);
    if (isNaN(num)) return;
    const clamped = Math.max(MIN_CHECKOS, Math.min(MAX_CHECKOS, num));
    setSliderAmount(clamped);
    setError("");
  };

  // Nächste Rabattstufe Info
  const getNextTierInfo = (): string | null => {
    if (sliderAmount < 50) {
      const needed = 50 - sliderAmount;
      return `Noch ${needed} Checkos mehr für 10% Rabatt!`;
    }
    if (sliderAmount < 100) {
      const needed = 100 - sliderAmount;
      return `Noch ${needed} Checkos mehr für 15% Rabatt!`;
    }
    if (sliderAmount < 250) {
      const needed = 250 - sliderAmount;
      return `Noch ${needed} Checkos mehr für 20% Rabatt!`;
    }
    return null;
  };

  const nextTierHint = getNextTierInfo();

  return (
    <main className="flex-1 py-12">
      {showConfetti && <ConfettiEffect />}

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

        {/* Erfolgsmeldung */}
        {successMessage && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm text-center font-medium">
            {successMessage}
          </div>
        )}

        {/* Checkout abgebrochen */}
        {isCanceled && (
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

        {/* ==================== 4 PAKET-CARDS ==================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {FIXED_PACKAGES.map((pkg) => (
            <button
              key={pkg.checkos}
              onClick={() => handleCheckout(pkg.checkos, pkg.priceId)}
              disabled={purchasing}
              className={`relative rounded-2xl p-5 text-center transition-all duration-200 cursor-pointer
                ${purchasing ? "opacity-50 cursor-not-allowed" : "hover:scale-105 hover:shadow-xl"}
                ${pkg.popular
                  ? "bg-gradient-to-br from-emerald-50 to-emerald-100 border-2 border-emerald-400 shadow-lg"
                  : "bg-white border-2 border-gray-200 hover:border-emerald-300"
                }
              `}
            >
              {/* Beliebt Badge */}
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-600 text-white text-xs px-3 py-1 rounded-full font-medium whitespace-nowrap">
                  🔥 Beliebt
                </div>
              )}

              {/* Emoji */}
              <div className="text-3xl mb-2">{pkg.emoji}</div>

              {/* Menge */}
              <div className="mb-1">
                <span className="text-3xl font-bold text-gray-900">{pkg.checkos}</span>
              </div>
              <p className="text-sm text-gray-500 mb-3">Checkos</p>

              {/* Preis */}
              <div className="mb-2">
                <span className="text-xl font-bold text-gray-900">
                  CHF {pkg.totalCHF.toFixed(2)}
                </span>
              </div>

              {/* Pro Stück */}
              <p className="text-xs text-gray-400 mb-1">
                CHF {pkg.pricePerChecko.toFixed(2)} / Stück
              </p>

              {/* Rabatt */}
              {pkg.discountPercent > 0 && (
                <span className="inline-block text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                  −{pkg.discountPercent}% · Spare CHF {pkg.savingsCHF.toFixed(2)}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ==================== SLIDER — Eigene Menge ==================== */}
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
              value={sliderAmount}
              onChange={(e) => handleSliderChange(parseInt(e.target.value, 10))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <div className="flex justify-between text-xs text-gray-400 mt-1">
              <span>{MIN_CHECKOS}</span>
              <span>50</span>
              <span>100</span>
              <span>250</span>
              <span>{MAX_CHECKOS}</span>
            </div>
          </div>

          {/* Number-Input */}
          <div className="flex items-center justify-center gap-3 mb-4">
            <button
              type="button"
              onClick={() => handleSliderChange(Math.max(MIN_CHECKOS, sliderAmount - 5))}
              className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center justify-center"
            >
              −
            </button>
            <div className="relative">
              <input
                type="number"
                min={MIN_CHECKOS}
                max={MAX_CHECKOS}
                value={sliderAmount}
                onChange={(e) => handleInputChange(e.target.value)}
                className="w-28 text-center text-2xl font-bold px-3 py-2 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-400 whitespace-nowrap">
                Checkos
              </span>
            </div>
            <button
              type="button"
              onClick={() => handleSliderChange(Math.min(MAX_CHECKOS, sliderAmount + 5))}
              className="w-10 h-10 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold transition flex items-center justify-center"
            >
              +
            </button>
          </div>

          {/* Rabatt-Staffeln */}
          <div className="grid grid-cols-4 gap-1 mb-6 mt-8">
            {PRICE_TIERS.map((tier) => {
              const isActive = sliderAmount >= tier.min && sliderAmount <= tier.max;
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
                    {tier.min}–{tier.max === Infinity ? "500+" : tier.max}
                  </div>
                  <div>
                    {tier.discountPercent > 0
                      ? `${tier.discountPercent}% Rabatt`
                      : "Kein Rabatt"}
                  </div>
                  <div className="text-xs opacity-75">
                    CHF {tier.pricePerChecko.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Live-Preisanzeige */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
            <div className="text-2xl font-bold text-emerald-800 mb-1">
              {sliderAmount} Checkos für CHF {pricing.totalCHF.toFixed(2)}
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

          {/* Kaufen-Button */}
          <button
            onClick={() => handleCheckout(sliderAmount)}
            disabled={purchasing}
            className={`w-full mt-4 py-3.5 rounded-xl font-semibold text-lg transition
              ${purchasing
                ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                : "bg-emerald-600 text-white hover:bg-emerald-700"
              }
            `}
          >
            {purchasing
              ? "⏳ Wird vorbereitet..."
              : `🦎 ${sliderAmount} Checkos kaufen — CHF ${pricing.totalCHF.toFixed(2)}`}
          </button>
          <p className="text-center text-xs text-gray-400 mt-2">
            Sichere Bezahlung via Stripe · CHF · Kein Abo
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
            Beispiel Preisradar: 1 Tag Standard = 2 Checkos, 1 Tag Premium = 4 Checkos, 1 Tag
            Pro = 7 Checkos
          </p>
        </div>

        <p className="text-center text-gray-400 text-xs mt-6">
          Alle Preise in CHF inkl. MwSt. Bezahlung via Stripe. Checkos sind nicht
          rückerstattbar.
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
