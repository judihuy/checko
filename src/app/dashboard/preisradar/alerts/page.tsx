// Preisradar Alerts — Feed mit Treffern
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import { getPlatformDisplayName } from "@/lib/platform-names";

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

// Kamera-Platzhalter Icon
function CameraPlaceholder({ platform }: { platform: string }) {
  return (
    <div className="w-20 h-20 flex-shrink-0 bg-gray-100 rounded-lg flex flex-col items-center justify-center">
      <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
      </svg>
      <span className="text-[9px] text-gray-400 mt-0.5 text-center leading-tight px-1">{getPlatformDisplayName(platform)}</span>
    </div>
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

function getScoreText(score: number | null): string {
  if (score === null) return "";
  if (score <= 3) return "❌ Überteuert";
  if (score <= 5) return "⚠️ Durchschnittlich";
  if (score <= 7) return "✅ Guter Preis";
  if (score <= 9) return "🔥 Schnäppchen!";
  return "💎 Aussergewöhnlich günstig!";
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
    const d = new Date(dateStr);
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${day}.${month}.${year} um ${hours}:${minutes}`;
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
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 py-8 overflow-x-hidden">
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
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              <button
                onClick={() => { setFilter("all"); setPage(1); }}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  filter === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => { setFilter("unseen"); setPage(1); }}
                className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition ${
                  filter === "unseen"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Ungelesen
              </button>
              <Link
                href="/dashboard/preisradar/saved"
                className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition flex items-center gap-1"
              >
                🔖 <span className="hidden sm:inline">Gespeichert</span> {savedAlertIds.size > 0 && (
                  <span className="bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full text-xs font-bold">
                    {savedAlertIds.size}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse">
                  <div className="flex gap-4">
                    <div className="w-20 h-20 bg-gray-100 rounded-lg flex-shrink-0" />
                    <div className="flex-1">
                      <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-100 rounded w-1/2" />
                    </div>
                  </div>
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
              {/* Alert-Cards — Marketplace-Feed Layout */}
              <div className="space-y-3">
                {alerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`bg-white rounded-xl border ${getScoreBorderColor(alert.priceScore)} ${
                      !alert.isSeen ? "ring-2 ring-emerald-200" : ""
                    } overflow-hidden hover:shadow-lg transition`}
                  >
                    <div className="p-4">
                      {/* Hauptbereich: Bild links, Content rechts */}
                      <div className="flex gap-4">
                        {/* Thumbnail */}
                        {alert.imageUrl ? (
                          <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 relative">
                            <img
                              src={alert.imageUrl}
                              alt={alert.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                const target = e.target as HTMLImageElement;
                                target.style.display = "none";
                                // Platzhalter anzeigen
                                const parent = target.parentElement;
                                if (parent) {
                                  parent.classList.add("flex", "flex-col", "items-center", "justify-center");
                                  const icon = document.createElement("span");
                                  icon.className = "text-gray-300 text-2xl";
                                  icon.textContent = "📷";
                                  parent.appendChild(icon);
                                }
                              }}
                            />
                            {/* Score Badge oben rechts auf dem Bild */}
                            {alert.priceScore !== null && (
                              <div className={`absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[10px] font-bold ${getScoreColor(alert.priceScore)}`}>
                                {getScoreLabel(alert.priceScore)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <CameraPlaceholder platform={alert.platform} />
                        )}

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          {/* Plattform + Ungelesen-Badge */}
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-medium text-gray-500">
                              {getPlatformDisplayName(alert.platform)}
                            </span>
                            <div className="flex items-center gap-2">
                              {alert.priceScore !== null && !alert.imageUrl && (
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getScoreColor(alert.priceScore)}`}>
                                  {getScoreLabel(alert.priceScore)}
                                </span>
                              )}
                              {!alert.isSeen && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              )}
                            </div>
                          </div>

                          {/* Titel */}
                          <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">
                            {alert.title}
                          </h3>

                          {/* Preis */}
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-base font-bold text-gray-900">
                              {formatPrice(alert.price)}
                            </span>
                            {alert.isScam && (
                              <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">🚨 Betrug</span>
                            )}
                          </div>

                          {/* Score-Text */}
                          {alert.priceScore !== null && (
                            <div className="text-xs font-medium mt-1">
                              <span className={getScoreColor(alert.priceScore).replace('bg-', 'text-').replace('100', '700')}>
                                {getScoreText(alert.priceScore)}
                              </span>
                            </div>
                          )}

                          {/* Suche + Datum */}
                          <div className="text-xs text-gray-400 mt-1 space-y-0.5">
                            <div>&ldquo;{alert.searchQuery}&rdquo;</div>
                            <div>📅 Gefunden am {formatDate(alert.createdAt)}</div>
                          </div>
                        </div>
                      </div>

                      {/* Bewertung */}
                      {alert.bewertung && (
                        <div className={`text-xs px-2 py-1.5 rounded-lg mt-3 ${getScoreColor(alert.priceScore)}`}>
                          <span className="font-medium">Bewertung:</span> {alert.bewertung}
                        </div>
                      )}

                      {/* Details */}
                      {alert.details && (
                        <div className="text-xs text-gray-600 bg-gray-50 px-2 py-1.5 rounded-lg mt-2">
                          💡 {alert.details}
                        </div>
                      )}

                      {/* Warnung */}
                      {alert.warnung && (
                        <div className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2 py-1.5 rounded-lg mt-2">
                          ⚠️ {alert.warnung}
                        </div>
                      )}

                      {/* Detail-Analyse Bereich */}
                      {expandedIds.has(alert.id) && alert.detailAnalysis && (
                        <div className="mt-3 p-3 bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200 text-xs space-y-2">
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
                        <div className="text-xs bg-red-50 text-red-600 border border-red-200 px-2 py-1.5 rounded-lg mt-3">
                          ❌ {analyzeErrors[alert.id]}
                        </div>
                      )}

                      {/* Aktionen */}
                      <div className="flex gap-1.5 sm:gap-2 pt-3 mt-3 border-t border-gray-100 flex-wrap">
                        {/* Bookmark-Button */}
                        <button
                          onClick={() => handleToggleSave(alert.id)}
                          disabled={savingIds.has(alert.id)}
                          className={`text-xs py-1.5 sm:py-2 px-2 rounded-lg font-medium transition ${
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
                          className="flex-1 min-w-0 text-center text-xs py-1.5 sm:py-2 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition truncate"
                        >
                          🔗 Öffnen
                        </a>

                        {/* Detail-Analyse Button */}
                        <button
                          onClick={() => handleDetailAnalyze(alert.id)}
                          disabled={analyzingIds.has(alert.id)}
                          className={`text-xs py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg font-medium transition truncate ${
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
                              ...
                            </span>
                          ) : alert.detailAnalysis ? (
                            expandedIds.has(alert.id) ? "▲" : "▼ Analyse"
                          ) : (
                            "🔍 1🦎"
                          )}
                        </button>

                        {!alert.isSeen && (
                          <button
                            onClick={() => handleMarkAsSeen(alert.id)}
                            className="text-xs py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg font-medium bg-gray-50 text-gray-600 hover:bg-gray-100 transition"
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
