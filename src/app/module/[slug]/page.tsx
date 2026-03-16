// Modul-Detailseite — /module/[slug]
// Zeigt Modul-Info, Preise, und Waitlist für coming_soon Module

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { ProductJsonLd } from "@/components/JsonLd";
import { prisma } from "@/lib/prisma";
import { WaitlistForm } from "./WaitlistForm";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ slug: string }>;
}

// Dynamische Meta-Tags pro Modul
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const mod = await prisma.module.findFirst({ where: { slug } }).catch(() => null);

  if (!mod) {
    return { title: "Modul nicht gefunden — Checko" };
  }

  const title = `${mod.name} — ${mod.description.substring(0, 60)} | checko.ch`;
  const description = mod.description;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://checko.ch/module/${mod.slug}`,
      siteName: "Checko",
      type: "website",
      locale: "de_CH",
    },
  };
}

const STATUS_INFO: Record<string, { label: string; color: string; bgColor: string }> = {
  active: { label: "Verfügbar", color: "text-emerald-700", bgColor: "bg-emerald-100" },
  coming_soon: { label: "Demnächst", color: "text-amber-700", bgColor: "bg-amber-100" },
  beta: { label: "Beta", color: "text-blue-700", bgColor: "bg-blue-100" },
  maintenance: { label: "Wartung", color: "text-red-700", bgColor: "bg-red-100" },
};

const PRICING_TIERS = [
  {
    name: "Standard",
    checkos: 2,
    description: "Basis-Analyse mit bewährtem Modell",
    features: ["Grundlegende Analyse", "Ergebnisse in Sekunden", "Standardqualität"],
    highlight: false,
  },
  {
    name: "Premium",
    checkos: 4,
    description: "Erweiterte Analyse mit fortschrittlichem Modell",
    features: [
      "Tiefgehende Analyse",
      "Höhere Genauigkeit",
      "Detaillierte Auswertung",
      "Prioritätsverarbeitung",
    ],
    highlight: true,
  },
  {
    name: "Pro",
    checkos: 7,
    description: "Maximale Qualität mit dem besten verfügbaren Modell",
    features: [
      "Höchste Qualitätsstufe",
      "Höchste Genauigkeit",
      "Umfassende Analyse",
      "Prioritätsverarbeitung",
      "Erweiterte Ergebnisse",
    ],
    highlight: false,
  },
];

/**
 * Gecko-Video-Index basierend auf sortOrder.
 * Es gibt gecko-01.mp4 bis gecko-21.mp4.
 * Falls sortOrder > 21: Modulo-Berechnung.
 */
function getGeckoVideoIndex(sortOrder: number): string {
  const index = sortOrder <= 0 ? 1 : sortOrder > 21 ? ((sortOrder - 1) % 21) + 1 : sortOrder;
  return String(index).padStart(2, "0");
}

export default async function ModuleDetailPage({ params }: PageProps) {
  const { slug } = await params;

  let moduleData;
  try {
    moduleData = await prisma.module.findFirst({
      where: { slug },
    });
  } catch {
    // DB nicht erreichbar — 404
  }

  if (!moduleData) {
    notFound();
  }

  const statusInfo = STATUS_INFO[moduleData.status] || STATUS_INFO.coming_soon;
  const isActive = moduleData.status === "active";
  const isComingSoon = moduleData.status === "coming_soon";

  return (
    <div className="min-h-screen flex flex-col">
      <ProductJsonLd
        name={moduleData.name}
        description={moduleData.description}
        url={`https://checko.ch/module/${moduleData.slug}`}
      />
      <Navbar />

      {/* Header */}
      <section className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link
            href="/#module"
            className="inline-flex items-center text-sm text-gray-500 hover:text-emerald-600 transition mb-8"
          >
            ← Alle Module
          </Link>

          <div className="flex items-start gap-4">
            <div className="text-5xl">{moduleData.icon || "🔧"}</div>
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">
                  {moduleData.name}
                </h1>
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${statusInfo.bgColor} ${statusInfo.color}`}
                >
                  {statusInfo.label}
                </span>
              </div>
              <p className="text-lg text-gray-600 leading-relaxed max-w-2xl">
                {moduleData.description}
              </p>
            </div>
          </div>

          {/* CTA Button */}
          <div className="mt-8">
            {isActive ? (
              <Link
                href={`/dashboard/${slug}`}
                className="inline-block bg-emerald-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
              >
                Jetzt nutzen →
              </Link>
            ) : isComingSoon ? (
              <div className="flex items-start gap-6">
                <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-md">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Benachrichtige mich
                  </h3>
                  <p className="text-sm text-gray-500 mb-4">
                    Erhalte eine E-Mail, sobald dieses Modul verfügbar ist.
                  </p>
                  <WaitlistForm moduleId={moduleData.id} moduleName={moduleData.name} />
                </div>
                {/* Gecko-Animation — jedes Modul bekommt ein eigenes Video basierend auf sortOrder */}
                <div className="hidden md:block w-32 h-32 rounded-xl overflow-hidden shadow-md flex-shrink-0">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    src={`/gecko-${getGeckoVideoIndex(moduleData.sortOrder)}.mp4`}
                  />
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 max-w-md">
                <p className="text-amber-700 text-sm">
                  Dieses Modul ist aktuell in Wartung. Bitte versuche es später erneut.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="py-16 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Qualitätsstufen & Preise
            </h2>
            <p className="text-gray-600">
              Wähle die Qualitätsstufe, die zu deinem Bedarf passt. Bezahle pro Nutzung
              mit Checkos.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PRICING_TIERS.map((tier) => (
              <div
                key={tier.name}
                className={`relative rounded-xl border p-6 ${
                  tier.highlight
                    ? "border-emerald-300 bg-emerald-50 shadow-lg"
                    : "border-gray-200 bg-white"
                }`}
              >
                {tier.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="bg-emerald-600 text-white text-xs font-medium px-3 py-1 rounded-full">
                      Beliebteste Wahl
                    </span>
                  </div>
                )}

                <h3 className="text-lg font-semibold text-gray-900 mb-1">
                  {tier.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">{tier.description}</p>

                <div className="flex items-baseline gap-1 mb-6">
                  <span className="text-3xl font-bold text-gray-900">
                    {tier.checkos}
                  </span>
                  <span className="text-gray-500">Checkos</span>
                  <span className="text-gray-400 text-sm ml-1">/ Nutzung</span>
                </div>

                <ul className="space-y-2 mb-6">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm">
                      <span className="text-emerald-500 mt-0.5">✓</span>
                      <span className="text-gray-600">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isActive ? (
                  <Link
                    href={`/dashboard/${slug}`}
                    className={`block text-center py-2.5 rounded-lg font-medium transition text-sm ${
                      tier.highlight
                        ? "bg-emerald-600 text-white hover:bg-emerald-700"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {tier.name} wählen
                  </Link>
                ) : (
                  <div className="block text-center py-2.5 rounded-lg font-medium text-sm bg-gray-100 text-gray-400 cursor-not-allowed">
                    Bald verfügbar
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}
