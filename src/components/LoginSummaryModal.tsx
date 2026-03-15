// Login-Zusammenfassung Modal — zeigt nach Login ein kompaktes Dashboard-Popup
"use client";

import { useEffect, useState, useCallback } from "react";

interface SummaryData {
  newAlerts: number;
  wheelAvailable: boolean;
  wheelBonusSpins: number;
  unreadNotifications: number;
  checkosBalance: number;
}

export function LoginSummaryModal() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [visible, setVisible] = useState(false);

  const fetchSummary = useCallback(async () => {
    // Nur anzeigen wenn gerade eingeloggt (Session-Flag)
    const shown = sessionStorage.getItem("login_summary_shown");
    if (shown === "true") return;

    try {
      const res = await fetch("/api/dashboard/summary");
      if (!res.ok) return;
      const summaryData = await res.json();
      setData(summaryData);

      // Nur anzeigen wenn es was Interessantes gibt
      const hasContent =
        summaryData.newAlerts > 0 ||
        summaryData.wheelAvailable ||
        summaryData.wheelBonusSpins > 0 ||
        summaryData.unreadNotifications > 0;

      if (hasContent) {
        setVisible(true);
      }

      // Flag setzen damit es nur 1x pro Session erscheint
      sessionStorage.setItem("login_summary_shown", "true");
    } catch {
      // Fehler ignorieren
    }
  }, []);

  useEffect(() => {
    // Kurze Verzögerung damit die Seite erst laden kann
    const timer = setTimeout(fetchSummary, 500);
    return () => clearTimeout(timer);
  }, [fetchSummary]);

  if (!visible || !data) return null;

  const items: { emoji: string; text: string }[] = [];

  if (data.newAlerts > 0) {
    items.push({
      emoji: "📡",
      text: `${data.newAlerts} neue Preisradar-Treffer`,
    });
  }

  if (data.wheelAvailable) {
    items.push({
      emoji: "🎰",
      text: data.wheelBonusSpins > 0
        ? `Glücksrad bereit! (${data.wheelBonusSpins} Bonus-Drehung${data.wheelBonusSpins > 1 ? "en" : ""})`
        : "Glücksrad bereit!",
    });
  }

  if (data.unreadNotifications > 0) {
    items.push({
      emoji: "🔔",
      text: `${data.unreadNotifications} ungelesene Benachrichtigung${data.unreadNotifications > 1 ? "en" : ""}`,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 animate-fade-in">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-6 py-5 text-white text-center">
          <span className="text-3xl block mb-1">👋</span>
          <h2 className="text-lg font-bold">Willkommen zurück!</h2>
          <p className="text-emerald-100 text-sm mt-1">
            💰 {data.checkosBalance} Checkos auf deinem Konto
          </p>
        </div>

        {/* Items */}
        {items.length > 0 && (
          <div className="px-6 py-4 space-y-3">
            {items.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                <span className="text-xl">{item.emoji}</span>
                <span className="text-sm font-medium text-gray-700">{item.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Button */}
        <div className="px-6 pb-5">
          <button
            onClick={() => setVisible(false)}
            className="w-full py-3 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition"
          >
            OK, verstanden! 👍
          </button>
        </div>
      </div>
    </div>
  );
}
