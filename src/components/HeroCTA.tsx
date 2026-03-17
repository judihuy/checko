// Hero CTA Buttons — Login-aware
// Eingeloggt: "Zum Dashboard" statt "Jetzt kostenlos starten"
"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";

export function HeroCTA() {
  const { data: session, status } = useSession();

  // Während Laden: Platzhalter (gleiche Höhe) um Layout-Shift zu vermeiden
  if (status === "loading") {
    return (
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <div className="bg-emerald-600 text-emerald-600 px-8 py-3 rounded-lg text-lg font-medium opacity-0">
          Platzhalter
        </div>
        <div className="bg-white text-white px-8 py-3 rounded-lg text-lg font-medium opacity-0">
          Platzhalter
        </div>
      </div>
    );
  }

  if (session) {
    return (
      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <Link
          href="/dashboard"
          className="bg-emerald-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
        >
          Zum Dashboard
        </Link>
        <Link
          href="/#module"
          className="bg-white text-gray-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition border border-gray-200"
        >
          Module entdecken
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center">
      <Link
        href="/register"
        className="bg-emerald-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-emerald-700 transition shadow-lg shadow-emerald-200"
      >
        Jetzt kostenlos starten
      </Link>
      <Link
        href="/#module"
        className="bg-white text-gray-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition border border-gray-200"
      >
        Module entdecken
      </Link>
    </div>
  );
}

export function BottomCTA() {
  const { data: session, status } = useSession();

  if (status === "loading") {
    return (
      <div className="inline-block bg-white text-white px-8 py-3 rounded-lg text-lg font-medium opacity-0">
        Platzhalter
      </div>
    );
  }

  if (session) {
    return (
      <Link
        href="/dashboard"
        className="inline-block bg-white text-emerald-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition shadow-lg"
      >
        Zum Dashboard
      </Link>
    );
  }

  return (
    <Link
      href="/register"
      className="inline-block bg-white text-emerald-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition shadow-lg"
    >
      Jetzt kostenlos starten
    </Link>
  );
}
