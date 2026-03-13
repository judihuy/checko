// User Dashboard — Checkos-Kontostand, Module, Transaktionen, Daily Wheel, Referral
// Force dynamic rendering (needs session + DB)
export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getBalance, getTransactions } from "@/lib/checkos";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { DailyWheelWidgetWrapper } from "@/components/DailyWheelWidgetWrapper";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  let balance = 0;
  let transactions: {
    id: string;
    amount: number;
    type: string;
    description: string | null;
    moduleSlug: string | null;
    qualityTier: string | null;
    createdAt: Date;
  }[] = [];
  let activeModules: {
    slug: string;
    name: string;
    description: string;
    icon: string | null;
  }[] = [];

  try {
    balance = await getBalance(session.user.id);
    transactions = await getTransactions(session.user.id, 10);

    // Aktive Module laden (die User tatsächlich nutzen kann)
    const modules = await prisma.module.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, description: true, icon: true },
      orderBy: { sortOrder: "asc" },
    });
    activeModules = modules;
  } catch {
    // DB not connected — show empty state
  }

  // Transaktions-Typ Label
  function getTypeLabel(type: string): string {
    switch (type) {
      case "purchase":
        return "Kauf";
      case "usage":
        return "Verbrauch";
      case "gift":
        return "Geschenk";
      case "referral":
        return "Empfehlung";
      case "welcome":
        return "Willkommen";
      case "wheel":
        return "Glücksrad";
      case "daily_wheel":
        return "Tägliches Rad";
      case "affiliate":
        return "Provision";
      default:
        return type;
    }
  }

  // Transaktions-Typ Farbe
  function getTypeColor(amount: number): string {
    return amount >= 0
      ? "text-emerald-600"
      : "text-red-500";
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              Hallo, {session.user.name || "Benutzer"} 👋
            </h1>
            <p className="text-gray-600 mt-1">Willkommen in deinem Checko Dashboard.</p>
          </div>

          {/* Checkos Balance Widget */}
          <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 sm:p-8 mb-8 text-white shadow-lg">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-emerald-100 text-sm font-medium mb-1">Dein Checkos-Guthaben</p>
                <div className="flex items-center gap-3">
                  <span className="text-4xl">🦎</span>
                  <span className="text-4xl sm:text-5xl font-bold">{balance}</span>
                  <span className="text-xl text-emerald-100">Checkos</span>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                <Link
                  href="/dashboard/checkos"
                  className="bg-white text-emerald-700 px-6 py-3 rounded-lg font-semibold hover:bg-emerald-50 transition shadow-md text-center"
                >
                  🪙 Checkos aufladen
                </Link>
                <Link
                  href="/dashboard/referral"
                  className="bg-emerald-400/30 text-white border border-white/30 px-6 py-3 rounded-lg font-semibold hover:bg-emerald-400/50 transition text-center"
                >
                  🤝 Freunde einladen
                </Link>
              </div>
            </div>
          </div>

          {/* Daily Wheel Widget */}
          <div className="mb-8">
            <DailyWheelWidgetWrapper />
          </div>

          {/* Module & Transactions Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Aktive Module */}
            <div className="lg:col-span-2">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Verfügbare Module</h2>
              {activeModules.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeModules.map((mod) => (
                    <Link
                      key={mod.slug}
                      href={`/dashboard/${mod.slug}`}
                      className="group block"
                    >
                      <div className="bg-white rounded-xl border border-gray-200 p-5 h-full transition-all hover:shadow-lg hover:border-emerald-300">
                        <div className="flex items-start gap-3 mb-3">
                          <span className="text-2xl">{mod.icon || "🔧"}</span>
                          <div>
                            <h3 className="font-semibold text-gray-900 group-hover:text-emerald-700 transition">
                              {mod.name}
                            </h3>
                            <p className="text-gray-500 text-sm line-clamp-2 mt-1">
                              {mod.description}
                            </p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
                  <span className="text-4xl block mb-3">📦</span>
                  <p className="text-gray-500">Noch keine Module verfügbar.</p>
                  <Link
                    href="/#module"
                    className="inline-block mt-4 text-emerald-600 hover:text-emerald-700 font-medium"
                  >
                    Module entdecken →
                  </Link>
                </div>
              )}
            </div>

            {/* Letzte Transaktionen */}
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Letzte Transaktionen</h2>
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {transactions.length > 0 ? (
                  <div className="divide-y divide-gray-100">
                    {transactions.map((tx) => (
                      <div key={tx.id} className="px-4 py-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <span className="text-sm font-medium text-gray-900">
                              {getTypeLabel(tx.type)}
                            </span>
                            {tx.description && (
                              <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                                {tx.description}
                              </p>
                            )}
                          </div>
                          <span className={`text-sm font-bold ${getTypeColor(tx.amount)}`}>
                            {tx.amount > 0 ? "+" : ""}
                            {tx.amount}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(tx.createdAt).toLocaleDateString("de-CH", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-8 text-center">
                    <span className="text-3xl block mb-2">📋</span>
                    <p className="text-gray-500 text-sm">Noch keine Transaktionen.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
