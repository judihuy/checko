// Notification Bell — Glocke mit Badge und Dropdown
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
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

export function NotificationBell() {
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Ungelesen-Count laden
  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/count");
      if (res.ok) {
        const data = await res.json();
        setCount(data.count);
      }
    } catch {
      // Stille Fehlerbehandlung
    }
  }, []);

  // Letzte 5 Benachrichtigungen laden
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/notifications?limit=5&offset=0");
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications);
      }
    } catch {
      // Stille Fehlerbehandlung
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial Count laden + Polling alle 30s
  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  // Dropdown öffnen → Benachrichtigungen laden
  useEffect(() => {
    if (open) {
      fetchNotifications();
    }
  }, [open, fetchNotifications]);

  // Außerhalb klicken → schließen
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Als gelesen markieren
  const handleMarkAsRead = async (id: string) => {
    try {
      await fetch(`/api/notifications/${id}/read`, { method: "PUT" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Stille Fehlerbehandlung
    }
  };

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
    return date.toLocaleDateString("de-CH");
  };

  // Icon für Benachrichtigungs-Typ
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
    <div className="relative" ref={dropdownRef}>
      {/* Glocke-Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative p-2 text-gray-600 hover:text-emerald-700 transition rounded-lg hover:bg-gray-50"
        aria-label="Benachrichtigungen"
      >
        <svg
          className="w-6 h-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
          />
        </svg>

        {/* Badge */}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 inline-flex items-center justify-center px-1.5 py-0.5 text-[11px] font-bold leading-none text-white bg-red-600 rounded-full min-w-[20px] h-[20px] ring-2 ring-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
            <h3 className="font-semibold text-gray-800 text-sm">
              Benachrichtigungen
            </h3>
            {count > 0 && (
              <span className="text-xs text-emerald-600 font-medium">
                {count} ungelesen
              </span>
            )}
          </div>

          {/* Inhalt */}
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                Laden...
              </div>
            ) : notifications.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                Keine Benachrichtigungen
              </div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition cursor-pointer ${
                    !n.isRead ? "bg-emerald-50/50" : ""
                  }`}
                  onClick={() => {
                    if (!n.isRead) handleMarkAsRead(n.id);
                    if (n.link) {
                      setOpen(false);
                      window.location.href = n.link;
                    }
                  }}
                >
                  <div className="flex gap-2">
                    <span className="text-lg flex-shrink-0">{getIcon(n.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm truncate ${
                          !n.isRead ? "font-semibold text-gray-900" : "text-gray-700"
                        }`}
                      >
                        {n.title}
                      </p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">
                        {n.message}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        {formatTime(n.createdAt)}
                      </p>
                    </div>
                    {!n.isRead && (
                      <span className="w-2 h-2 bg-emerald-500 rounded-full flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <Link
            href="/dashboard/benachrichtigungen"
            onClick={() => setOpen(false)}
            className="block px-4 py-3 text-center text-sm text-emerald-600 hover:text-emerald-700 hover:bg-gray-50 border-t border-gray-200 font-medium transition"
          >
            Alle anzeigen
          </Link>
        </div>
      )}
    </div>
  );
}
