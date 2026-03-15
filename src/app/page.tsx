// Landing Page — Checko
// Hero + Module Grid (alle 20 Module aus DB) + Pricing + CTA + Footer
// Login-aware CTAs: Eingeloggt → "Zum Dashboard" statt "Jetzt kostenlos starten"

import { Navbar } from "@/components/Navbar";
import { OrganizationJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { Footer } from "@/components/Footer";
import { GeckoLogo } from "@/components/GeckoLogo";
import { ModuleCard } from "@/components/ModuleCard";
import { PricingSection } from "@/components/PricingSection";
import { HeroCTA, BottomCTA } from "@/components/HeroCTA";
import { prisma } from "@/lib/prisma";

// Force dynamic rendering (needs DB access)
export const dynamic = "force-dynamic";

// Module type for DB and fallback
interface ModuleData {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  icon: string | null;
  isActive: boolean;
  status: string;
  sortOrder: number;
}

const DEMO_MODULES: ModuleData[] = [
  {
    id: "demo-1",
    slug: "preisradar",
    name: "Checko Preisradar",
    description:
      "Überwache Marktplätze automatisch und finde die besten Schnäppchen. Sofort-Benachrichtigung bei Treffern.",
    priceMonthly: 0,
    icon: "📡",
    isActive: true,
    status: "active",
    sortOrder: 1,
  },
  {
    id: "demo-2",
    slug: "scam-shield",
    name: "Checko Scam Shield",
    description:
      "Schütze dich vor Betrug auf Online-Marktplätzen. Automatische Erkennung verdächtiger Inserate.",
    priceMonthly: 0,
    icon: "🛡️",
    isActive: false,
    status: "coming_soon",
    sortOrder: 2,
  },
  {
    id: "demo-3",
    slug: "legal",
    name: "Checko Legal",
    description:
      "Kündigungen, Mahnungen und Rechtsbriefe automatisch erstellen. Rechtssicher und in Sekunden fertig.",
    priceMonthly: 0,
    icon: "⚖️",
    isActive: false,
    status: "coming_soon",
    sortOrder: 3,
  },
  {
    id: "demo-4",
    slug: "abo-killer",
    name: "Checko Abo-Killer",
    description:
      "Finde versteckte Abos in deinen Kontoauszügen und kündige sie mit einem Klick.",
    priceMonthly: 0,
    icon: "✂️",
    isActive: false,
    status: "coming_soon",
    sortOrder: 4,
  },
  {
    id: "demo-5",
    slug: "immo",
    name: "Checko Immo",
    description:
      "Wohnungs- und Haus-Überwachung. Sofort benachrichtigt bei neuen Inseraten, die zu deinen Kriterien passen.",
    priceMonthly: 0,
    icon: "🏠",
    isActive: false,
    status: "coming_soon",
    sortOrder: 5,
  },
  {
    id: "demo-6",
    slug: "kleingedrucktes",
    name: "Checko Kleingedrucktes",
    description:
      "AGB und Verträge analysieren lassen. Versteckte Klauseln und Risiken sofort erkennen.",
    priceMonthly: 0,
    icon: "🔍",
    isActive: false,
    status: "coming_soon",
    sortOrder: 6,
  },
];

async function getModules(): Promise<ModuleData[]> {
  try {
    const modules = await prisma.module.findMany({
      orderBy: [
        { isActive: "desc" }, // Aktive Module zuerst
        { sortOrder: "asc" },
      ],
    });
    if (modules.length > 0) {
      return modules.map((m) => ({
        ...m,
        status: m.status ?? "coming_soon",
      }));
    }
    return DEMO_MODULES;
  } catch {
    // DB not connected yet — use demo data
    return DEMO_MODULES;
  }
}

export default async function HomePage() {
  const modules = await getModules();
  const activeModules = modules.filter((m) => m.status === "active");
  const comingSoonModules = modules.filter((m) => m.status !== "active");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-20 lg:py-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col lg:flex-row items-center gap-10 lg:gap-16">
            {/* Text-Seite */}
            <div className="flex-1 text-center lg:text-left">
              <GeckoLogo className="w-24 h-24 mx-auto lg:mx-0 mb-6" />
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 mb-6 leading-tight">
                Checko — Dein Toolkit
                <br />
                <span className="text-emerald-600">für alles.</span>
              </h1>
              <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto lg:mx-0 mb-10">
                Smarte Module, die dir im Alltag Zeit und Geld sparen. Wähle nur die
                Tools, die du wirklich brauchst.
              </p>
              <HeroCTA />
            </div>
            {/* Gecko-Animation (A) */}
            <div className="flex-shrink-0 w-64 h-64 sm:w-80 sm:h-80 lg:w-96 lg:h-96 rounded-2xl overflow-hidden shadow-xl">
              <video
                autoPlay
                muted
                loop
                playsInline
                preload="metadata"
                className="w-full h-full object-cover"
              >
                <source src="/gecko-01.mp4" type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Active Modules */}
      <section id="module" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Unsere Module</h2>
            <p className="text-gray-600 max-w-2xl mx-auto">
              Jedes Modul löst ein konkretes Problem. Bezahle pro Nutzung mit Checkos —
              keine Abos, keine versteckten Kosten.
            </p>
          </div>

          {/* Aktive Module */}
          {activeModules.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
              {activeModules.map((mod) => (
                <ModuleCard
                  key={mod.id}
                  slug={mod.slug}
                  name={mod.name}
                  description={mod.description}
                  icon={mod.icon}
                  isActive={mod.isActive}
                  status={mod.status}
                />
              ))}
            </div>
          )}

          {/* Coming Soon Module */}
          {comingSoonModules.length > 0 && (
            <>
              <div className="text-center mb-8">
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  Demnächst verfügbar
                </h3>
                <p className="text-gray-500 text-sm">
                  Diese Module sind in Entwicklung. Lass dich benachrichtigen, wenn sie
                  live gehen.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {comingSoonModules.map((mod) => (
                  <ModuleCard
                    key={mod.id}
                    slug={mod.slug}
                    name={mod.name}
                    description={mod.description}
                    icon={mod.icon}
                    isActive={mod.isActive}
                    status={mod.status}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Pricing */}
      <PricingSection />

      {/* CTA Section */}
      <section className="py-20 bg-emerald-600">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Bereit loszulegen?</h2>
          <p className="text-emerald-100 text-lg mb-8">
            Erstelle dein kostenloses Konto und entdecke, was Checko für dich tun kann.
          </p>
          <BottomCTA />
        </div>
      </section>

      <Footer />
      <OrganizationJsonLd />
      <FaqJsonLd />
    </div>
  );
}
