// Admin Preisradar — Scraper-Status, aktive Suchen, Feature-Verwaltung
export const dynamic = "force-dynamic";

import { prisma } from "@/lib/prisma";
import { getAllScrapers } from "@/lib/scraper";
import Link from "next/link";
import { getPlatformDisplayName } from "@/lib/platform-names";

async function getPreisradarStats() {
  try {
    const [
      totalSearches,
      activeSearches,
      totalAlerts,
      unseenAlerts,
      recentAlerts,
    ] = await Promise.all([
      prisma.preisradarSearch.count(),
      prisma.preisradarSearch.count({ where: { isActive: true } }),
      prisma.preisradarAlert.count(),
      prisma.preisradarAlert.count({ where: { isSeen: false } }),
      prisma.preisradarAlert.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          title: true,
          price: true,
          platform: true,
          priceScore: true,
          isScam: true,
          createdAt: true,
          search: {
            select: { query: true, user: { select: { name: true, email: true } } },
          },
        },
      }),
    ]);

    // Letzte Scraper-Läufe (anhand der lastScrapedAt Felder)
    const lastScraped = await prisma.preisradarSearch.findMany({
      where: { lastScrapedAt: { not: null } },
      orderBy: { lastScrapedAt: "desc" },
      take: 5,
      select: {
        query: true,
        platforms: true,
        lastScrapedAt: true,
        user: { select: { name: true } },
      },
    });

    return {
      totalSearches,
      activeSearches,
      totalAlerts,
      unseenAlerts,
      recentAlerts,
      lastScraped,
    };
  } catch {
    return {
      totalSearches: 0,
      activeSearches: 0,
      totalAlerts: 0,
      unseenAlerts: 0,
      recentAlerts: [],
      lastScraped: [],
    };
  }
}



function getScoreColor(score: string | null): string {
  if (!score) return "text-gray-400";
  const num = parseInt(score, 10);
  if (num >= 8) return "text-emerald-600";
  if (num >= 5) return "text-yellow-600";
  return "text-red-600";
}

export default async function AdminPreisradarPage() {
  const stats = await getPreisradarStats();
  const scrapers = getAllScrapers();

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">📡 Preisradar Admin</h1>
        <Link
          href="/admin"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Zurück zum Dashboard
        </Link>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <span className="text-2xl">🔍</span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.totalSearches}</p>
          <p className="text-sm text-gray-500">Suchen gesamt</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <span className="text-2xl">✅</span>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{stats.activeSearches}</p>
          <p className="text-sm text-gray-500">Aktive Suchen</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <span className="text-2xl">🔔</span>
          <p className="text-2xl font-bold text-gray-900 mt-2">{stats.totalAlerts}</p>
          <p className="text-sm text-gray-500">Treffer gesamt</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <span className="text-2xl">📩</span>
          <p className="text-2xl font-bold text-amber-600 mt-2">{stats.unseenAlerts}</p>
          <p className="text-sm text-gray-500">Ungelesene Treffer</p>
        </div>
      </div>

      {/* Scraper-Status */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Scraper-Status</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {scrapers.map((scraper) => (
            <div
              key={scraper.platform}
              className="flex items-center justify-between border border-gray-100 rounded-lg p-4"
            >
              <div>
                <p className="font-medium text-gray-900">{scraper.displayName}</p>
                <p className="text-xs text-gray-500">{scraper.baseUrl}</p>
              </div>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                ● Bereit
              </span>
            </div>
          ))}
        </div>
        <p className="text-xs text-gray-400 mt-3">
          Rate-Limit: 1 Request / 5 Sek. pro Plattform • Proxy: {process.env.SCRAPER_PROXY ? "Konfiguriert ✅" : "Nicht konfiguriert"}
        </p>
      </div>

      {/* Letzte Scraper-Läufe */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Letzte Scraper-Läufe</h2>
        {stats.lastScraped.length > 0 ? (
          <div className="space-y-3">
            {stats.lastScraped.map((run, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-3 last:border-0">
                <span className="text-gray-400 shrink-0 w-36">
                  {run.lastScrapedAt
                    ? new Date(run.lastScrapedAt).toLocaleString("de-CH")
                    : "–"}
                </span>
                <span className="font-medium text-gray-700">
                  &ldquo;{run.query}&rdquo;
                </span>
                <span className="text-gray-400">
                  ({run.platforms.split(",").map((p) => getPlatformDisplayName(p)).join(", ")})
                </span>
                <span className="text-gray-500 ml-auto text-xs">
                  von {run.user.name || "User"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Noch keine Scraper-Läufe.</p>
        )}
      </div>

      {/* Letzte Treffer */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Letzte Treffer</h2>
        {stats.recentAlerts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Titel</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Preis</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Plattform</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Score</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Suche</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">User</th>
                  <th className="text-left py-2 px-3 font-medium text-gray-500">Datum</th>
                </tr>
              </thead>
              <tbody>
                {stats.recentAlerts.map((alert) => (
                  <tr key={alert.id} className="border-b border-gray-50">
                    <td className="py-2 px-3 max-w-[200px] truncate">
                      {alert.isScam && <span className="text-red-500 mr-1">🚨</span>}
                      {alert.title}
                    </td>
                    <td className="py-2 px-3 font-medium">
                      CHF {(alert.price / 100).toFixed(2)}
                    </td>
                    <td className="py-2 px-3">
                      {PLATFORM_NAMES[alert.platform] || alert.platform}
                    </td>
                    <td className={`py-2 px-3 font-bold ${getScoreColor(alert.priceScore)}`}>
                      {alert.priceScore || "–"}
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      &ldquo;{alert.search.query}&rdquo;
                    </td>
                    <td className="py-2 px-3 text-gray-500">
                      {alert.search.user.name || alert.search.user.email}
                    </td>
                    <td className="py-2 px-3 text-gray-400">
                      {new Date(alert.createdAt).toLocaleDateString("de-CH")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-500 text-sm">Noch keine Treffer vorhanden.</p>
        )}
      </div>
    </div>
  );
}
