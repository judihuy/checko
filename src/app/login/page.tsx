// Login page — Email + Password authentication
// Redirect zu /dashboard wenn bereits eingeloggt
"use client";

import { Suspense } from "react";
import { useState, useEffect } from "react";
import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Redirect wenn bereits eingeloggt
  useEffect(() => {
    if (status === "authenticated") {
      router.replace("/dashboard");
    }
  }, [status, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        rememberMe: rememberMe ? "true" : "false",
        redirect: false,
      });

      if (result?.error) {
        setError("Ungültige E-Mail oder Passwort.");
      } else {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("Ein unerwarteter Fehler ist aufgetreten.");
    } finally {
      setLoading(false);
    }
  };

  // Während Session geladen wird oder User eingeloggt ist → Spinner
  if (status === "loading" || status === "authenticated") {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
            E-Mail
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

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
            Passwort
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition"
            placeholder="••••••••"
          />
        </div>
      </div>

      {/* Angemeldet bleiben Checkbox */}
      <div className="flex items-center mt-4">
        <input
          id="rememberMe"
          type="checkbox"
          checked={rememberMe}
          onChange={(e) => setRememberMe(e.target.checked)}
          className="w-4 h-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
        />
        <label htmlFor="rememberMe" className="ml-2 text-sm text-gray-600 cursor-pointer select-none">
          Angemeldet bleiben
        </label>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full mt-4 bg-emerald-600 text-white py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Wird angemeldet..." : "Anmelden"}
      </button>

      <div className="flex items-center justify-between mt-4">
        <Link
          href="/passwort-vergessen"
          className="text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          Passwort vergessen?
        </Link>
        <p className="text-sm text-gray-600">
          Noch kein Konto?{" "}
          <Link href="/register" className="text-emerald-600 hover:text-emerald-700 font-medium">
            Jetzt registrieren
          </Link>
        </p>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <span className="text-4xl">🦎</span>
            <h1 className="text-2xl font-bold text-gray-900 mt-4">Anmelden</h1>
            <p className="text-gray-600 mt-2">
              Willkommen zurück bei Checko
            </p>
          </div>
          <Suspense fallback={<div className="text-center text-gray-500">Laden...</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
      <Footer />
    </div>
  );
}
