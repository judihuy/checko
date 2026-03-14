// Gespeicherte Alerts — /dashboard/preisradar/saved
// Tab-Navigation: "Alle gespeicherten" | "Nur Favoriten"
// Notiz-Feld pro Alert, Löschen, Favorit togglen
"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

interface SavedAlertItem {
  id: string;
  alertId: string;
  isFavorite: boolean;
  note: string | null;
  createdAt: string;
  alert: {
    id: string;
    title: string;
    price: number;
    platform: string;
    url: string;
    imageUrl: string | null;
    priceScore: string | null;
    isScam: boolean;
    createdAt: string;
    search: {
      query: string;
    };
  };
}

const PLATFORM_NAMES: Record<string, string> = {
  tutti: "Tutti.ch",
  ricardo: "Ricardo.ch",
  "ebay-ka": "eBay Kleinanzeigen",
  autoscout: "AutoScout24.ch",
  comparis: "Comparis Auto",
};

function getScoreColor(score: string | null): string {
  if (!score) return "bg-gray-100 text-gray-500";
  const num = parseFloat(score);
  if (num >= 8) return "bg-emerald-100 text-emerald-700";
  if (num >= 5) return "bg-yellow-100 text-yellow-700";
  return "bg-red-100 text-red-700";
}

export default function SavedAlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [saved, setSaved] = useState<SavedAlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const loadSaved = useCallback(async () => {
    setLoading(true);
    try {
      const params = tab === "favorites" ? "?favorites=true" : "";
      const res = await fetch(`/api/modules/preisradar/saved${params}`);
      if (res.ok) {
        const data = await res.json();
        setSaved(data.saved);
      }
    } catch {
      console.error("Fehler beim Laden");
    } finally {
      setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      loadSaved();
    }
  }, [status, router, loadSaved]);

  // Favorit togglen
  const handleToggleFavorite = async (id: string, currentFav: boolean) => {
    try {
      const res = await fetch(`/api/modules/preisradar/saved/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: !currentFav }),
      });
      if (res.ok) {
        setSaved((prev) =>
          prev.map((s) => (s.id === id ? { ...s, isFavorite: !currentFav } : s))
        );
      }
    } catch {
      console.error("Fehler beim Togglen");
    }
  };

  // Löschen
  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/modules/preisradar/saved/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSaved((prev) => prev.filter((s) => s.id !== id));
      }
    } catch {
      console.error("Fehler beim Löschen");
    }
  };

  // Notiz speichern
  const handleSaveNote = async (id: string) => {
    setSavingNote(true);
    try {
      const res = await fetch(`/api/modules/preisradar/saved/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteText || null }),
      });
      if (res.ok) {
        setSaved((prev) =>
          prev.map((s) => (s.id === id ? { ...s, note: noteText || null } : s))
        );
        setEditingNoteId(null);
        setNoteText("");
      }
    } catch {
      console.error("Fehler beim Speichern");
    } finally {
      setSavingNote(false);
    }
  };

  const startEditNote = (item: SavedAlertItem) => {
    setEditingNoteId(item.id);
    setNoteText(item.note || "");
  };

  const formatPrice = (priceInRappen: number): string => {
    return `CHF ${(priceInRappen / 100).toFixed(2)}`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
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
                <span className="text-gray-900 font-medium text-sm">Gespeichert</span>
              </div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                🔖 Gespeicherte Angebote
              </h1>
              <p className="text-gray-500 text-sm mt-1">{saved.length} gespeichert</p>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setTab("all")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === "all"
                    ? "bg-emerald-600 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                Alle
              </button>
              <button
                onClick={() => setTab("favorites")}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tab === "favorites"
                    ? "bg-yellow-500 text-white"
                    : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                ⭐ Favoriten
              </button>
              <Link
                href="/dashboard/preisradar/alerts"
                className="px-4 py-2 rounded-lg text-sm font-medium bg-white border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              >
                ← Zurück zu Treffern
              </Link>
            </div>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                  <div className="h-32 bg-gray-100 rounded-lg mb-3" />
                  <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-100 rounded w-1/2" />
                </div>
              ))}
            </div>
          ) : saved.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl block mb-4">🔖</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">
                {tab === "favorites" ? "Keine Favoriten" : "Keine gespeicherten Angebote"}
              </h2>
              <p className="text-gray-500 mb-6">
                {tab === "favorites"
                  ? "Markiere gespeicherte Angebote als Favoriten mit dem ⭐-Symbol."
                  : "Speichere Angebote mit dem 🔖-Symbol in der Treffer-Übersicht."}
              </p>
              <Link
                href="/dashboard/preisradar/alerts"
                className="text-emerald-600 hover:text-emerald-700 font-medium"
              >
                ← Zur Treffer-Übersicht
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {saved.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition ${
                    item.isFavorite ? "border-yellow-300" : "border-gray-200"
                  }`}
                >
                  {/* Bild */}
                  {item.alert.imageUrl && (
                    <div className="h-40 bg-gray-100 relative overflow-hidden">
                      <img
                        src={item.alert.imageUrl}
                        alt={item.alert.title}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = "none";
                        }}
                      />
                      {/* Score Badge */}
                      {item.alert.priceScore && (
                        <div className={`absolute top-2 right-2 px-2 py-1 rounded-lg text-xs font-bold ${getScoreColor(item.alert.priceScore)}`}>
                          {item.alert.priceScore}/10
                        </div>
                      )}
                      {/* Favorit Badge */}
                      {item.isFavorite && (
                        <div className="absolute top-2 left-2 bg-yellow-400 text-white px-2 py-1 rounded-lg text-xs font-bold">
                          ⭐ Favorit
                        </div>
                      )}
                    </div>
                  )}

                  <div className="p-4">
                    {/* Plattform */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium text-gray-500">
                        {PLATFORM_NAMES[item.alert.platform] || item.alert.platform}
                      </span>
                      {!item.alert.imageUrl && item.isFavorite && (
                        <span className="text-yellow-500 text-sm">⭐</span>
                      )}
                    </div>

                    {/* Titel */}
                    <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2 text-sm">
                      {item.alert.title}
                    </h3>

                    {/* Preis */}
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-bold text-gray-900">
                        {formatPrice(item.alert.price)}
                      </span>
                    </div>

                    {/* Suche + Datum */}
                    <div className="text-xs text-gray-400 mb-2">
                      Suche: &ldquo;{item.alert.search.query}&rdquo; · Gespeichert am {formatDate(item.createdAt)}
                    </div>

                    {/* Scam-Warnung */}
                    {item.alert.isScam && (
                      <div className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-1.5 rounded-lg mb-2">
                        🚨 Verdacht auf Betrug!
                      </div>
                    )}

                    {/* Notiz */}
                    {editingNoteId === item.id ? (
                      <div className="mb-3">
                        <textarea
                          value={noteText}
                          onChange={(e) => setNoteText(e.target.value)}
                          placeholder="Notiz hinzufügen..."
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none resize-none"
                          rows={2}
                          maxLength={500}
                        />
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => handleSaveNote(item.id)}
                            disabled={savingNote}
                            className="text-xs px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition disabled:opacity-50"
                          >
                            {savingNote ? "..." : "Speichern"}
                          </button>
                          <button
                            onClick={() => { setEditingNoteId(null); setNoteText(""); }}
                            className="text-xs px-3 py-1 text-gray-500 hover:text-gray-700 transition"
                          >
                            Abbrechen
                          </button>
                        </div>
                      </div>
                    ) : item.note ? (
                      <div
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1.5 rounded-lg mb-3 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => startEditNote(item)}
                      >
                        📝 {item.note}
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditNote(item)}
                        className="text-xs text-gray-400 hover:text-gray-600 mb-3 block transition"
                      >
                        + Notiz hinzufügen
                      </button>
                    )}

                    {/* Aktionen */}
                    <div className="flex gap-2 pt-3 border-t border-gray-100">
                      <a
                        href={item.alert.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 text-center text-xs py-2 rounded-lg font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition"
                      >
                        🔗 Öffnen
                      </a>
                      <button
                        onClick={() => handleToggleFavorite(item.id, item.isFavorite)}
                        className={`text-xs py-2 px-3 rounded-lg font-medium transition ${
                          item.isFavorite
                            ? "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
                            : "bg-gray-50 text-gray-600 hover:bg-gray-100"
                        }`}
                      >
                        {item.isFavorite ? "⭐" : "☆"}
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-xs py-2 px-3 rounded-lg font-medium bg-red-50 text-red-600 hover:bg-red-100 transition"
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
