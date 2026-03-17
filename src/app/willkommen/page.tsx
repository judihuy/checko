// Willkommens-Seite nach Registrierung + Verifizierung
// Zeigt Glücksrad-Animation + "Du bist User #X!" + Weiter zum Dashboard
// Prüft ob Registrierungs-Glücksrad aktiviert ist
"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { WheelSpinner } from "@/components/WheelSpinner";

function WillkommenContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [wheelDone, setWheelDone] = useState(false);
  const [wonAmount, setWonAmount] = useState(0);
  const [wheelEnabled, setWheelEnabled] = useState<boolean | null>(null);
  const [alreadySpun, setAlreadySpun] = useState(false);
  const verified = searchParams.get("verified") === "true";

  // Wenn nicht eingeloggt → zur Login-Seite
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?verified=true");
    }
  }, [status, router]);

  // Prüfe ob Registrierungs-Glücksrad aktiv ist
  useEffect(() => {
    if (status === "authenticated") {
      fetch("/api/wheel/registration")
        .then((res) => res.json())
        .then((data) => {
          setWheelEnabled(data.regEnabled ?? true);
          setAlreadySpun(data.alreadySpun ?? false);
          if (data.alreadySpun && data.amount) {
            setWonAmount(data.amount);
            setWheelDone(true);
          }
        })
        .catch(() => {
          setWheelEnabled(true); // Fallback: aktiviert
        });
    }
  }, [status]);

  const handleWheelComplete = (amount: number) => {
    setWonAmount(amount);
    setWheelDone(true);
  };

  if (status === "loading" || wheelEnabled === null) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src="/gecko-logo.png" alt="Laden..." className="w-12 h-12 animate-gecko-pulse" />
          <span className="text-gray-400 text-sm">Laden...</span>
        </div>
      </div>
    );
  }

  return (
    <main className="flex-1 py-12">
      <div className="max-w-2xl mx-auto px-4 text-center">
        {/* Willkommens-Header */}
        <div className="mb-8">
          {/* Gecko-Animation (D) — Begrüssung */}
          <div className="w-28 h-28 mx-auto mb-4 rounded-full overflow-hidden shadow-lg">
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            >
              <source src="/gecko-03.mp4" type="video/mp4" />
            </video>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Willkommen bei Checko!
          </h1>
          {verified && (
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              ✅ E-Mail erfolgreich bestätigt!
            </div>
          )}
          {wheelEnabled ? (
            <p className="text-gray-600 text-lg">
              {session?.user?.name
                ? `Hey ${session.user.name}, drehe das Glücksrad und sichere dir deine Willkommens-Checkos!`
                : "Drehe das Glücksrad und sichere dir deine Willkommens-Checkos!"}
            </p>
          ) : (
            <p className="text-gray-600 text-lg">
              {session?.user?.name
                ? `Hey ${session.user.name}, willkommen bei Checko!`
                : "Willkommen bei Checko!"}
            </p>
          )}
        </div>

        {/* Glücksrad oder deaktivierte Meldung */}
        {!wheelEnabled ? (
          // Glücksrad deaktiviert
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 sm:p-12">
            <div className="text-5xl mb-4">🎡</div>
            <p className="text-gray-500 text-lg mb-6">
              Das Glücksrad ist aktuell nicht verfügbar.
            </p>
            <Link
              href="/dashboard"
              className="inline-block bg-emerald-600 text-white px-8 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition shadow-md"
            >
              Weiter zum Dashboard →
            </Link>
          </div>
        ) : !wheelDone ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 sm:p-12">
            <p className="text-sm text-orange-600 font-medium mb-6">
              ⏰ Dieses Angebot ist zeitlich begrenzt!
            </p>
            <WheelSpinner
              type="registration"
              onComplete={handleWheelComplete}
              buttonText="🎡 Jetzt drehen und Checkos gewinnen!"
            />
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 sm:p-12 animate-bounce-in">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {alreadySpun ? "Du hast bereits gedreht!" : "Glückwunsch!"}
            </h2>
            <p className="text-lg text-gray-600 mb-6">
              Du hast <span className="font-bold text-emerald-600">{wonAmount} Checkos</span> gewonnen!
            </p>

            <div className="space-y-3">
              <Link
                href="/dashboard"
                className="block w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition shadow-md"
              >
                Weiter zum Dashboard →
              </Link>
              <Link
                href="/dashboard/referral"
                className="block w-full bg-white border border-emerald-200 text-emerald-700 py-3 rounded-xl font-medium hover:bg-emerald-50 transition"
              >
                🤝 Freunde einladen & mehr Checkos verdienen
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function WillkommenPage() {
  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-white via-emerald-50 to-white">
      <Navbar />
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <img src="/gecko-logo.png" alt="Laden..." className="w-12 h-12 animate-gecko-pulse" />
              <span className="text-gray-400 text-sm">Laden...</span>
            </div>
          </div>
        }
      >
        <WillkommenContent />
      </Suspense>
      <Footer />
    </div>
  );
}
