// Main navigation bar with auth state awareness
"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { useState } from "react";

export function Navbar() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 text-xl font-bold text-emerald-700">
            <span className="text-2xl">🦎</span>
            <span>Checko</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/#module" className="text-gray-600 hover:text-emerald-700 transition">
              Module
            </Link>
            <Link href="/#preise" className="text-gray-600 hover:text-emerald-700 transition">
              Preise
            </Link>
            {session ? (
              <>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="text-gray-600 hover:text-emerald-700 transition"
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="text-gray-600 hover:text-emerald-700 transition"
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => signOut({ callbackUrl: "/" })}
                  className="text-gray-500 hover:text-gray-700 transition text-sm"
                >
                  Abmelden
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="text-gray-600 hover:text-emerald-700 transition"
                >
                  Anmelden
                </Link>
                <Link
                  href="/register"
                  className="bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 transition text-sm font-medium"
                >
                  Kostenlos starten
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-gray-600"
            aria-label="Menü öffnen"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              {mobileOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile menu */}
        {mobileOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link
              href="/#module"
              className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded"
              onClick={() => setMobileOpen(false)}
            >
              Module
            </Link>
            <Link
              href="/#preise"
              className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded"
              onClick={() => setMobileOpen(false)}
            >
              Preise
            </Link>
            {session ? (
              <>
                {session.user.role === "admin" && (
                  <Link
                    href="/admin"
                    className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded"
                    onClick={() => setMobileOpen(false)}
                  >
                    Admin
                  </Link>
                )}
                <Link
                  href="/dashboard"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded"
                  onClick={() => setMobileOpen(false)}
                >
                  Dashboard
                </Link>
                <button
                  onClick={() => {
                    setMobileOpen(false);
                    signOut({ callbackUrl: "/" });
                  }}
                  className="block w-full text-left px-3 py-2 text-gray-500 hover:bg-gray-50 rounded"
                >
                  Abmelden
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="block px-3 py-2 text-gray-600 hover:bg-gray-50 rounded"
                  onClick={() => setMobileOpen(false)}
                >
                  Anmelden
                </Link>
                <Link
                  href="/register"
                  className="block px-3 py-2 bg-emerald-600 text-white rounded text-center font-medium"
                  onClick={() => setMobileOpen(false)}
                >
                  Kostenlos starten
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
