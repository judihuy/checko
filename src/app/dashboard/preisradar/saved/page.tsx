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
import { getPlatformDisplayName } from "@/lib/platform-names";

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
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
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
            <div className="space-y-3">
              {saved.map((item) => (
                <div
                  key={item.id}
                  className={`bg-white rounded-xl border overflow-hidden hover:shadow-lg transition ${
                    item.isFavorite ? "border-yellow-300" : "border-gray-200"
                  }`}
                >
                  <div className="p-4">
                    {/* Hauptbereich: Bild links, Content rechts */}
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      {item.alert.imageUrl ? (
                        <div className="w-20 h-20 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100 relative">
                          <img
                            src={item.alert.imageUrl}
                            alt={item.alert.title}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              const target = e.target as HTMLImageElement;
                              target.style.display = "none";
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
                          {/* Score Badge */}
                          {item.alert.priceScore && (
                            <div className={`absolute top-0.5 right-0.5 px-1 py-0.5 rounded text-[10px] font-bold ${getScoreColor(item.alert.priceScore)}`}>
                              {item.alert.priceScore}/10
                            </div>
                          )}
                          {/* Favorit Badge */}
                          {item.isFavorite && (
                            <div className="absolute top-0.5 left-0.5 bg-yellow-400 text-white px-1 py-0.5 rounded text-[10px] font-bold">
                              ⭐
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="relative">
                          <CameraPlaceholder platform={item.alert.platform} />
                          {item.isFavorite && (
                            <div className="absolute top-0.5 left-0.5 bg-yellow-400 text-white px-1 py-0.5 rounded text-[10px] font-bold">
                              ⭐
                            </div>
                          )}
                        </div>
                      )}

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        {/* Plattform */}
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-500">
                            {getPlatformDisplayName(item.alert.platform)}
                          </span>
                          {!item.alert.imageUrl && item.alert.priceScore && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${getScoreColor(item.alert.priceScore)}`}>
                              {item.alert.priceScore}/10
                            </span>
                          )}
                        </div>

                        {/* Titel */}
                        <h3 className="font-semibold text-gray-900 text-sm line-clamp-1">
                          {item.alert.title}
                        </h3>

                        {/* Preis */}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-base font-bold text-gray-900">
                            {formatPrice(item.alert.price)}
                          </span>
                          {item.alert.isScam && (
                            <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-medium">🚨 Betrug</span>
                          )}
                        </div>

                        {/* Suche + Datum */}
                        <div className="text-xs text-gray-400 mt-1">
                          &ldquo;{item.alert.search.query}&rdquo; · Gespeichert am {formatDate(item.createdAt)}
                        </div>
                      </div>
                    </div>

                    {/* Notiz */}
                    {editingNoteId === item.id ? (
                      <div className="mt-3">
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
                        className="text-xs bg-blue-50 text-blue-700 px-2 py-1.5 rounded-lg mt-3 cursor-pointer hover:bg-blue-100 transition"
                        onClick={() => startEditNote(item)}
                      >
                        📝 {item.note}
                      </div>
                    ) : (
                      <button
                        onClick={() => startEditNote(item)}
                        className="text-xs text-gray-400 hover:text-gray-600 mt-3 block transition"
                      >
                        + Notiz hinzufügen
                      </button>
                    )}

                    {/* Aktionen */}
                    <div className="flex gap-2 pt-3 mt-3 border-t border-gray-100">
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
