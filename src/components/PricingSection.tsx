// Pricing section — Checko-Pakete statt Abo-Rabattstufen
"use client";

const PACKAGES = [
  {
    amount: 20,
    price: "CHF 20.00",
    perChecko: "CHF 1.00",
    savings: "",
    popular: false,
  },
  {
    amount: 50,
    price: "CHF 45.00",
    perChecko: "CHF 0.90",
    savings: "Spare 10%",
    popular: true,
  },
  {
    amount: 100,
    price: "CHF 85.00",
    perChecko: "CHF 0.85",
    savings: "Spare 15%",
    popular: false,
  },
];

export function PricingSection() {
  return (
    <section id="preise" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            Checkos — Bezahle nur, was du nutzt
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Kein Abo, keine Flatrate. Kaufe Checkos und setze sie für jede Modulnutzung ein.
            Je grösser das Paket, desto günstiger pro Checko.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-3xl mx-auto">
          {PACKAGES.map((pkg, index) => (
            <div
              key={index}
              className={`relative rounded-2xl p-6 text-center transition-all ${
                pkg.popular
                  ? "bg-emerald-600 text-white shadow-xl scale-105"
                  : "bg-gray-50 border-2 border-gray-200"
              }`}
            >
              {pkg.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-800 text-white text-xs px-3 py-1 rounded-full font-medium">
                  Beliebt
                </div>
              )}

              {pkg.savings && (
                <div
                  className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full mb-3 ${
                    pkg.popular
                      ? "bg-emerald-500 text-white"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {pkg.savings}
                </div>
              )}
              {!pkg.savings && <div className="h-6 mb-3" />}

              <div className="mb-1">
                <span className="text-4xl font-bold">{pkg.amount}</span>
              </div>
              <p
                className={`text-sm mb-4 ${
                  pkg.popular ? "text-emerald-100" : "text-gray-500"
                }`}
              >
                Checkos
              </p>

              <div className="mb-1">
                <span className="text-2xl font-bold">{pkg.price}</span>
              </div>
              <p
                className={`text-xs ${
                  pkg.popular ? "text-emerald-200" : "text-gray-400"
                }`}
              >
                {pkg.perChecko} pro Checko
              </p>
            </div>
          ))}
        </div>

        {/* Qualitätsstufen */}
        <div className="mt-12 max-w-2xl mx-auto">
          <h3 className="text-center font-semibold text-gray-900 mb-4">
            Kosten pro Modulnutzung
          </h3>
          <div className="grid grid-cols-3 gap-4 text-center text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-lg font-bold text-gray-900">2</span>
              <span className="text-gray-500 ml-1">Checkos</span>
              <p className="text-gray-700 font-medium mt-1">Standard</p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 border border-emerald-200">
              <span className="text-lg font-bold text-emerald-700">4</span>
              <span className="text-emerald-600 ml-1">Checkos</span>
              <p className="text-emerald-700 font-medium mt-1">Premium</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <span className="text-lg font-bold text-gray-900">7</span>
              <span className="text-gray-500 ml-1">Checkos</span>
              <p className="text-gray-700 font-medium mt-1">Pro</p>
            </div>
          </div>
        </div>

        <div className="text-center mt-10">
          <p className="text-gray-500 text-sm">
            Alle Preise in CHF inkl. MwSt. Kein Abo. Kein Verfall. Keine versteckten Kosten.
          </p>
        </div>
      </div>
    </section>
  );
}
