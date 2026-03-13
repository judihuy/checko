// Passwort vergessen — E-Mail eingeben für Reset-Link
"use client";

import { useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function PasswortVergessenPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Ein Fehler ist aufgetreten.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <span className="text-4xl">🦎</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Passwort vergessen?</h1>
            <p className="text-gray-600 mt-2">
              Gib deine E-Mail-Adresse ein und wir senden dir einen Link zum Zurücksetzen.
            </p>
          </div>

          {submitted ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center">
              <span className="text-4xl block mb-4">📧</span>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">E-Mail gesendet!</h2>
              <p className="text-gray-600 text-sm mb-6">
                Falls ein Konto mit dieser E-Mail-Adresse existiert, erhältst du in Kürze
                einen Link zum Zurücksetzen deines Passworts.
              </p>
              <Link
                href="/login"
                className="text-emerald-600 hover:text-emerald-700 font-medium text-sm"
              >
                Zurück zum Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  E-Mail-Adresse
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
                  placeholder="deine@email.ch"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-6 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Wird gesendet..." : "Reset-Link senden"}
              </button>

              <p className="text-center text-sm text-gray-600 mt-4">
                <Link href="/login" className="text-emerald-600 hover:text-emerald-700 font-medium">
                  Zurück zum Login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
