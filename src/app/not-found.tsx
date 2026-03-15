// 404-Seite — Nicht gefunden
// Mit Gecko-Animation (gecko-04.mp4) als lustiges Element

import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-16">
        <div className="text-center px-4">
          {/* Gecko-Animation (E) */}
          <div className="w-40 h-40 mx-auto mb-6 rounded-2xl overflow-hidden shadow-lg">
            <video
              autoPlay
              muted
              loop
              playsInline
              preload="metadata"
              className="w-full h-full object-cover"
            >
              <source src="/gecko-04.mp4" type="video/mp4" />
            </video>
          </div>

          <h1 className="text-6xl font-bold text-gray-300 mb-2">404</h1>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Oops! Diese Seite wurde nicht gefunden.
          </h2>
          <p className="text-gray-500 mb-8 max-w-md mx-auto">
            Der Gecko hat überall gesucht, aber diese Seite existiert leider nicht.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/"
              className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-emerald-700 transition shadow-md"
            >
              🏠 Zur Startseite
            </Link>
            <Link
              href="/dashboard"
              className="bg-white border border-gray-200 text-gray-700 px-6 py-3 rounded-xl font-medium hover:bg-gray-50 transition"
            >
              📊 Zum Dashboard
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
