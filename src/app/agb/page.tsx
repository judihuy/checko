// Allgemeine Geschäftsbedingungen (AGB)
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function AGBPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Allgemeine Geschäftsbedingungen (AGB)
          </h1>

          <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-8">
            {/* Geltungsbereich */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                1. Geltungsbereich
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Diese Allgemeinen Geschäftsbedingungen (AGB) gelten für alle Dienstleistungen
                und Angebote der Plattform Checko (checko.ch), betrieben von Huy Digital /
                Marcel Huy, Mittelstrasse 5, 3414 Oberburg, Schweiz. Mit der Registrierung und
                Nutzung von Checko erklärst du dich mit diesen AGB einverstanden.
              </p>
            </section>

            {/* Registrierung */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                2. Registrierung und Benutzerkonto
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>
                  Für die Nutzung von Checko ist eine Registrierung mit gültiger E-Mail-Adresse
                  erforderlich.
                </li>
                <li>
                  Du bist verpflichtet, wahrheitsgemässe Angaben zu machen und dein Passwort
                  vertraulich zu behandeln.
                </li>
                <li>
                  Du bist für alle Aktivitäten verantwortlich, die über dein Konto stattfinden.
                </li>
                <li>
                  Wir behalten uns vor, Konten bei Verstössen gegen diese AGB zu sperren oder
                  zu löschen.
                </li>
              </ul>
            </section>

            {/* Checkos */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                3. Checkos (Guthaben-System)
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>
                  Checkos sind die interne Währung von Checko. Sie werden als Vorauszahlung für
                  die Nutzung der Module erworben.
                </li>
                <li>
                  Checkos können in verschiedenen Paketen erworben werden. Die aktuellen Preise
                  sind auf der Webseite einsehbar. Alle Preise verstehen sich in Schweizer
                  Franken (CHF) inklusive Mehrwertsteuer.
                </li>
                <li>
                  Checkos stellen <strong>kein E-Geld</strong> dar, sondern eine Vorauszahlung
                  für konkrete Dienstleistungen (vergleichbar mit Guthaben im App Store oder
                  Prepaid-Karten).
                </li>
                <li>
                  <strong>Checkos sind nicht rückerstattbar.</strong> Mit dem Kauf akzeptierst
                  du, dass erworbene Checkos nicht in Geld zurückgetauscht werden können.
                </li>
                <li>
                  <strong>Checkos haben kein Ablaufdatum.</strong> Dein Guthaben bleibt
                  bestehen, solange dein Konto aktiv ist.
                </li>
                <li>
                  Jede Modulnutzung verbraucht eine bestimmte Anzahl Checkos, abhängig von der
                  gewählten Qualitätsstufe (Standard, Premium oder Pro).
                </li>
                <li>
                  Die Abrechnung der Checkos erfolgt sofort bei jeder Nutzung. Es gibt keine
                  monatlichen Abrechnungszyklen.
                </li>
                <li>
                  Checkos können nicht zwischen Benutzerkonten übertragen werden.
                </li>
                <li>
                  Bei Löschung des Benutzerkontos verfallen alle nicht genutzten Checkos
                  ersatzlos.
                </li>
              </ul>
            </section>

            {/* Bezahlung */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                4. Bezahlung
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>
                  Die Bezahlung von Checko-Paketen erfolgt als Einmalzahlung über den
                  Zahlungsdienstleister Stripe.
                </li>
                <li>
                  Es gibt <strong>kein Abonnement</strong> und keine wiederkehrenden
                  Zahlungen.
                </li>
                <li>Preisänderungen werden mindestens 30 Tage im Voraus angekündigt.</li>
                <li>
                  Bereits erworbene Checkos sind von Preisänderungen nicht betroffen.
                </li>
              </ul>
            </section>

            {/* Leistungsbeschreibung */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                5. Leistungsbeschreibung
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Checko stellt verschiedene digitale Module zur Verfügung, die unter anderem
                Marktplatz-Überwachung, automatisierte Analysen und
                Benachrichtigungen umfassen. Die genaue Leistungsbeschreibung jedes Moduls ist
                auf der jeweiligen Modulseite einsehbar. Wir bemühen uns um eine hohe
                Verfügbarkeit, garantieren jedoch keine unterbrechungsfreie Bereitstellung.
              </p>
            </section>

            {/* Haftung */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                6. Haftungsausschluss
              </h2>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Die Nutzung von Checko erfolgt auf eigenes Risiko.</li>
                <li>
                  Automatisch generierte Analysen und Empfehlungen stellen keine rechtsverbindliche
                  Beratung dar.
                </li>
                <li>
                  Wir haften nicht für Schäden, die durch die Nutzung oder Nichtverfügbarkeit
                  der Plattform entstehen, ausser bei Vorsatz oder grober Fahrlässigkeit.
                </li>
                <li>
                  Für die Richtigkeit von Drittanbieter-Daten (z.B. Marktplatz-Inserate,
                  Preise) übernehmen wir keine Gewähr.
                </li>
                <li>
                  Die Haftung ist in jedem Fall auf den vom Nutzer gezahlten Betrag der letzten
                  12 Monate begrenzt.
                </li>
              </ul>
            </section>

            {/* Datenschutz */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                7. Datenschutz
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Der Schutz deiner persönlichen Daten ist uns wichtig. Details zur Erhebung,
                Verarbeitung und Nutzung deiner Daten findest du in unserer{" "}
                <a
                  href="/datenschutz"
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  Datenschutzerklärung
                </a>
                .
              </p>
            </section>

            {/* Geistiges Eigentum */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                8. Geistiges Eigentum
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Alle Inhalte, Designs, Texte, Grafiken und Software auf Checko sind
                urheberrechtlich geschützt und Eigentum von Huy Digital / Marcel Huy. Eine
                Vervielfältigung, Verbreitung oder anderweitige Nutzung ohne ausdrückliche
                schriftliche Genehmigung ist nicht gestattet.
              </p>
            </section>

            {/* Änderungen */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                9. Änderungen der AGB
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Wir behalten uns vor, diese AGB jederzeit zu ändern. Änderungen werden
                mindestens 30 Tage vor Inkrafttreten per E-Mail angekündigt. Die weitere
                Nutzung der Plattform nach Inkrafttreten gilt als Zustimmung zu den geänderten
                AGB.
              </p>
            </section>

            {/* Gerichtsstand */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">
                10. Anwendbares Recht und Gerichtsstand
              </h2>
              <p className="text-gray-700 leading-relaxed">
                Es gilt Schweizer Recht. Gerichtsstand ist Oberburg, Schweiz, soweit gesetzlich
                zulässig.
              </p>
            </section>

            {/* Kontakt */}
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">11. Kontakt</h2>
              <p className="text-gray-700 leading-relaxed">
                Bei Fragen zu diesen AGB kontaktiere uns unter:{" "}
                <a
                  href="mailto:info@checko.ch"
                  className="text-emerald-600 hover:text-emerald-700"
                >
                  info@checko.ch
                </a>
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
