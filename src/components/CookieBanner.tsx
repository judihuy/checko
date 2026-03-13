// Cookie Banner (DSGVO) — shows at bottom of page if user hasn't consented yet
"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      setVisible(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "all");
    setVisible(false);
  };

  const handleNecessary = () => {
    localStorage.setItem("cookie-consent", "necessary");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-white border-t border-gray-200 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-sm text-gray-600 max-w-2xl">
            Wir verwenden Cookies für die Funktionalität der Seite. Weitere Infos in unserer{" "}
            <Link href="/datenschutz" className="text-emerald-600 hover:text-emerald-700 underline">
              Datenschutzerklärung
            </Link>
            .
          </p>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={handleNecessary}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
            >
              Nur notwendige
            </button>
            <button
              onClick={handleAccept}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition"
            >
              Akzeptieren
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
