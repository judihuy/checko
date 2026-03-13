// Datenschutzerklärung — DSGVO-konforme Datenschutzseite
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function DatenschutzPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Datenschutzerklärung</h1>

          <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-8">
            {/* Verantwortlicher */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">1. Verantwortlicher</h2>
              <p className="text-gray-700 leading-relaxed">
                Marcel Huy / HuyDigital<br />
                Mittelstrasse 5<br />
                3414 Oberburg, Schweiz<br />
                E-Mail:{" "}
                <a href="mailto:datenschutz@checko.ch" className="text-emerald-600 hover:text-emerald-700">
                  datenschutz@checko.ch
                </a>
              </p>
            </section>

            {/* Welche Daten */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">2. Welche Daten wir erheben</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                Im Rahmen der Nutzung von Checko erheben und verarbeiten wir folgende personenbezogene Daten:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li><strong>Registrierungsdaten:</strong> Name, E-Mail-Adresse, verschlüsseltes Passwort</li>
                <li><strong>Zahlungsdaten:</strong> Werden direkt von Stripe verarbeitet (Kreditkarten-Daten werden nicht auf unseren Servern gespeichert)</li>
                <li><strong>Nutzungsdaten:</strong> Gebuchte Module, Sucheinstellungen, Aktivitätsprotokolle</li>
                <li><strong>Technische Daten:</strong> IP-Adresse, Browser-Typ, Betriebssystem (für Sicherheit und Fehlerbehebung)</li>
              </ul>
            </section>

            {/* Zweck */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">3. Zweck der Datenverarbeitung</h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Bereitstellung und Betrieb der Plattform</li>
                <li>Benutzerkontenverwaltung und Authentifizierung</li>
                <li>Abwicklung von Abonnements und Zahlungen</li>
                <li>Versand von transaktionalen E-Mails (Bestätigungen, Passwort-Reset)</li>
                <li>KI-basierte Analysen im Rahmen der gebuchten Module</li>
                <li>Sicherstellung der Plattform-Sicherheit (Rate-Limiting, Betrugs-Prävention)</li>
              </ul>
            </section>

            {/* Cookies */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">4. Cookies</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                Wir verwenden ausschliesslich notwendige Cookies:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li><strong>Session-Cookie:</strong> Für die Authentifizierung und Sitzungsverwaltung (NextAuth.js)</li>
                <li><strong>Einstellungs-Cookie:</strong> Speichert deine Cookie-Präferenz</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                Wir verwenden <strong>keine</strong> Tracking-, Marketing- oder Analyse-Cookies.
              </p>
            </section>

            {/* Drittanbieter */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">5. Drittanbieter</h2>
              <p className="text-gray-700 leading-relaxed mb-3">Wir nutzen folgende Drittanbieter-Dienste:</p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>
                  <strong>Stripe</strong> (Stripe, Inc., USA) — Zahlungsabwicklung.{" "}
                  <a href="https://stripe.com/de/privacy" className="text-emerald-600 hover:text-emerald-700" target="_blank" rel="noopener noreferrer">
                    Datenschutzerklärung von Stripe
                  </a>
                </li>
                <li>
                  <strong>Anthropic</strong> (Anthropic, PBC, USA) — KI-gestützte Analysen (z.B. Preis-Bewertungen, Betrugs-Erkennung).{" "}
                  <a href="https://www.anthropic.com/privacy" className="text-emerald-600 hover:text-emerald-700" target="_blank" rel="noopener noreferrer">
                    Datenschutzerklärung von Anthropic
                  </a>
                </li>
              </ul>
            </section>

            {/* Datensicherheit */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">6. Datensicherheit</h2>
              <p className="text-gray-700 leading-relaxed">
                Wir treffen angemessene technische und organisatorische Massnahmen zum Schutz deiner
                Daten. Dazu gehören verschlüsselte Datenübertragung (TLS/SSL), gehashte Passwörter
                (bcrypt), Zugriffsbeschränkungen und regelmässige Sicherheitsupdates.
              </p>
            </section>

            {/* Rechte */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">7. Deine Rechte</h2>
              <p className="text-gray-700 leading-relaxed mb-3">
                Du hast jederzeit folgende Rechte bezüglich deiner personenbezogenen Daten:
              </p>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li><strong>Auskunft:</strong> Du kannst Auskunft über deine gespeicherten Daten verlangen.</li>
                <li><strong>Berichtigung:</strong> Du kannst die Korrektur unrichtiger Daten verlangen.</li>
                <li><strong>Löschung:</strong> Du kannst die Löschung deiner Daten verlangen.</li>
                <li><strong>Widerspruch:</strong> Du kannst der Verarbeitung deiner Daten widersprechen.</li>
                <li><strong>Datenübertragbarkeit:</strong> Du kannst eine Kopie deiner Daten in einem gängigen Format anfordern.</li>
              </ul>
              <p className="text-gray-700 leading-relaxed mt-3">
                Kontakt für Datenschutz-Anfragen:{" "}
                <a href="mailto:datenschutz@checko.ch" className="text-emerald-600 hover:text-emerald-700">
                  datenschutz@checko.ch
                </a>
              </p>
            </section>

            {/* Aufbewahrung */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">8. Aufbewahrungsdauer</h2>
              <p className="text-gray-700 leading-relaxed">
                Personenbezogene Daten werden nur so lange aufbewahrt, wie es für die genannten Zwecke
                erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen. Nach Kündigung deines
                Kontos werden deine Daten innerhalb von 30 Tagen gelöscht, sofern keine gesetzlichen
                Aufbewahrungspflichten entgegenstehen.
              </p>
            </section>

            {/* Änderungen */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">9. Änderungen dieser Datenschutzerklärung</h2>
              <p className="text-gray-700 leading-relaxed">
                Wir behalten uns vor, diese Datenschutzerklärung jederzeit anzupassen. Die aktuelle
                Version ist stets auf dieser Seite abrufbar.
              </p>
              <p className="text-gray-500 text-sm mt-4">Stand: März 2026</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
