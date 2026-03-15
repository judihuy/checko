// Impressum — Pflichtangaben gemäss Schweizer Recht
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export default function ImpressumPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 py-12">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">Impressum</h1>

          <div className="bg-white rounded-xl border border-gray-200 p-8 space-y-6">
            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Betreiber</h2>
              <p className="text-gray-700 leading-relaxed">
                Huy Digital / Marcel Huy<br />
                Mittelstrasse 5<br />
                3414 Oberburg<br />
                Schweiz
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Kontakt</h2>
              <p className="text-gray-700 leading-relaxed">
                E-Mail:{" "}
                <a href="mailto:info@checko.ch" className="text-emerald-600 hover:text-emerald-700">
                  info@checko.ch
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Unternehmens-Identifikation</h2>
              <p className="text-gray-700 leading-relaxed">
                USt-IdNr: <span className="text-gray-500">(wird nachgetragen)</span><br />
                Handelsregister: <span className="text-gray-500">(wird bei Bedarf nachgetragen)</span>
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Verantwortlich für den Inhalt</h2>
              <p className="text-gray-700 leading-relaxed">
                Marcel Huy<br />
                Mittelstrasse 5<br />
                3414 Oberburg, Schweiz
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Haftungsausschluss</h2>
              <p className="text-gray-700 leading-relaxed">
                Der Autor übernimmt keine Gewähr für die Richtigkeit, Genauigkeit, Aktualität,
                Zuverlässigkeit und Vollständigkeit der Informationen. Haftungsansprüche gegen den
                Autor wegen Schäden materieller oder immaterieller Art, die aus dem Zugriff oder der
                Nutzung bzw. Nichtnutzung der veröffentlichten Informationen entstanden sind, werden
                grundsätzlich ausgeschlossen.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Haftung für Links</h2>
              <p className="text-gray-700 leading-relaxed">
                Verweise und Links auf Webseiten Dritter liegen ausserhalb unseres
                Verantwortungsbereichs. Jegliche Verantwortung für solche Webseiten wird abgelehnt.
                Der Zugriff und die Nutzung solcher Webseiten erfolgen auf eigene Gefahr des
                jeweiligen Nutzers.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-gray-900 mb-3">Urheberrechte</h2>
              <p className="text-gray-700 leading-relaxed">
                Die Urheber- und alle anderen Rechte an Inhalten, Bildern, Fotos oder anderen Dateien
                auf dieser Website gehören ausschließlich Marcel Huy / Huy Digital oder den speziell
                genannten Rechteinhabern. Für die Reproduktion jeglicher Elemente ist die schriftliche
                Zustimmung des Urheberrechtsträgers im Voraus einzuholen.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
