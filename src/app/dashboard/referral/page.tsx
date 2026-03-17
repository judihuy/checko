// Dashboard: Deine Empfehlungen
// Einladungslink, Share-Buttons, Statistiken, Tabelle
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";

interface ReferralData {
  referralCode: string;
  totalReferrals: number;
  totalCheckosEarned: number;
  referrals: {
    id: string;
    referredName: string | null;
    referredEmail: string;
    checkosEarned: number;
    createdAt: string;
  }[];
}

export default function ReferralDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch("/api/referral/stats");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const json = await res.json();
      setData(json);
    } catch {
      setError("Statistiken konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
      return;
    }
    if (status === "authenticated") {
      loadStats();
    }
  }, [status, router, loadStats]);

  const referralLink = data
    ? `${typeof window !== "undefined" ? window.location.origin : "https://checko.ch"}/ref/${data.referralCode}`
    : "";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const input = document.createElement("input");
      input.value = referralLink;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const shareWhatsApp = () => {
    const text = `Hey! Registriere dich bei Checko und wir bekommen beide 10 Checkos! 🦎 ${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const shareTelegram = () => {
    const text = `Hey! Registriere dich bei Checko und wir bekommen beide 10 Checkos! 🦎`;
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(text)}`,
      "_blank"
    );
  };

  // E-Mail maskieren
  const maskEmail = (email: string): string => {
    const [local, domain] = email.split("@");
    if (!local || !domain) return email;
    const masked = local.length > 2
      ? `${local[0]}${"*".repeat(local.length - 2)}${local[local.length - 1]}`
      : `${local[0]}*`;
    return `${masked}@${domain}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-8">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <Link href="/dashboard" className="text-emerald-600 hover:text-emerald-700 text-sm font-medium mb-2 inline-block">
              ← Zurück zum Dashboard
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">🤝 Deine Empfehlungen</h1>
            <p className="text-gray-600 mt-1">
              Lade Freunde ein und verdiene Checkos!
            </p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl">
              {error}
            </div>
          )}

          {data && (
            <>
              {/* Stats Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 mb-1">Empfehlungen</p>
                  <p className="text-3xl font-bold text-gray-900">{data.totalReferrals}</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 mb-1">Verdiente Checkos</p>
                  <p className="text-3xl font-bold text-emerald-600">{data.totalCheckosEarned} 🦎</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <p className="text-sm text-gray-500 mb-1">Dein Code</p>
                  <p className="text-2xl font-bold font-mono text-gray-900">{data.referralCode}</p>
                </div>
              </div>

              {/* Einladungslink + Share */}
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 sm:p-8 mb-8 text-white shadow-lg">
                <h2 className="text-xl font-bold mb-2">Freunde einladen</h2>
                <p className="text-emerald-100 mb-4">
                  Teile deinen Link — ihr bekommt beide <strong>10 Checkos</strong>!
                  Plus: Du verdienst <strong>10% Provision</strong> auf jeden Checko-Kauf deiner Freunde.
                </p>

                {/* Link */}
                <div className="bg-white/20 backdrop-blur rounded-lg px-4 py-3 flex items-center gap-2 mb-4">
                  <span className="flex-1 text-sm font-mono truncate">
                    {referralLink}
                  </span>
                  <button
                    onClick={copyLink}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition ${
                      copied
                        ? "bg-emerald-300 text-emerald-900"
                        : "bg-white text-emerald-700 hover:bg-emerald-50"
                    }`}
                  >
                    {copied ? "✅ Kopiert!" : "📋 Kopieren"}
                  </button>
                </div>

                {/* Share Buttons */}
                <div className="flex flex-wrap gap-3">
                  <button
                    onClick={shareWhatsApp}
                    className="flex items-center gap-2 bg-green-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-green-600 transition shadow-md"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                    </svg>
                    WhatsApp
                  </button>
                  <button
                    onClick={shareTelegram}
                    className="flex items-center gap-2 bg-blue-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-600 transition shadow-md"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.479.33-.913.492-1.302.48-.428-.013-1.252-.242-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                    </svg>
                    Telegram
                  </button>
                  <button
                    onClick={copyLink}
                    className="flex items-center gap-2 bg-gray-500 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-gray-600 transition shadow-md"
                  >
                    🔗 Link kopieren
                  </button>
                </div>
              </div>

              {/* So funktioniert's */}
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                <h3 className="font-semibold text-gray-900 mb-4">So funktioniert&apos;s</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="text-center p-4">
                    <span className="text-3xl block mb-2">📤</span>
                    <p className="font-medium text-gray-900">1. Link teilen</p>
                    <p className="text-sm text-gray-500 mt-1">Schicke deinen Link an Freunde</p>
                  </div>
                  <div className="text-center p-4">
                    <span className="text-3xl block mb-2">✅</span>
                    <p className="font-medium text-gray-900">2. Freund registriert sich</p>
                    <p className="text-sm text-gray-500 mt-1">Ihr bekommt beide 10 Checkos</p>
                  </div>
                  <div className="text-center p-4">
                    <span className="text-3xl block mb-2">💰</span>
                    <p className="font-medium text-gray-900">3. Freund kauft Checkos</p>
                    <p className="text-sm text-gray-500 mt-1">Du bekommst 10% als Provision</p>
                  </div>
                </div>
              </div>

              {/* Empfehlungen-Tabelle */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="font-semibold text-gray-900">Deine Empfehlungen</h3>
                </div>
                {data.referrals.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Name
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            E-Mail
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Verdient
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                            Datum
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {data.referrals.map((ref) => (
                          <tr key={ref.id}>
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {ref.referredName || "—"}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {maskEmail(ref.referredEmail)}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-emerald-600">
                              +{ref.checkosEarned} 🦎
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-500">
                              {new Date(ref.createdAt).toLocaleDateString("de-CH", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="px-6 py-12 text-center">
                    <span className="text-4xl block mb-3">🤝</span>
                    <p className="text-gray-500">Noch keine Empfehlungen.</p>
                    <p className="text-sm text-gray-400 mt-1">Teile deinen Link und verdiene Checkos!</p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
