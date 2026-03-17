// Benachrichtigungen-Seite — /dashboard/benachrichtigungen
// Mit Checkboxen, Bulk-Aktionen, "Alle auswählen" (ALLE, nicht nur sichtbare),
// "Alle löschen" Button, Bulk-Delete für grosse Mengen
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface Notification {
  id: string;
  type: string;
  category?: string;
  title: string;
  message: string;
  link: string | null;
  imageUrl: string | null;
  isRead: boolean;
  createdAt: string;
}

const PAGE_SIZE = 10;

const CATEGORY_TABS = [
  { id: "", label: "Alle", emoji: "📋" },
  { id: "wheel", label: "Glücksrad", emoji: "🎰" },
  { id: "preisradar", label: "Preisradar", emoji: "📡" },
  { id: "checkos", label: "Checkos", emoji: "💰" },
  { id: "system", label: "System", emoji: "🔔" },
];

export default function BenachrichtigungenPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [allSelected, setAllSelected] = useState(false); // TRUE = ALLE Notifications ausgewählt (nicht nur sichtbare)
  const [bulkActing, setBulkActing] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [deleteAllConfirm, setDeleteAllConfirm] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String(page * PAGE_SIZE));
      if (categoryFilter) params.set("category", categoryFilter);

      const res = await fetch(`/api/notifications?${params}`);
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
        setTotal(data.total);
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, [page, categoryFilter]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Auswahl zurücksetzen wenn Seite/Kategorie wechselt
  useEffect(() => {
    setSelectedIds(new Set());
    setAllSelected(false);
  }, [page, categoryFilter]);

  // Checkbox für einzelne Notification togglen
  const toggleSelect = (id: string) => {
    setAllSelected(false); // "Alle" Modus deaktivieren
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // "Alle auswählen" togglen — wählt ALLE Notifications, nicht nur sichtbare
  const toggleSelectAll = async () => {
    if (allSelected) {
      // Abwählen
      setAllSelected(false);
      setSelectedIds(new Set());
    } else {
      // ALLE auswählen — IDs vom Server laden
      try {
        const params = new URLSearchParams();
        if (categoryFilter) params.set("category", categoryFilter);
        const res = await fetch(`/api/notifications/ids?${params}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedIds(new Set(data.ids));
          setAllSelected(true);
        }
      } catch {
        // Fallback: nur sichtbare auswählen
        setSelectedIds(new Set(notifications.map((n) => n.id)));
      }
    }
  };

  // Prüfe ob alle sichtbaren Notifications ausgewählt sind
  const visibleAllSelected = notifications.length > 0 && notifications.every((n) => selectedIds.has(n.id));
  const someSelected = selectedIds.size > 0;

  // Anzahl ausgewählter Notifications (Anzeige)
  const selectedCount = allSelected ? total : selectedIds.size;

  // Bulk: Ausgewählte löschen
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 && !allSelected) return;
    setBulkActing(true);
    try {
      if (allSelected) {
        // Alle löschen (server-side, optional nach Kategorie)
        const res = await fetch("/api/notifications/bulk", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            all: true,
            category: categoryFilter || undefined,
          }),
        });
        if (res.ok) {
          setSelectedIds(new Set());
          setAllSelected(false);
          setPage(0);
          await fetchNotifications();
        }
      } else {
        // Bestimmte IDs löschen — in Batches von 500
        const ids = Array.from(selectedIds);
        let totalDeleted = 0;

        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500);
          const res = await fetch("/api/notifications/bulk", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
          if (res.ok) {
            const data = await res.json();
            totalDeleted += data.deleted;
          }
        }

        if (totalDeleted > 0) {
          setSelectedIds(new Set());
          setAllSelected(false);
          await fetchNotifications();
        }
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setBulkActing(false);
    }
  };

  // Bulk: Ausgewählte als gelesen markieren
  const handleBulkMarkRead = async () => {
    if (selectedIds.size === 0 && !allSelected) return;
    setBulkActing(true);
    try {
      if (allSelected) {
        // Alle als gelesen markieren
        const res = await fetch("/api/notifications/bulk/read", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ all: true }),
        });
        if (res.ok) {
          setSelectedIds(new Set());
          setAllSelected(false);
          await fetchNotifications();
        }
      } else {
        // Bestimmte IDs — in Batches
        const ids = Array.from(selectedIds);

        for (let i = 0; i < ids.length; i += 500) {
          const batch = ids.slice(i, i + 500);
          await fetch("/api/notifications/bulk/read", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: batch }),
          });
        }

        setSelectedIds(new Set());
        setAllSelected(false);
        await fetchNotifications();
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setBulkActing(false);
    }
  };

  // Als gelesen markieren (einzeln)
  const handleMarkAsRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
        );
      }
    } catch {
      // Fehlerbehandlung
    }
  };

  // Alle als gelesen markieren
  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch("/api/notifications/read-all", { method: "PUT" });
      if (res.ok) {
        setNotifications((prev) =>
          prev.map((n) => ({ ...n, isRead: true }))
        );
      }
    } catch {
      // Fehlerbehandlung
    }
  };

  // Einzelne Benachrichtigung löschen
  const handleDelete = async (id: string) => {
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      if (res.ok) {
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotal((prev) => prev - 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  };

  // ALLE Benachrichtigungen löschen (mit Bestätigung)
  const handleDeleteAll = async () => {
    if (!deleteAllConfirm) {
      setDeleteAllConfirm(true);
      return;
    }

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/notifications/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          all: true,
          category: categoryFilter || undefined,
        }),
      });
      if (res.ok) {
        setSelectedIds(new Set());
        setAllSelected(false);
        setDeleteAllConfirm(false);
        setPage(0);
        await fetchNotifications();
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setBulkDeleting(false);
    }
  };

  // Alle gelesenen löschen
  const handleDeleteAllRead = async () => {
    const readCount = notifications.filter((n) => n.isRead).length;
    if (readCount === 0) return;

    setBulkDeleting(true);
    try {
      const res = await fetch("/api/notifications/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ readOnly: true }),
      });
      if (res.ok) {
        await fetchNotifications();
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setBulkDeleting(false);
    }
  };

  // Bestätigung abbrechen wenn man wegklickt
  useEffect(() => {
    if (deleteAllConfirm) {
      const timer = setTimeout(() => setDeleteAllConfirm(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [deleteAllConfirm]);

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasUnread = notifications.some((n) => !n.isRead);
  const hasRead = notifications.some((n) => n.isRead);

  // Prüfe ob unter den ausgewählten (auf der sichtbaren Seite) ungelesene sind
  const selectedHasUnread = allSelected
    ? hasUnread || total > notifications.length // Bei "Alle" gehen wir davon aus, dass ungelesene vorhanden
    : Array.from(selectedIds).some((id) => {
        const n = notifications.find((notif) => notif.id === id);
        return n && !n.isRead;
      });

  // Zeitstempel formatieren
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Gerade eben";
    if (minutes < 60) return `Vor ${minutes} Min.`;
    if (hours < 24) return `Vor ${hours} Std.`;
    if (days < 7) return `Vor ${days} Tag${days > 1 ? "en" : ""}`;
    return date.toLocaleDateString("de-CH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Icon für Typ
  const getIcon = (type: string) => {
    switch (type) {
      case "preisradar_alert":
        return "🔍";
      case "welcome":
        return "👋";
      case "referral":
        return "🎁";
      case "system":
        return "ℹ️";
      default:
        return "📬";
    }
  };

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 py-8 overflow-x-hidden">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 truncate">🔔 Benachrichtigungen</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} Benachrichtigung{total !== 1 ? "en" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Alle löschen Button */}
          {total > 0 && (
            <button
              onClick={handleDeleteAll}
              disabled={bulkDeleting}
              className={`px-3 py-1.5 text-xs sm:text-sm rounded-lg transition font-medium disabled:opacity-50 whitespace-nowrap ${
                deleteAllConfirm
                  ? "bg-red-600 text-white hover:bg-red-700"
                  : "text-red-600 hover:text-red-700 hover:bg-red-50"
              }`}
            >
              {bulkDeleting
                ? "Löscht..."
                : deleteAllConfirm
                ? `🗑 Wirklich ${categoryFilter ? CATEGORY_TABS.find((t) => t.id === categoryFilter)?.label || "" : "alle"} ${total} löschen?`
                : `🗑 Alle löschen`}
            </button>
          )}
          {hasRead && !deleteAllConfirm && (
            <button
              onClick={handleDeleteAllRead}
              disabled={bulkDeleting}
              className="px-3 py-1.5 text-xs sm:text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition font-medium disabled:opacity-50 whitespace-nowrap"
            >
              {bulkDeleting ? "Löscht..." : "🗑 Gelesene"}
            </button>
          )}
          {hasUnread && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-3 py-1.5 text-xs sm:text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition font-medium whitespace-nowrap"
            >
              ✓ Alle gelesen
            </button>
          )}
          <Link
            href="/dashboard/einstellungen"
            className="px-3 py-1.5 text-xs sm:text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition whitespace-nowrap"
          >
            ⚙️
          </Link>
        </div>
      </div>

      {/* Kategorie-Filter-Tabs — scrollbar auf Mobile */}
      <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-none">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setCategoryFilter(tab.id);
              setPage(0);
              setDeleteAllConfirm(false);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition flex-shrink-0 ${
              categoryFilter === tab.id
                ? "bg-emerald-600 text-white"
                : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
            }`}
          >
            {tab.emoji} {tab.label}
          </button>
        ))}
      </div>

      {/* Bulk-Aktionsleiste */}
      {someSelected && (
        <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 shadow-sm">
          <span className="text-sm text-gray-600 font-medium">
            {allSelected ? (
              <span className="text-emerald-700 font-bold">
                Alle {total} ausgewählt
              </span>
            ) : (
              <>{selectedCount} ausgewählt</>
            )}
          </span>

          {/* Hinweis: "Alle X auswählen" wenn nicht alle selected sind */}
          {!allSelected && visibleAllSelected && total > notifications.length && (
            <button
              onClick={toggleSelectAll}
              className="text-xs text-emerald-600 hover:text-emerald-700 font-medium underline"
            >
              Alle {total} Benachrichtigungen auswählen
            </button>
          )}

          <div className="flex-1" />
          <div className="flex gap-2">
            {selectedHasUnread && (
              <button
                onClick={handleBulkMarkRead}
                disabled={bulkActing}
                className="px-3 sm:px-4 py-2 text-sm font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition disabled:opacity-50"
              >
                {bulkActing ? "..." : "✓ Gelesen"}
              </button>
            )}
            <button
              onClick={handleBulkDelete}
              disabled={bulkActing}
              className="px-3 sm:px-4 py-2 text-sm font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition disabled:opacity-50"
            >
              {bulkActing ? "Löscht..." : `🗑 ${allSelected ? "Alle" : selectedCount} löschen`}
            </button>
          </div>
        </div>
      )}

      {/* Liste */}
      {loading ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center text-gray-400">
          Laden...
        </div>
      ) : notifications.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12 text-center">
          <span className="text-4xl mb-4 block">🔔</span>
          <p className="text-gray-500">Keine Benachrichtigungen vorhanden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Alle auswählen Checkbox */}
          <div className="flex items-center gap-3 px-5 py-2">
            <label className="flex items-center gap-2 cursor-pointer select-none group">
              <input
                type="checkbox"
                checked={allSelected || visibleAllSelected}
                onChange={toggleSelectAll}
                className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-sm text-gray-500 group-hover:text-gray-700 transition">
                {allSelected
                  ? `Alle ${total} ausgewählt`
                  : `Alle auswählen`}
              </span>
            </label>
            {allSelected && (
              <button
                onClick={() => {
                  setAllSelected(false);
                  setSelectedIds(new Set());
                }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                Auswahl aufheben
              </button>
            )}
          </div>

          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-white rounded-xl shadow-sm border transition ${
                !n.isRead
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-gray-200"
              } ${deletingIds.has(n.id) ? "opacity-50" : ""} ${
                selectedIds.has(n.id) || allSelected ? "ring-2 ring-emerald-200" : ""
              }`}
            >
              <div className="px-5 py-4 flex gap-3 items-start">
                {/* Checkbox */}
                <div className="flex-shrink-0 pt-0.5">
                  <input
                    type="checkbox"
                    checked={allSelected || selectedIds.has(n.id)}
                    onChange={() => toggleSelect(n.id)}
                    className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                </div>

                {/* Thumbnail or Icon */}
                {n.imageUrl ? (
                  <div className="w-12 h-12 flex-shrink-0 rounded-lg overflow-hidden bg-gray-100">
                    <img
                      src={n.imageUrl}
                      alt=""
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = "none";
                        const parent = target.parentElement;
                        if (parent) {
                          parent.classList.add("flex", "items-center", "justify-center");
                          const icon = document.createElement("span");
                          icon.className = "text-xl";
                          icon.textContent = getIcon(n.type);
                          parent.appendChild(icon);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <span className="text-xl flex-shrink-0 mt-0.5">
                    {getIcon(n.type)}
                  </span>
                )}

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p
                        className={`text-sm ${
                          !n.isRead
                            ? "font-semibold text-gray-900"
                            : "font-medium text-gray-700"
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className="text-sm text-gray-500 mt-1">{n.message}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {!n.isRead && (
                        <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
                      )}
                      {/* Löschen-Button */}
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={deletingIds.has(n.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                        title="Löschen"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 mt-2">
                    <span className="text-xs text-gray-400">
                      {formatTime(n.createdAt)}
                    </span>
                    {n.link && (
                      <a
                        href={n.link}
                        className="text-xs text-emerald-600 hover:text-emerald-700 font-medium"
                      >
                        Öffnen →
                      </a>
                    )}
                    {!n.isRead && (
                      <button
                        onClick={() => handleMarkAsRead(n.id)}
                        className="text-xs text-gray-400 hover:text-emerald-600 transition"
                      >
                        Als gelesen markieren
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-4 mt-6">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← Zurück
          </button>
          <span className="text-sm text-gray-500">
            Seite {page + 1} von {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="px-4 py-2 text-sm rounded-lg border border-gray-200 hover:bg-gray-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Weiter →
          </button>
        </div>
      )}
    </div>
    </main>
    <Footer />
    </div>
  );
}
