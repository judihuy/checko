// Preisradar Dashboard — Meine Suchen + Neue Suche erstellen + Suche bearbeiten
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

interface Search {
  id: string;
  query: string;
  maxPrice: number | null;
  minPrice: number | null;
  platforms: string[];
  duration: string;
  qualityTier: string;
  interval: number;
  status: "aktiv" | "pausiert" | "abgelaufen";
  alertCount: number;
  expiresAt: string | null;
  lastScrapedAt: string | null;
  checkosCharged: number;
  createdAt: string;
}

const PLATFORMS = [
  { id: "tutti", name: "Tutti.ch" },
  { id: "ricardo", name: "Ricardo.ch" },
  { id: "ebay-ka", name: "eBay Kleinanzeigen" },
  { id: "autoscout", name: "AutoScout24.ch" },
  { id: "comparis", name: "Comparis Auto" },
];

// Basiskosten pro Dauer (Standard-Stufe = 2 Checkos)
const DURATION_BASE_COSTS: Record<string, number> = {
  "1d": 2,
  "1w": 8,
  "1m": 20,
};

// Qualitäts-Kosten in Checkos (konkret, keine Multiplikatoren)
const QUALITY_CHECKO_COSTS: Record<string, number> = {
  standard: 2,
  premium: 4,
  pro: 7,
};

const DURATIONS = [
  { id: "1d", name: "1 Tag" },
  { id: "1w", name: "1 Woche" },
  { id: "1m", name: "1 Monat" },
];

const QUALITY_TIERS = [
  {
    id: "standard",
    name: "Standard",
    desc: "Schnell und zuverlässig",
    checkos: 2,
    interval: 30,
    intervalLabel: "Alle 30 Minuten",
    model: "Haiku",
  },
  {
    id: "premium",
    name: "Premium",
    desc: "Bessere Qualität & häufiger",
    checkos: 4,
    interval: 15,
    intervalLabel: "Alle 15 Minuten",
    model: "Sonnet",
  },
  {
    id: "pro",
    name: "Pro",
    desc: "Maximale Qualität & Echtzeit",
    checkos: 7,
    interval: 5,
    intervalLabel: "Alle 5 Minuten",
    model: "Opus",
  },
];

export default function PreisradarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Edit-State
  const [editingSearch, setEditingSearch] = useState<Search | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit-Formular-State
  const [editQuery, setEditQuery] = useState("");
  const [editMinPrice, setEditMinPrice] = useState("");
  const [editMaxPrice, setEditMaxPrice] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);

  // Formular-State (Neue Suche)
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["tutti", "ricardo"]);
  const [duration, setDuration] = useState("1d");
  const [qualityTier, setQualityTier] = useState("standard");

  // Intervall wird automatisch vom qualityTier abgeleitet
  const currentInterval = useMemo(() => {
    const tier = QUALITY_TIERS.find((t) => t.id === qualityTier);
    return tier?.interval || 30;
  }, [qualityTier]);

  // Live-Kostenberechnung: Dauer-Kosten skaliert nach Qualitätsstufe
  const currentCost = useMemo(() => {
    const baseCost = DURATION_BASE_COSTS[duration] || 2;
    const qualityCost = QUALITY_CHECKO_COSTS[qualityTier] || 2;
    // Verhältnis zur Standard-Stufe: premium = 2x, pro = 3.5x
    const ratio = qualityCost / QUALITY_CHECKO_COSTS["standard"];
    return Math.round(baseCost * ratio);
  }, [duration, qualityTier]);

  const loadSearches = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/preisradar/searches");
      if (res.ok) {
        const data = await res.json();
        setSearches(data.searches);
      }
    } catch {
      console.error("Fehler beim Laden der Suchen");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      loadSearches();
    }
  }, [status, router, loadSearches]);

  // Edit-Modal öffnen mit vorausgefüllten Werten
  const openEditModal = (search: Search) => {
    setEditingSearch(search);
    setEditQuery(search.query);
    setEditMinPrice(search.minPrice ? String(search.minPrice / 100) : "");
    setEditMaxPrice(search.maxPrice ? String(search.maxPrice / 100) : "");
    setEditPlatforms([...search.platforms]);
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSearch) return;
    setEditing(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/modules/preisradar/searches/${editingSearch.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: editQuery,
          minPrice: editMinPrice ? parseInt(editMinPrice, 10) * 100 : null,
          maxPrice: editMaxPrice ? parseInt(editMaxPrice, 10) * 100 : null,
          platforms: editPlatforms,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error || "Fehler beim Speichern");
        return;
      }

      // Modal schließen + Seite aktualisieren
      setShowEditModal(false);
      setEditingSearch(null);
      await loadSearches();
    } catch {
      setEditError("Netzwerkfehler");
    } finally {
      setEditing(false);
    }
  };

  const toggleEditPlatform = (platformId: string) => {
    setEditPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  };

  const handleCreateSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch("/api/modules/preisradar/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          minPrice: minPrice ? parseInt(minPrice, 10) * 100 : undefined, // CHF → Rappen
          maxPrice: maxPrice ? parseInt(maxPrice, 10) * 100 : undefined,
          platforms: selectedPlatforms,
          duration,
          qualityTier,
          interval: currentInterval,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Fehler beim Erstellen der Suche");
        return;
      }

      // Reset + Reload + Erfolgsmeldung
      setShowModal(false);
      setQuery("");
      setMinPrice("");
      setMaxPrice("");
      setSelectedPlatforms(["tutti", "ricardo"]);
      setDuration("1d");
      setQualityTier("standard");
      setSuccessMessage("🚀 Suche erstellt! Der erste Scan läuft bereits im Hintergrund.");
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadSearches();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleSearch = async (searchId: string, currentActive: boolean) => {
    try {
      const res = await fetch(`/api/modules/preisradar/searches/${searchId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (res.ok) {
        await loadSearches();
      }
    } catch {
      console.error("Fehler beim Umschalten der Suche");
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    if (!confirm("Suche wirklich löschen? Alle Treffer gehen verloren.")) return;

    try {
      const res = await fetch(`/api/modules/preisradar/searches/${searchId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadSearches();
      }
    } catch {
      console.error("Fehler beim Löschen der Suche");
    }
  };

  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  };

  const getStatusBadge = (searchStatus: string) => {
    switch (searchStatus) {
      case "aktiv":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">● Aktiv</span>;
      case "pausiert":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">⏸ Pausiert</span>;
      case "abgelaufen":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">⏹ Abgelaufen</span>;
      default:
        return null;
    }
  };

  const getQualityBadge = (tier: string) => {
    switch (tier) {
      case "premium":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">⚡ Premium</span>;
      case "pro":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">🔥 Pro</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Standard</span>;
    }
  };

  const getIntervalLabel = (interval: number) => {
    if (interval <= 5) return "Alle 5 Min";
    if (interval <= 15) return "Alle 15 Min";
    return "Alle 30 Min";
  };

  const getPlatformName = (id: string) => PLATFORMS.find((p) => p.id === id)?.name || id;

  if (status === "loading" || loading) {
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
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
                  Dashboard
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium text-sm">Preisradar</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                📡 Preisradar
              </h1>
              <p className="text-gray-600 mt-1">Überwache Marktplätze und finde die besten Angebote.</p>
            </div>
            <div className="flex gap-3">
              <Link
                href="/dashboard/preisradar/saved"
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
              >
                🔖 Gespeichert
              </Link>
              <Link
                href="/dashboard/preisradar/alerts"
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
              >
                🔔 Treffer ansehen
              </Link>
              <button
                onClick={() => setShowModal(true)}
                className="bg-emerald-600 text-white px-4 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition text-sm"
              >
                + Neue Suche
              </button>
            </div>
          </div>

          {/* Erfolgsmeldung */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
              <span className="text-emerald-600 text-lg">✅</span>
              <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-emerald-400 hover:text-emerald-600 text-lg"
              >
                ×
              </button>
            </div>
          )}

          {/* Suchen-Liste */}
          {searches.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl block mb-4">📡</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Noch keine Suchen</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Erstelle deine erste Preisradar-Suche und werde automatisch benachrichtigt, wenn es neue Angebote gibt.
              </p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition"
              >
                + Erste Suche erstellen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searches.map((search) => (
                <div key={search.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg truncate flex-1 mr-2">
                      &ldquo;{search.query}&rdquo;
                    </h3>
                    {getStatusBadge(search.status)}
                  </div>

                  {/* Plattformen + Qualität */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {search.platforms.map((p) => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {getPlatformName(p)}
                      </span>
                    ))}
                    {getQualityBadge(search.qualityTier)}
                  </div>

                  {/* Details */}
                  <div className="text-sm text-gray-500 space-y-1 mb-4">
                    {(search.minPrice || search.maxPrice) && (
                      <p>
                        💰 {search.minPrice ? `CHF ${(search.minPrice / 100).toFixed(0)}` : "–"}
                        {" – "}
                        {search.maxPrice ? `CHF ${(search.maxPrice / 100).toFixed(0)}` : "∞"}
                      </p>
                    )}
                    <p>🔔 {search.alertCount} Treffer</p>
                    <p>⏱ {DURATIONS.find((d) => d.id === search.duration)?.name || search.duration}</p>
                    <p>🔄 {getIntervalLabel(search.interval)}</p>
                    <p>🦎 {search.checkosCharged} Checko{search.checkosCharged > 1 ? "s" : ""} bezahlt</p>
                    {search.expiresAt && (
                      <p>📅 Läuft ab: {new Date(search.expiresAt).toLocaleDateString("de-CH")}</p>
                    )}
                  </div>

                  {/* Aktionen */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    {search.status !== "abgelaufen" && (
                      <>
                        <button
                          onClick={() => openEditModal(search)}
                          className="flex-1 text-xs py-2 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                        >
                          ✏️ Bearbeiten
                        </button>
                        <button
                          onClick={() => handleToggleSearch(search.id, search.status === "aktiv")}
                          className={`flex-1 text-xs py-2 rounded-lg font-medium transition ${
                            search.status === "aktiv"
                              ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {search.status === "aktiv" ? "⏸ Pausieren" : "▶ Aktivieren"}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteSearch(search.id)}
                      className="flex-1 text-xs py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 transition"
                    >
                      🗑 Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal: Neue Suche */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Neue Preisradar-Suche</h2>
                <button
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateSearch} className="space-y-5">
                {/* Suchbegriff */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suchbegriff *
                  </label>
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="z.B. iPhone 15 Pro, BMW 320d, Sofa..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </div>

                {/* Preislimit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={minPrice}
                      onChange={(e) => setMinPrice(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={maxPrice}
                      onChange={(e) => setMaxPrice(e.target.value)}
                      placeholder="∞"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Plattformen */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plattformen *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PLATFORMS.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                          selectedPlatforms.includes(p.id)
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlatforms.includes(p.id)}
                          onChange={() => togglePlatform(p.id)}
                          className="sr-only"
                        />
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          selectedPlatforms.includes(p.id)
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-gray-300"
                        }`}>
                          {selectedPlatforms.includes(p.id) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Qualitätsstufe — mit Intervall-Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    KI-Qualitätsstufe & Scan-Intervall
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITY_TIERS.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setQualityTier(tier.id)}
                        className={`py-3 px-2 rounded-lg border text-center transition ${
                          qualityTier === tier.id
                            ? tier.id === "pro"
                              ? "border-purple-500 bg-purple-50 text-purple-700"
                              : tier.id === "premium"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-medium text-sm">{tier.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{tier.desc}</div>
                        <div className="text-xs font-semibold mt-1">
                          🔄 {tier.intervalLabel}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          🤖 {tier.model}
                        </div>
                        <div className="text-xs font-semibold mt-1">
                          {tier.checkos} Checko{tier.checkos > 1 ? "s" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dauer — mit dynamischen Kosten je nach Qualitätsstufe */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dauer
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATIONS.map((d) => {
                      const baseCost = DURATION_BASE_COSTS[d.id] || 2;
                      const qualityCost = QUALITY_CHECKO_COSTS[qualityTier] || 2;
                      const ratio = qualityCost / QUALITY_CHECKO_COSTS["standard"];
                      const cost = Math.round(baseCost * ratio);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDuration(d.id)}
                          className={`py-3 px-2 rounded-lg border text-center transition ${
                            duration === d.id
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="font-medium text-sm">{d.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {cost} Checko{cost > 1 ? "s" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live-Kostenanzeige — reagiert auf Qualität UND Dauer */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-emerald-700 font-medium">Kosten für diese Suche:</span>
                      <div className="text-xs text-emerald-600 mt-0.5">
                        {DURATIONS.find((d) => d.id === duration)?.name || duration}
                        {" · "}
                        {QUALITY_TIERS.find((t) => t.id === qualityTier)?.name || "Standard"}
                        {" · "}
                        {QUALITY_TIERS.find((t) => t.id === qualityTier)?.intervalLabel || "Alle 30 Minuten"}
                      </div>
                    </div>
                    <span className="text-lg font-bold text-emerald-800">
                      🦎 {currentCost} Checko{currentCost > 1 ? "s" : ""}
                    </span>
                  </div>
                  {qualityTier !== "standard" && (
                    <div className="text-xs text-emerald-600 mt-2 pt-2 border-t border-emerald-200">
                      💡 Standard würde nur {DURATION_BASE_COSTS[duration] || 2} Checko{(DURATION_BASE_COSTS[duration] || 2) > 1 ? "s" : ""} kosten
                    </div>
                  )}
                </div>

                {/* Sofort-Suche Hinweis */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    🚀 <strong>Sofort-Scan:</strong> Deine Suche wird direkt nach dem Erstellen gescannt — du musst nicht auf den nächsten Cron-Lauf warten!
                  </p>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setError(null); }}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={creating || selectedPlatforms.length === 0 || !query.trim()}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {creating ? "Wird erstellt..." : `Suche starten (${currentCost} 🦎)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suche bearbeiten */}
      {showEditModal && editingSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Suche bearbeiten</h2>
                <button
                  onClick={() => { setShowEditModal(false); setEditingSearch(null); setEditError(null); }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
                  {editError}
                </div>
              )}

              <form onSubmit={handleEditSearch} className="space-y-5">
                {/* Suchbegriff */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suchbegriff *
                  </label>
                  <input
                    type="text"
                    value={editQuery}
                    onChange={(e) => setEditQuery(e.target.value)}
                    placeholder="z.B. iPhone 15 Pro, BMW 320d, Sofa..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    required
                    minLength={2}
                    maxLength={200}
                  />
                </div>

                {/* Preislimit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={editMinPrice}
                      onChange={(e) => setEditMinPrice(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={editMaxPrice}
                      onChange={(e) => setEditMaxPrice(e.target.value)}
                      placeholder="∞"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Plattformen */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plattformen *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {PLATFORMS.map((p) => (
                      <label
                        key={p.id}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition ${
                          editPlatforms.includes(p.id)
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={editPlatforms.includes(p.id)}
                          onChange={() => toggleEditPlatform(p.id)}
                          className="sr-only"
                        />
                        <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                          editPlatforms.includes(p.id)
                            ? "border-emerald-500 bg-emerald-500"
                            : "border-gray-300"
                        }`}>
                          {editPlatforms.includes(p.id) && (
                            <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </span>
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Info: Dauer/Qualität/Intervall nicht änderbar */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">
                    ℹ️ Dauer, KI-Qualitätsstufe und Scan-Intervall können nach der Erstellung nicht mehr geändert werden, da die Checkos bereits berechnet wurden.
                  </p>
                  <div className="flex gap-3 mt-2 text-sm text-gray-700">
                    <span>⏱ {DURATIONS.find((d) => d.id === editingSearch.duration)?.name || editingSearch.duration}</span>
                    <span>·</span>
                    <span>{QUALITY_TIERS.find((t) => t.id === editingSearch.qualityTier)?.name || "Standard"}</span>
                    <span>·</span>
                    <span>🔄 {getIntervalLabel(editingSearch.interval)}</span>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingSearch(null); setEditError(null); }}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={editing || editPlatforms.length === 0 || !editQuery.trim()}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editing ? "Wird gespeichert..." : "Änderungen speichern"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
