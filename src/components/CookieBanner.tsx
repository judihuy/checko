// Cookie Banner (DSGVO) — dezente Bar am unteren Rand
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
    <div className="fixed bottom-0 left-0 right-0 z-[100] bg-gray-900/90 backdrop-blur-sm border-t border-gray-700">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <p className="text-xs text-gray-300">
            Wir nutzen Cookies für die Funktionalität.{" "}
            <Link href="/datenschutz" className="text-emerald-400 hover:text-emerald-300 underline">
              Mehr erfahren
            </Link>
          </p>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={handleNecessary}
              className="px-3 py-1 text-xs font-medium text-gray-300 hover:text-white transition"
            >
              Nur notwendige
            </button>
            <button
              onClick={handleAccept}
              className="px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded transition"
            >
              OK
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
