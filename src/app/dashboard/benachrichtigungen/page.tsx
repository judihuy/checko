// Benachrichtigungen-Seite — /dashboard/benachrichtigungen
// Mit Löschen-Funktion (einzeln + alle gelesenen)
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const PAGE_SIZE = 10;

export default function BenachrichtigungenPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/notifications?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`
      );
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
  }, [page]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Als gelesen markieren
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
        // Optimistic Update
        setNotifications((prev) => prev.filter((n) => n.id !== id));
        setTotal((prev) => prev - 1);
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
        // Seite neu laden um korrekte Pagination zu bekommen
        await fetchNotifications();
      }
    } catch {
      // Fehlerbehandlung
    } finally {
      setBulkDeleting(false);
    }
  };

  const totalPages = Math.ceil(total / PAGE_SIZE);
  const hasUnread = notifications.some((n) => !n.isRead);
  const hasRead = notifications.some((n) => n.isRead);

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
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">🔔 Benachrichtigungen</h1>
          <p className="text-gray-500 text-sm mt-1">
            {total} Benachrichtigung{total !== 1 ? "en" : ""}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
          {hasRead && (
            <button
              onClick={handleDeleteAllRead}
              disabled={bulkDeleting}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition font-medium disabled:opacity-50"
            >
              {bulkDeleting ? "Löscht..." : "🗑 Gelesene löschen"}
            </button>
          )}
          {hasUnread && (
            <button
              onClick={handleMarkAllAsRead}
              className="px-4 py-2 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition font-medium"
            >
              Alle als gelesen markieren
            </button>
          )}
          <Link
            href="/dashboard/einstellungen"
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-700 hover:bg-gray-50 rounded-lg transition"
          >
            ⚙️ Einstellungen
          </Link>
        </div>
      </div>

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
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`bg-white rounded-xl shadow-sm border transition ${
                !n.isRead
                  ? "border-emerald-300 bg-emerald-50/30"
                  : "border-gray-200"
              } ${deletingIds.has(n.id) ? "opacity-50" : ""}`}
            >
              <div className="px-5 py-4 flex gap-3">
                {/* Icon */}
                <span className="text-xl flex-shrink-0 mt-0.5">
                  {getIcon(n.type)}
                </span>

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
  );
}
