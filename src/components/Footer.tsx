// Footer component with legal links
import Link from "next/link";
import { ObfuscatedEmail } from "@/components/ObfuscatedEmail";

export function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 mt-auto">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 text-white text-lg font-bold mb-3">
              <img src="/gecko-logo.svg" alt="Checko" className="w-6 h-6 inline-block" />
              <span>Checko</span>
            </div>
            <p className="text-sm">
              Dein Toolkit für alles. Smarte Module für den Alltag.
            </p>
          </div>

          {/* Links */}
          <div>
            <h3 className="text-white font-semibold mb-3">Links</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/#module" className="hover:text-white transition">
                  Module
                </Link>
              </li>
              <li>
                <Link href="/#preise" className="hover:text-white transition">
                  Preise
                </Link>
              </li>
              <li>
                <Link href="/login" className="hover:text-white transition">
                  Anmelden
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h3 className="text-white font-semibold mb-3">Rechtliches</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/impressum" className="hover:text-white transition">
                  Impressum
                </Link>
              </li>
              <li>
                <Link href="/datenschutz" className="hover:text-white transition">
                  Datenschutz
                </Link>
              </li>
              <li>
                <Link href="/agb" className="hover:text-white transition">
                  AGB
                </Link>
              </li>
              <li>
                <ObfuscatedEmail
                  user="kontakt"
                  domain="checko.ch"
                  className="text-gray-400 hover:text-white transition"
                />
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Checko — Ein Produkt von Huy Digital</p>
        </div>
      </div>
    </footer>
  );
}
