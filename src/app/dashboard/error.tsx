// Error Boundary für /dashboard/* Seiten
// Fängt Client-Side Fehler ab und zeigt benutzerfreundliche Meldung
"use client";

import { useEffect } from "react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Dashboard Error:", error);
  }, [error]);

  return (
    <div className="flex-1 flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full text-center">
        <span className="text-5xl block mb-4">😵</span>
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          Etwas ist schiefgelaufen
        </h2>
        <p className="text-gray-600 mb-6 text-sm">
          Ein unerwarteter Fehler ist aufgetreten. Bitte versuche es erneut.
        </p>
        <button
          onClick={reset}
          className="bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition"
        >
          Erneut versuchen
        </button>
      </div>
    </div>
  );
}
