// Preisradar Alerts — Feed mit Treffern
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

interface Alert {
  id: string;
  title: string;
  price: number;
  platform: string;
  url: string;
  imageUrl: string | null;
  priceScore: number | null;
  bewertung: string | null;
  warnung: string | null;
  isScam: boolean;
  isSeen: boolean;
  searchQuery: string;
  searchId: string;
  createdAt: string;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

const PLATFORM_NAMES: Record<string, string> = {
  tutti: "Tutti.ch",
  ricardo: "Ricardo.ch",
  "ebay-ka": "eBay Kleinanzeigen",
  autoscout: "AutoScout24.ch",
  comparis: "Comparis Auto",
};

function getScoreColor(score: number | null): string {
  if (score === null) return "bg-gray-100 text-gray-500";
  if (score >= 8) return "bg-emerald-100 text-emerald-700";
  if (score >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

function getScoreBorderColor(score: number | null): string {
  if (score === null) return "border-gray-200";
  if (score >= 8) return "border-emerald-300";
  if (score >= 5) return "border-yellow-300";
  return "border-red-300";
}

function getScoreLabel(score: number | null): string {
  if (score === null) return "–";
  return `${score}/10`;
}

export default function PreisradarAlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unseen">("all");
  const [page, setPage] = useState(1);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("limit", "20");
      if (filter === "unseen") params.set("unseen", "true");

      const res = await fetch(`/api/modules/preisradar/alerts?${params}`);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts);
        setPagination(data.pagination);
      }
    } catch {
      console.error("Fehler beim Laden der Alerts");
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      loadAlerts();
    }
  }, [status, router, loadAlerts]);

  const handleMarkAsSeen = async (alertId: string) => {
    try {
      const res = await fetch(`/api/modules/preisradar/alerts/${alertId}`, {
        method: "PUT",
      });

      if (res.ok) {
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? { ...a, isSeen: true } : a))
        );
      }
    } catch {
      console.error("Fehler beim Markieren");
    }
  };

  const formatPrice = (priceInRappen: number): string => {
    return `CHF ${(priceInRappen / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Laden...</div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
                  Dashboard
                </Link>
                <span className="text-gray-300">/</span>
                <Link href="/dashboard/preisradar" className="text-gray-400 hover:text-gray-600 text-sm">
                  Preisradar
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium text-sm">Treffer</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                🔔 Preisradar-Treffer
              </h1>
              {pagination && (
                <p className="text-gray-500 text-sm mt-1">{pagination.total} Treffer gefunden</p>
              )}
            </div>

            {/* Filter */}
            <div className="flex gap-2">
              <button
                onClick={() => { setFilter("all"); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => { setFilter("unseen"); setPage(1); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  filter === "unseen"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Ungelesen
              </button>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                  <div className="h-32 bg-gray-100 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : alerts.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl block mb-4">📭</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Keine Treffer</h2>
              <p className="text-gray-500 mb-6">
                {filter === "unseen"
                  ? "Alle Treffer wurden gelesen."
                  : "Noch keine Treffer gefunden. Die Suche wird automatisch wiederholt."}
              </p>
              <Link
                href="/dashboard/preisradar"
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                ← Zurück zu Suchen
              </Link>
            </div>
          ) : (
            <>
              {/* Alert-Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`bg-white rounded-xl border ${getScoreBorderColor(alert.priceScore)} ${
                      !alert.isSeen ? "ring-2 ring-emerald-200" : ""
                    } overflow-hidden hover:shadow-lg transition`}
                  >
                    {/* Bild */}
                    {alert.imageUrl && (
                      <div className="h-40 bg-gray-100 relative overflow-hidden">
                        <img
                          src={alert.imageUrl}
                          alt={alert.title}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = "none";
                          }}
                        />
                        {/* Score Badge oben rechts */}
                        <div className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold ${getScoreColor(alert.priceScore)}`}>
                          {getScoreLabel(alert.priceScore)}
                        </div>
                      </div>
                    )}

                    <div className="p-4">
                      {/* Plattform + Ungelesen-Badge */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500">
                          {PLATFORM_NAMES[alert.platform] || alert.platform}
                        </span>
                        {!alert.isSeen && (
                          <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        )}
                      </div>

                      {/* Titel */}
                      <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 text-sm">
                        {alert.title}
                      </h3>

                      {/* Preis + Score */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-lg font-bold text-gray-900">
                          {formatPrice(alert.price)}
                        </span>
                        {!alert.imageUrl && alert.priceScore !== null && (
                          <span className={`px-2 py-1 rounded-lg text-xs font-bold ${getScoreColor(alert.priceScore)}`}>
                            {getScoreLabel(alert.priceScore)}
                          </span>
                        )}
                      </div>

                      {/* KI-Bewertung */}
                      {alert.bewertung && (
                        <div className={`text-xs px-2 py-1.5 rounded-lg mb-2 ${getScoreColor(alert.priceScore)}`}>
                          <span className="font-medium">KI-Bewertung:</span> {alert.bewertung}
                        </div>
                      )}

                      {/* Warnung */}
                      {alert.warnung && (
                        <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1.5 rounded-lg mb-2">
                          ⚠️ {alert.warnung}
                        </div>
                      )}

                      {/* Scam-Warnung */}
                      {alert.isScam && (
                        <div className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 rounded-lg mb-2">
                          🚨 Verdacht auf Betrug!
                        </div>
                      )}

                      {/* Suche + Datum */}
                      <div className="text-xs text-gray-400 mb-3">
                        Suche: &ldquo;{alert.searchQuery}&rdquo; · {formatDate(alert.createdAt)}
                      </div>

                      {/* Aktionen */}
                      <div className="flex gap-2 pt-3 border-t border-gray-100">
                        <a
                          href={alert.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-xs py-2 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          🔗 Anzeige öffnen
                        </a>
                        {!alert.isSeen && (
                          <button
                            onClick={() => handleMarkAsSeen(alert.id)}
                            className="text-xs py-2 px-3 rounded-lg font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition"
                          >
                            ✓ Gelesen
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {pagination && pagination.totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 mt-8">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page <= 1}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                  >
                    ← Zurück
                  </button>
                  <span className="text-sm text-gray-500">
                    Seite {pagination.page} von {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                    disabled={page >= pagination.totalPages}
                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition"
                  >
                    Weiter →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
