// Verifizierung gesendet — Info-Seite nach Registrierung
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function VerifizierungGesendetPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <div className="flex-1 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full text-center">
          <span className="text-5xl block mb-6">📧</span>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Bitte prüfe dein E-Mail-Postfach
          </h1>
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
            <p className="text-gray-600 mb-4">
              Wir haben dir eine E-Mail mit einem Bestätigungslink gesendet.
              Klicke auf den Link in der E-Mail, um dein Konto zu aktivieren.
            </p>
            <p className="text-gray-500 text-sm mb-6">
              Prüfe auch deinen Spam-Ordner, falls du die E-Mail nicht findest.
            </p>
            <Link
              href="/login"
              className="inline-block bg-emerald-600 text-white px-6 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition"
            >
              Zum Login
            </Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
