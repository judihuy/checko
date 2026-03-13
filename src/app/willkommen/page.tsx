// Willkommens-Seite nach Registrierung + Verifizierung
// Zeigt Glücksrad-Animation + "Du bist User #X!" + Weiter zum Dashboard
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
  const verified = searchParams.get("verified") === "true";

  // Wenn nicht eingeloggt → zur Login-Seite
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?verified=true");
    }
  }, [status, router]);

  const handleWheelComplete = (amount: number) => {
    setWonAmount(amount);
    setWheelDone(true);
  };

  if (status === "loading") {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
      </div>
    );
  }

  return (
    <main className="flex-1 py-12">
      <div className="max-w-2xl mx-auto px-4 text-center">
        {/* Willkommens-Header */}
        <div className="mb-8">
          <span className="text-6xl block mb-4">🦎</span>
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            Willkommen bei Checko!
          </h1>
          {verified && (
            <div className="inline-flex items-center gap-2 bg-emerald-100 text-emerald-700 px-4 py-2 rounded-full text-sm font-medium mb-4">
              ✅ E-Mail erfolgreich bestätigt!
            </div>
          )}
          <p className="text-gray-600 text-lg">
            {session?.user?.name
              ? `Hey ${session.user.name}, drehe das Glücksrad und sichere dir deine Willkommens-Checkos!`
              : "Drehe das Glücksrad und sichere dir deine Willkommens-Checkos!"}
          </p>
        </div>

        {/* Glücksrad */}
        {!wheelDone ? (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 sm:p-12">
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
              Glückwunsch!
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
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
          </div>
        }
      >
        <WillkommenContent />
      </Suspense>
      <Footer />
    </div>
  );
}
