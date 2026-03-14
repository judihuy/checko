// Preisradar Alerts — Feed mit Treffern
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

// Bookmark-Icon Komponente
function BookmarkIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <svg
      className={className || "w-5 h-5"}
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      viewBox="0 0 24 24"
      strokeWidth={filled ? 0 : 2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"
      />
    </svg>
  );
}

interface DetailAnalysis {
  preisbewertung: string;
  besonderheiten: string;
  kaeuferhinweise: string;
  verhandlungspotenzial: string;
  scamRisiko: number;
  empfehlung: string;
  zusammenfassung: string;
}

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
  details: string | null;
  isScam: boolean;
  isSeen: boolean;
  searchQuery: string;
  searchId: string;
  createdAt: string;
  detailAnalysis: DetailAnalysis | null;
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

function getEmpfehlungColor(empfehlung: string): string {
  if (empfehlung === "Kaufen") return "bg-emerald-100 text-emerald-700";
  if (empfehlung === "Verhandeln") return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function PreisradarAlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "unseen">("all");
  const [page, setPage] = useState(1);
  const [analyzingIds, setAnalyzingIds] = useState<Set<string>>(new Set());
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [analyzeErrors, setAnalyzeErrors] = useState<Record<string, string>>({});
  const [savedAlertIds, setSavedAlertIds] = useState<Set<string>>(new Set());
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());

  // Gespeicherte Alerts laden
  const loadSavedAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/preisradar/saved");
      if (res.ok) {
        const data = await res.json();
        const ids = new Set<string>(data.saved.map((s: { alertId: string }) => s.alertId));
        setSavedAlertIds(ids);
      }
    } catch {
      // Fehlerbehandlung
    }
  }, []);

  // Alert speichern/entfernen togglen
  const handleToggleSave = async (alertId: string) => {
    setSavingIds((prev) => new Set(prev).add(alertId));
    try {
      if (savedAlertIds.has(alertId)) {
        // Gespeichertes finden und löschen
        const savedRes = await fetch("/api/modules/preisradar/saved");
        if (savedRes.ok) {
          const savedData = await savedRes.json();
          const saved = savedData.saved.find((s: { alertId: string }) => s.alertId === alertId);
          if (saved) {
            await fetch(`/api/modules/preisradar/saved/${saved.id}`, { method: "DELETE" });
          }
        }
        setSavedAlertIds((prev) => {
          const next = new Set(prev);
          next.delete(alertId);
          return next;
        });
      } else {
        // Alert speichern
        const res = await fetch("/api/modules/preisradar/saved", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ alertId }),
        });
        if (res.ok || res.status === 409) {
          setSavedAlertIds((prev) => new Set(prev).add(alertId));
        }
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
    }
  };

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
      loadSavedAlerts();
    }
  }, [status, router, loadAlerts, loadSavedAlerts]);

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

  const handleDetailAnalyze = async (alertId: string) => {
    // Wenn bereits analysiert, nur expandieren/kollapieren
    const alert = alerts.find((a) => a.id === alertId);
    if (alert?.detailAnalysis) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        if (next.has(alertId)) {
          next.delete(alertId);
        } else {
          next.add(alertId);
        }
        return next;
      });
      return;
    }

    // Analyse starten
    setAnalyzingIds((prev) => new Set(prev).add(alertId));
    setAnalyzeErrors((prev) => {
      const next = { ...prev };
      delete next[alertId];
      return next;
    });

    try {
      const res = await fetch(`/api/modules/preisradar/alerts/${alertId}/analyze`, {
        method: "POST",
      });

      const data = await res.json();

      if (res.ok && data.success) {
        // Alert mit Analyse aktualisieren
        setAlerts((prev) =>
          prev.map((a) =>
            a.id === alertId ? { ...a, detailAnalysis: data.analysis } : a
          )
        );
        // Automatisch expandieren
        setExpandedIds((prev) => new Set(prev).add(alertId));
      } else {
        setAnalyzeErrors((prev) => ({
          ...prev,
          [alertId]: data.error || "Analyse fehlgeschlagen",
        }));
      }
    } catch {
      setAnalyzeErrors((prev) => ({
        ...prev,
        [alertId]: "Netzwerkfehler — bitte erneut versuchen",
      }));
    } finally {
      setAnalyzingIds((prev) => {
        const next = new Set(prev);
        next.delete(alertId);
        return next;
      });
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

            {/* Filter + Gespeichert-Link */}
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
              <Link
                href="/dashboard/preisradar/saved"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
              >
                🔖 Gespeichert {savedAlertIds.size > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {savedAlertIds.size}
                  </span>
                )}
              </Link>
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

                      {/* KI-Details */}
                      {alert.details && (
                        <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg mb-2">
                          💡 {alert.details}
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

                      {/* Detail-Analyse Bereich */}
                      {expandedIds.has(alert.id) && alert.detailAnalysis && (
                        <div className="mb-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 text-xs space-y-2">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-bold text-blue-800 text-sm">🔍 Detail-Analyse</span>
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getEmpfehlungColor(alert.detailAnalysis.empfehlung)}`}>
                              {alert.detailAnalysis.empfehlung}
                            </span>
                          </div>

                          {alert.detailAnalysis.zusammenfassung && (
                            <p className="text-gray-700 font-medium">{alert.detailAnalysis.zusammenfassung}</p>
                          )}

                          {alert.detailAnalysis.preisbewertung && (
                            <div>
                              <span className="font-semibold text-gray-800">💰 Preis:</span>
                              <p className="text-gray-600 mt-0.5">{alert.detailAnalysis.preisbewertung}</p>
                            </div>
                          )}

                          {alert.detailAnalysis.besonderheiten && (
                            <div>
                              <span className="font-semibold text-gray-800">✨ Besonderheiten:</span>
                              <p className="text-gray-600 mt-0.5">{alert.detailAnalysis.besonderheiten}</p>
                            </div>
                          )}

                          {alert.detailAnalysis.kaeuferhinweise && (
                            <div>
                              <span className="font-semibold text-gray-800">👀 Hinweise:</span>
                              <p className="text-gray-600 mt-0.5">{alert.detailAnalysis.kaeuferhinweise}</p>
                            </div>
                          )}

                          {alert.detailAnalysis.verhandlungspotenzial && (
                            <div>
                              <span className="font-semibold text-gray-800">🤝 Verhandlung:</span>
                              <p className="text-gray-600 mt-0.5">{alert.detailAnalysis.verhandlungspotenzial}</p>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-1 border-t border-blue-200">
                            <span className="font-semibold text-gray-800">🛡️ Scam-Risiko:</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div
                                className={`h-2 rounded-full ${
                                  alert.detailAnalysis.scamRisiko <= 30
                                    ? "bg-emerald-500"
                                    : alert.detailAnalysis.scamRisiko <= 60
                                    ? "bg-yellow-500"
                                    : "bg-red-500"
                                }`}
                                style={{ width: `${Math.min(100, alert.detailAnalysis.scamRisiko)}%` }}
                              />
                            </div>
                            <span className="text-gray-600 font-mono">{alert.detailAnalysis.scamRisiko}%</span>
                          </div>
                        </div>
                      )}

                      {/* Analyse-Fehler */}
                      {analyzeErrors[alert.id] && (
                        <div className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg mb-3">
                          ❌ {analyzeErrors[alert.id]}
                        </div>
                      )}

                      {/* Aktionen */}
                      <div className="flex gap-2 pt-3 border-t border-gray-100">
                        {/* Bookmark-Button */}
                        <button
                          onClick={() => handleToggleSave(alert.id)}
                          disabled={savingIds.has(alert.id)}
                          className={`text-xs py-2 px-2.5 rounded-lg font-medium transition ${
                            savedAlertIds.has(alert.id)
                              ? "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"
                              : "bg-gray-50 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                          } disabled:opacity-50`}
                          title={savedAlertIds.has(alert.id) ? "Gespeichert — klicken zum Entfernen" : "Speichern"}
                        >
                          <BookmarkIcon filled={savedAlertIds.has(alert.id)} className="w-4 h-4" />
                        </button>

                        <a
                          href={alert.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex-1 text-center text-xs py-2 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                        >
                          🔗 Anzeige öffnen
                        </a>

                        {/* Detail-Analyse Button */}
                        <button
                          onClick={() => handleDetailAnalyze(alert.id)}
                          disabled={analyzingIds.has(alert.id)}
                          className={`text-xs py-2 px-3 rounded-lg font-medium transition ${
                            alert.detailAnalysis
                              ? expandedIds.has(alert.id)
                                ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-100"
                              : "bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
                          } disabled:opacity-50 disabled:cursor-not-allowed`}
                          title={alert.detailAnalysis ? "Analyse anzeigen/verbergen" : "Kostet 1 Checko"}
                        >
                          {analyzingIds.has(alert.id) ? (
                            <span className="flex items-center gap-1">
                              <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              Analysiere...
                            </span>
                          ) : alert.detailAnalysis ? (
                            expandedIds.has(alert.id) ? "▲ Analyse" : "▼ Analyse"
                          ) : (
                            "🔍 Detail-Analyse (1 Checko)"
                          )}
                        </button>

                        {!alert.isSeen && (
                          <button
                            onClick={() => handleMarkAsSeen(alert.id)}
                            className="text-xs py-2 px-3 rounded-lg font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition"
                          >
                            ✓
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
