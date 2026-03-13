// Referral Landing Page — /ref/[code]
// "Du wurdest von einem Freund eingeladen!"
// Redirect zu /register?ref=CODE

import { redirect } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function ReferralLandingPage({ params }: Props) {
  const { code } = await params;

  // Wenn kein Code → zur Startseite
  if (!code || code.length < 3) {
    redirect("/");
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-emerald-50 via-white to-emerald-50">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="max-w-lg w-full text-center">
          {/* Einladungs-Card */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-xl p-8 sm:p-12">
            <div className="text-6xl mb-4">🎁</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-3">
              Du wurdest eingeladen!
            </h1>
            <p className="text-lg text-gray-600 mb-2">
              Ein Freund hat dir <span className="font-bold text-emerald-600">10 Checkos</span> geschenkt!
            </p>
            <p className="text-gray-500 mb-8">
              Registriere dich jetzt bei Checko und erhalte dein Startguthaben.
              Dein Freund bekommt auch 10 Checkos als Dankeschön.
            </p>

            {/* Vorteile */}
            <div className="bg-emerald-50 rounded-xl p-5 mb-8 text-left">
              <h3 className="font-semibold text-emerald-800 mb-3">Das bekommst du:</h3>
              <ul className="space-y-2">
                <li className="flex items-center gap-2 text-emerald-700">
                  <span className="text-lg">🎡</span>
                  <span>Glücksrad mit bis zu 50 Checkos</span>
                </li>
                <li className="flex items-center gap-2 text-emerald-700">
                  <span className="text-lg">🎁</span>
                  <span>10 Bonus-Checkos durch die Einladung</span>
                </li>
                <li className="flex items-center gap-2 text-emerald-700">
                  <span className="text-lg">🦎</span>
                  <span>Zugang zu allen Checko-Modulen</span>
                </li>
              </ul>
            </div>

            {/* CTA */}
            <Link
              href={`/register?ref=${encodeURIComponent(code)}`}
              className="block w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 transition shadow-lg hover:shadow-xl"
            >
              Jetzt kostenlos registrieren 🚀
            </Link>

            <p className="text-xs text-gray-400 mt-4">
              Kostenlos und unverbindlich. Keine Kreditkarte nötig.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
