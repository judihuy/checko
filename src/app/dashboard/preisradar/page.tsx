// Preisradar Dashboard — Meine Suchen + Neue Suche erstellen + Suche bearbeiten
"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import Link from "next/link";
import { getPlatformDisplayName, COUNTRY_PLATFORMS, type CountryCode } from "@/lib/platform-names";

interface Search {
  id: string;
  query: string;
  maxPrice: number | null;
  minPrice: number | null;
  platforms: string[];
  duration: string;
  qualityTier: string;
  interval: number;
  status: "aktiv" | "pausiert" | "abgelaufen" | "entwurf";
  isDraft?: boolean;
  alertCount: number;
  expiresAt: string | null;
  lastScrapedAt: string | null;
  checkosCharged: number;
  createdAt: string;
  // Kategorie-Felder
  category?: string | null;
  subcategory?: string | null;
  condition?: string | null;
  // Fahrzeug
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  yearFrom?: number | null;
  yearTo?: number | null;
  kmFrom?: number | null;
  kmTo?: number | null;
  fuelType?: string | null;
  transmission?: string | null;
  engineSizeCcm?: number | null;
  motorcycleType?: string | null;
  // Immobilien
  propertyType?: string | null;
  propertyOffer?: string | null;
  rooms?: number | null;
  areaM2?: number | null;
  location?: string | null;
  // Möbel
  furnitureType?: string | null;
}

/** Formatiert die Kategorie-Details einer Suche als einzeiligen String */
function formatSearchDetails(search: Search): string | null {
  const parts: string[] = [];

  if (search.category === "Fahrzeuge") {
    if (search.vehicleMake) {
      let vehicle = "🚗 " + search.vehicleMake;
      if (search.vehicleModel) vehicle += " " + search.vehicleModel;
      parts.push(vehicle);
    }
    if (search.yearFrom || search.yearTo) {
      parts.push((search.yearFrom || "?") + "–" + (search.yearTo || "?"));
    }
    if (search.fuelType) {
      const fuelLabels: Record<string, string> = {
        benzin: "Benzin", diesel: "Diesel", elektro: "Elektro",
        hybrid: "Hybrid", "plug-in-hybrid": "Plug-in-Hybrid", gas: "Gas",
      };
      parts.push(fuelLabels[search.fuelType] || search.fuelType);
    }
    if (search.transmission) {
      parts.push(search.transmission === "automat" ? "Automatik" : "Manuell");
    }
    if (search.kmFrom || search.kmTo) {
      parts.push((search.kmFrom ? search.kmFrom.toLocaleString("de-CH") : "0") + "–" + (search.kmTo ? search.kmTo.toLocaleString("de-CH") : "∞") + " km");
    }
    if (search.motorcycleType) parts.push(search.motorcycleType);
    if (search.engineSizeCcm) parts.push(search.engineSizeCcm + " ccm");
  } else if (search.category === "Immobilien") {
    const propLabels: Record<string, string> = {
      wohnung: "Wohnung", haus: "Haus", grundstueck: "Grundstück", gewerbe: "Gewerbe",
    };
    const offerLabels: Record<string, string> = { miete: "Miete", kauf: "Kauf" };
    if (search.propertyType) parts.push("🏠 " + (propLabels[search.propertyType] || search.propertyType));
    if (search.propertyOffer) parts.push(offerLabels[search.propertyOffer] || search.propertyOffer);
    if (search.rooms) parts.push(search.rooms + "+ Zimmer");
    if (search.areaM2) parts.push(search.areaM2 + " m²");
    if (search.location) parts.push(search.location);
  } else if (search.category === "Möbel") {
    const furnitureLabels: Record<string, string> = {
      sofa: "Sofa / Couch", tisch: "Tisch", stuhl: "Stuhl", schrank: "Schrank",
      bett: "Bett", regal: "Regal", kommode: "Kommode", schreibtisch: "Schreibtisch",
    };
    if (search.furnitureType) parts.push("🪑 " + (furnitureLabels[search.furnitureType] || search.furnitureType));
  }

  return parts.length > 0 ? parts.join(" | ") : null;
}

const ALL_PLATFORMS = [
  { id: "tutti", name: "Tutti.ch", country: "ch" as CountryCode, disabled: false },
  { id: "ricardo", name: "Ricardo.ch", country: "ch" as CountryCode, disabled: false },
  { id: "anibis", name: "Anibis.ch", country: "ch" as CountryCode, disabled: false },
  { id: "autoscout", name: "AutoScout24.ch", country: "ch" as CountryCode, disabled: false },
  { id: "comparis", name: "Comparis.ch", country: "ch" as CountryCode, disabled: true, disabledReason: "DataDome-Schutz" },
  { id: "ebay-ka", name: "Kleinanzeigen.de", country: "de" as CountryCode, disabled: false },
  { id: "amazon", name: "Amazon.de", country: "de" as CountryCode, disabled: true, disabledReason: "Bot-Schutz" },
  { id: "willhaben", name: "Willhaben.at", country: "at" as CountryCode, disabled: false },
  { id: "google-shopping", name: "Google Shopping", country: "int" as CountryCode, disabled: true, disabledReason: "CAPTCHA-Schutz" },
];

// Nur aktive Plattformen: ohne deaktivierte (autoscout, comparis komplett ausblenden)
const ACTIVE_PLATFORMS = ALL_PLATFORMS.filter((p) => !("disabled" in p && p.disabled));

// Basiskosten pro Dauer (Standard-Stufe = 2 Checkos)
const DURATION_BASE_COSTS: Record<string, number> = {
  "1d": 2,
  "1w": 8,
  "1m": 20,
};

// Qualitäts-Kosten in Checkos (konkret, keine Multiplikatoren)
const QUALITY_CHECKO_COSTS: Record<string, number> = {
  standard: 2,
  premium: 4,
  pro: 7,
};

const DURATIONS = [
  { id: "1d", name: "1 Tag" },
  { id: "1w", name: "1 Woche" },
  { id: "1m", name: "1 Monat" },
];

// ==================== KATEGORIEN ====================

const CATEGORIES: Record<string, { icon: string; color: string; subcategories: string[] }> = {
  "Fahrzeuge": { icon: "🚗", color: "blue", subcategories: ["Autos", "Motorräder", "Ersatzteile", "Zubehör", "Wohnmobile", "Fahrräder"] },
  "Immobilien": { icon: "🏠", color: "purple", subcategories: ["Wohnungen", "Häuser", "Grundstücke", "Gewerbe"] },
  "Möbel": { icon: "🪑", color: "amber", subcategories: ["Sofas", "Tische", "Stühle", "Schränke", "Betten", "Regale"] },
  "Elektronik": { icon: "📱", color: "cyan", subcategories: ["Smartphones", "Laptops", "Tablets", "Fernseher", "Kameras", "Audio", "Gaming"] },
  "Kleidung": { icon: "👕", color: "pink", subcategories: ["Damen", "Herren", "Kinder", "Schuhe", "Accessoires"] },
  "Sport": { icon: "⚽", color: "green", subcategories: ["Fitness", "Wintersport", "Radsport", "Outdoor", "Wassersport"] },
  "Haushalt": { icon: "🏡", color: "teal", subcategories: ["Küche", "Bad", "Reinigung", "Werkzeug", "Garten"] },
  "Sonstiges": { icon: "📦", color: "gray", subcategories: ["Bücher", "Musik", "Filme", "Sammeln", "Kunst"] },
};

// Plattformen die von Cloudflare eingeschränkt sind
const RESTRICTED_PLATFORMS = new Set(["tutti", "anibis"]);

const CONDITIONS = [
  { id: "", name: "Alle Zustände" },
  { id: "neu", name: "Neu" },
  { id: "gebraucht", name: "Gebraucht" },
];

const QUALITY_TIERS = [
  {
    id: "standard",
    name: "Standard",
    desc: "Einmal täglich durchsuchen",
    checkos: 2,
    interval: 1440,
    intervalLabel: "Alle 24 Stunden",
    model: "Standard",
  },
  {
    id: "premium",
    name: "Premium",
    desc: "Zweimal täglich durchsuchen",
    checkos: 4,
    interval: 720,
    intervalLabel: "Alle 12 Stunden",
    model: "Premium",
  },
  {
    id: "pro",
    name: "Pro",
    desc: "Echtzeit — alle 5 Minuten",
    checkos: 7,
    interval: 5,
    intervalLabel: "Alle 5 Minuten",
    model: "Pro",
  },
];

export default function PreisradarPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [searches, setSearches] = useState<Search[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Checkos-Guthaben
  const [checkosBalance, setCheckosBalance] = useState<number | null>(null);
  const [showInsufficientModal, setShowInsufficientModal] = useState(false);
  const [requiredCheckos, setRequiredCheckos] = useState(0);

  // Edit-State
  const [editingSearch, setEditingSearch] = useState<Search | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Edit-Formular-State
  const [editQuery, setEditQuery] = useState("");
  const [editMinPrice, setEditMinPrice] = useState("");
  const [editMaxPrice, setEditMaxPrice] = useState("");
  const [editPlatforms, setEditPlatforms] = useState<string[]>([]);
  // Edit — Kategorie-Felder
  const [editCategory, setEditCategory] = useState("");
  const [editSubcategory, setEditSubcategory] = useState("");
  const [editVehicleMake, setEditVehicleMake] = useState("");
  const [editVehicleModel, setEditVehicleModel] = useState("");
  const [editYearFrom, setEditYearFrom] = useState("");
  const [editYearTo, setEditYearTo] = useState("");
  const [editKmFrom, setEditKmFrom] = useState("");
  const [editKmTo, setEditKmTo] = useState("");
  const [editFuelType, setEditFuelType] = useState("");
  const [editTransmission, setEditTransmission] = useState("");
  const [editEngineSizeCcm, setEditEngineSizeCcm] = useState("");
  const [editMotorcycleType, setEditMotorcycleType] = useState("");
  const [editPropertyType, setEditPropertyType] = useState("");
  const [editPropertyOffer, setEditPropertyOffer] = useState("");
  const [editRooms, setEditRooms] = useState("");
  const [editAreaM2, setEditAreaM2] = useState("");
  const [editLocation, setEditLocation] = useState("");
  const [editFurnitureType, setEditFurnitureType] = useState("");

  // Formular-State (Neue Suche)
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>(["tutti", "ricardo", "anibis", "ebay-ka"]);
  const [duration, setDuration] = useState("1d");
  const [qualityTier, setQualityTier] = useState("standard");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [condition, setCondition] = useState("");

  // Fahrzeug-Felder (Auto + Motorrad)
  const [vehicleMake, setVehicleMake] = useState("");
  const [vehicleModel, setVehicleModel] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [kmFrom, setKmFrom] = useState("");
  const [kmTo, setKmTo] = useState("");
  const [fuelType, setFuelType] = useState("");
  const [transmission, setTransmission] = useState("");
  const [engineSizeCcm, setEngineSizeCcm] = useState("");
  const [motorcycleType, setMotorcycleType] = useState("");
  // Immobilien-Felder
  const [propertyType, setPropertyType] = useState("");
  const [propertyOffer, setPropertyOffer] = useState("");
  const [rooms, setRooms] = useState("");
  const [areaM2, setAreaM2] = useState("");
  const [location, setLocation] = useState("");
  // Möbel-Felder
  const [furnitureType, setFurnitureType] = useState("");

  // Länder-Checkbox-State (für Neue Suche)
  const [selectedCountries, setSelectedCountries] = useState<Set<CountryCode>>(new Set(["ch"]));

  // Intervall wird automatisch vom qualityTier abgeleitet
  const currentInterval = useMemo(() => {
    const tier = QUALITY_TIERS.find((t) => t.id === qualityTier);
    return tier?.interval || 30;
  }, [qualityTier]);

  // Live-Kostenberechnung: Dauer-Kosten skaliert nach Qualitätsstufe
  const currentCost = useMemo(() => {
    const baseCost = DURATION_BASE_COSTS[duration] || 2;
    const qualityCost = QUALITY_CHECKO_COSTS[qualityTier] || 2;
    // Verhältnis zur Standard-Stufe: premium = 2x, pro = 3.5x
    const ratio = qualityCost / QUALITY_CHECKO_COSTS["standard"];
    return Math.round(baseCost * ratio);
  }, [duration, qualityTier]);

  // Synchronisiere Länder-Checkboxen mit Plattform-Auswahl
  const handleCountryToggle = (country: CountryCode) => {
    const config = COUNTRY_PLATFORMS[country];
    if (!config.enabled) return; // AT = coming soon

    setSelectedCountries((prev) => {
      const next = new Set(prev);
      if (next.has(country)) {
        next.delete(country);
        // Alle Plattformen dieses Landes entfernen
        setSelectedPlatforms((platforms) =>
          platforms.filter((p) => !config.platforms.includes(p))
        );
      } else {
        next.add(country);
        // Alle aktiven Plattformen dieses Landes hinzufügen (disabled überspringen)
        const disabledIds = new Set(ALL_PLATFORMS.filter((ap) => "disabled" in ap && ap.disabled).map((ap) => ap.id));
        setSelectedPlatforms((platforms) => {
          const newPlatforms = [...platforms];
          for (const p of config.platforms) {
            if (!newPlatforms.includes(p) && !disabledIds.has(p)) {
              newPlatforms.push(p);
            }
          }
          return newPlatforms;
        });
      }
      return next;
    });
  };

  // Einzelne Plattform togglen — Länder-Checkbox synchron halten
  const togglePlatform = (platformId: string) => {
    setSelectedPlatforms((prev) => {
      const next = prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId];

      // Länder-Checkboxen synchronisieren
      const newCountries = new Set<CountryCode>();
      for (const [code, config] of Object.entries(COUNTRY_PLATFORMS) as [CountryCode, typeof COUNTRY_PLATFORMS[CountryCode]][]) {
        if (!config.enabled) continue;
        const hasAny = config.platforms.some((p) => next.includes(p));
        if (hasAny) newCountries.add(code);
      }
      setSelectedCountries(newCountries);

      return next;
    });
  };

  const loadSearches = useCallback(async () => {
    try {
      const res = await fetch("/api/modules/preisradar/searches");
      if (res.ok) {
        const data = await res.json();
        setSearches(data.searches);
      }
    } catch {
      console.error("Fehler beim Laden der Suchen");
    } finally {
      setLoading(false);
    }
  }, []);

  // Checkos-Guthaben laden
  const loadBalance = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard/summary");
      if (res.ok) {
        const data = await res.json();
        setCheckosBalance(data.checkosBalance ?? 0);
      }
    } catch {
      // Ignore
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login");
    }
    if (status === "authenticated") {
      loadSearches();
      loadBalance();
    }
  }, [status, router, loadSearches, loadBalance]);

  // Auto-Polling: Wenn eine Suche lastScrapedAt===null hat, alle 10s refreshen
  useEffect(() => {
    const hasPendingSearch = searches.some(
      (s) => s.status === "aktiv" && !s.lastScrapedAt
    );
    if (!hasPendingSearch) return;

    const intervalId = setInterval(async () => {
      try {
        const res = await fetch("/api/modules/preisradar/searches");
        if (res.ok) {
          const data = await res.json();
          setSearches(data.searches);
        }
      } catch {
        // Netzwerkfehler ignorieren, nächster Poll versucht es erneut
      }
    }, 10000);

    return () => clearInterval(intervalId);
  }, [searches]);

  // Edit-Modal öffnen mit vorausgefüllten Werten
  const openEditModal = (search: Search) => {
    setEditingSearch(search);
    setEditQuery(search.query);
    setEditMinPrice(search.minPrice ? String(search.minPrice / 100) : "");
    setEditMaxPrice(search.maxPrice ? String(search.maxPrice / 100) : "");
    setEditPlatforms([...search.platforms]);
    // Kategorie-Felder vorausfüllen
    setEditCategory(search.category || "");
    setEditSubcategory(search.subcategory || "");
    setEditVehicleMake(search.vehicleMake || "");
    setEditVehicleModel(search.vehicleModel || "");
    setEditYearFrom(search.yearFrom ? String(search.yearFrom) : "");
    setEditYearTo(search.yearTo ? String(search.yearTo) : "");
    setEditKmFrom(search.kmFrom ? String(search.kmFrom) : "");
    setEditKmTo(search.kmTo ? String(search.kmTo) : "");
    setEditFuelType(search.fuelType || "");
    setEditTransmission(search.transmission || "");
    setEditEngineSizeCcm(search.engineSizeCcm ? String(search.engineSizeCcm) : "");
    setEditMotorcycleType(search.motorcycleType || "");
    setEditPropertyType(search.propertyType || "");
    setEditPropertyOffer(search.propertyOffer || "");
    setEditRooms(search.rooms ? String(search.rooms) : "");
    setEditAreaM2(search.areaM2 ? String(search.areaM2) : "");
    setEditLocation(search.location || "");
    setEditFurnitureType(search.furnitureType || "");
    setEditError(null);
    setShowEditModal(true);
  };

  const handleEditSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSearch) return;
    setEditing(true);
    setEditError(null);

    try {
      const res = await fetch(`/api/modules/preisradar/searches/${editingSearch.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: editQuery,
          minPrice: editMinPrice ? parseInt(editMinPrice, 10) * 100 : null,
          maxPrice: editMaxPrice ? parseInt(editMaxPrice, 10) * 100 : null,
          platforms: editPlatforms,
          // Kategorie-Felder
          category: editCategory || null,
          subcategory: editSubcategory || null,
          vehicleMake: editVehicleMake || null,
          vehicleModel: editVehicleModel || null,
          yearFrom: editYearFrom ? parseInt(editYearFrom) : null,
          yearTo: editYearTo ? parseInt(editYearTo) : null,
          kmFrom: editKmFrom ? parseInt(editKmFrom) : null,
          kmTo: editKmTo ? parseInt(editKmTo) : null,
          fuelType: editFuelType || null,
          transmission: editTransmission || null,
          engineSizeCcm: editEngineSizeCcm ? parseInt(editEngineSizeCcm) : null,
          motorcycleType: editMotorcycleType || null,
          propertyType: editPropertyType || null,
          propertyOffer: editPropertyOffer || null,
          rooms: editRooms ? parseInt(editRooms) : null,
          areaM2: editAreaM2 ? parseInt(editAreaM2) : null,
          location: editLocation || null,
          furnitureType: editFurnitureType || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.error || "Fehler beim Speichern");
        return;
      }

      // Modal schließen + Seite aktualisieren
      setShowEditModal(false);
      setEditingSearch(null);
      await loadSearches();
    } catch {
      setEditError("Netzwerkfehler");
    } finally {
      setEditing(false);
    }
  };

  const toggleEditPlatform = (platformId: string) => {
    setEditPlatforms((prev) =>
      prev.includes(platformId)
        ? prev.filter((p) => p !== platformId)
        : [...prev, platformId]
    );
  };

  // Prüfe ob genug Checkos vorhanden sind, bevor der Modal geöffnet wird
  const handleNewSearchClick = () => {
    // Balance immer frisch laden
    loadBalance();
    setShowModal(true);
  };

  const handleCreateSearch = async (e: React.FormEvent) => {
    e.preventDefault();

    // Checkos-Check vor dem Erstellen
    if (checkosBalance !== null && checkosBalance < currentCost) {
      setRequiredCheckos(currentCost);
      setShowInsufficientModal(true);
      return;
    }

    setCreating(true);
    setError(null);

    try {
      // Auto-generate query for structured categories (Fahrzeuge/Immobilien don't have free-text)
      let effectiveQuery = query;
      if (category === "Fahrzeuge" && !query.trim() && vehicleMake) {
        effectiveQuery = vehicleMake + (vehicleModel ? " " + vehicleModel : "");
      } else if (category === "Immobilien" && !query.trim()) {
        const propLabels: Record<string, string> = { wohnung: "Wohnung", haus: "Haus", grundstueck: "Grundstück", gewerbe: "Gewerbe" };
        const offerLabels: Record<string, string> = { miete: "Miete", kauf: "Kauf" };
        effectiveQuery = [propLabels[propertyType] || propertyType, offerLabels[propertyOffer] || "", location].filter(Boolean).join(" ") || "Immobilie";
      }

      const res = await fetch("/api/modules/preisradar/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: effectiveQuery,
          minPrice: minPrice && parseInt(minPrice, 10) > 0 ? parseInt(minPrice, 10) * 100 : undefined, // CHF → Rappen
          maxPrice: maxPrice && parseInt(maxPrice, 10) > 0 ? parseInt(maxPrice, 10) * 100 : undefined,
          platforms: selectedPlatforms,
          duration,
          qualityTier,
          interval: currentInterval,
          category: category || undefined,
          subcategory: subcategory || undefined,
          condition: condition || undefined,
          // Fahrzeug
          vehicleMake: vehicleMake || undefined,
          vehicleModel: vehicleModel || undefined,
          yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
          yearTo: yearTo ? parseInt(yearTo) : undefined,
          kmFrom: kmFrom ? parseInt(kmFrom) : undefined,
          kmTo: kmTo ? parseInt(kmTo) : undefined,
          fuelType: fuelType || undefined,
          transmission: transmission || undefined,
          engineSizeCcm: engineSizeCcm ? parseInt(engineSizeCcm) : undefined,
          motorcycleType: motorcycleType || undefined,
          // Immobilien
          propertyType: propertyType || undefined,
          propertyOffer: propertyOffer || undefined,
          rooms: rooms ? parseInt(rooms) : undefined,
          areaM2: areaM2 ? parseInt(areaM2) : undefined,
          location: location || undefined,
          // Möbel
          furnitureType: furnitureType || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.details) {
          const fieldErrors = Object.entries(data.details).map(([k,v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ");
          setError(`${data.error}: ${fieldErrors}`);
        } else {
          setError(data.error || "Fehler beim Erstellen der Suche");
        }
        return;
      }

      // Reset + Reload + Erfolgsmeldung
      setShowModal(false);
      setQuery("");
      setMinPrice("");
      setMaxPrice("");
      setSelectedPlatforms(["tutti", "ricardo", "anibis", "ebay-ka"]);
      setSelectedCountries(new Set(["ch"]));
      setDuration("1d");
      setQualityTier("standard");
      setCategory("");
      setSubcategory("");
      setVehicleMake(""); setVehicleModel("");
      setYearFrom(""); setYearTo("");
      setKmFrom(""); setKmTo("");
      setFuelType(""); setTransmission("");
      setEngineSizeCcm(""); setMotorcycleType("");
      setPropertyType(""); setPropertyOffer("");
      setRooms(""); setAreaM2(""); setLocation("");
      setFurnitureType("");
      setCondition("");
      setSuccessMessage("🚀 Suche erstellt! Der erste Scan läuft bereits im Hintergrund.");
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadSearches();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setCreating(false);
    }
  };

  // Draft speichern (ohne Checkos abzuziehen)
  const handleSaveDraft = async () => {
    setCreating(true);
    setError(null);
    try {
      // Auto-generate query for structured categories
      let draftQuery = query;
      if (category === "Fahrzeuge" && !query.trim() && vehicleMake) {
        draftQuery = vehicleMake + (vehicleModel ? " " + vehicleModel : "");
      } else if (category === "Immobilien" && !query.trim()) {
        const propLabels: Record<string, string> = { wohnung: "Wohnung", haus: "Haus", grundstueck: "Grundstück", gewerbe: "Gewerbe" };
        const offerLabels: Record<string, string> = { miete: "Miete", kauf: "Kauf" };
        draftQuery = [propLabels[propertyType] || propertyType, offerLabels[propertyOffer] || "", location].filter(Boolean).join(" ") || "Immobilie";
      }

      const res = await fetch("/api/modules/preisradar/searches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: draftQuery,
          minPrice: minPrice ? parseInt(minPrice, 10) * 100 : undefined,
          maxPrice: maxPrice ? parseInt(maxPrice, 10) * 100 : undefined,
          platforms: selectedPlatforms,
          duration,
          qualityTier,
          category: category || undefined,
          subcategory: subcategory || undefined,
          condition: condition || undefined,
          // Fahrzeug
          vehicleMake: vehicleMake || undefined,
          vehicleModel: vehicleModel || undefined,
          yearFrom: yearFrom ? parseInt(yearFrom) : undefined,
          yearTo: yearTo ? parseInt(yearTo) : undefined,
          kmFrom: kmFrom ? parseInt(kmFrom) : undefined,
          kmTo: kmTo ? parseInt(kmTo) : undefined,
          fuelType: fuelType || undefined,
          transmission: transmission || undefined,
          engineSizeCcm: engineSizeCcm ? parseInt(engineSizeCcm) : undefined,
          motorcycleType: motorcycleType || undefined,
          // Immobilien
          propertyType: propertyType || undefined,
          propertyOffer: propertyOffer || undefined,
          rooms: rooms ? parseInt(rooms) : undefined,
          areaM2: areaM2 ? parseInt(areaM2) : undefined,
          location: location || undefined,
          // Möbel
          furnitureType: furnitureType || undefined,
          isDraft: true,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        if (data.details) {
          const fieldErrors = Object.entries(data.details).map(([k,v]) => `${k}: ${(v as string[]).join(", ")}`).join("; ");
          setError(`${data.error}: ${fieldErrors}`);
        } else {
          setError(data.error || "Fehler beim Speichern");
        }
        return;
      }
      setShowModal(false);
      setSuccessMessage("💾 Suche als Entwurf gespeichert!");
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadSearches();
    } catch {
      setError("Netzwerkfehler");
    } finally {
      setCreating(false);
    }
  };

  const handleToggleSearch = async (searchId: string, currentActive: boolean, isDraft?: boolean) => {
    try {
      let res;
      if (isDraft) {
        // Draft aktivieren: eigener Endpoint der Checkos abzieht
        res = await fetch(`/api/modules/preisradar/searches/${searchId}/activate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          alert(data.error || "Fehler beim Aktivieren");
          return;
        }
      } else {
        res = await fetch(`/api/modules/preisradar/searches/${searchId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isActive: !currentActive }),
        });
      }

      if (res.ok) {
        await loadSearches();
        // Checkos-Balance aktualisieren
        const balRes = await fetch("/api/user/checkos");
        if (balRes.ok) {
          const balData = await balRes.json();
          setCheckosBalance(balData.balance ?? null);
        }
      }
    } catch {
      console.error("Fehler beim Umschalten der Suche");
    }
  };

  const handleDeleteSearch = async (searchId: string) => {
    if (!confirm("Suche wirklich löschen? Alle Treffer gehen verloren.")) return;

    try {
      const res = await fetch(`/api/modules/preisradar/searches/${searchId}`, {
        method: "DELETE",
      });

      if (res.ok) {
        await loadSearches();
      }
    } catch {
      console.error("Fehler beim Löschen der Suche");
    }
  };

  const getStatusBadge = (searchStatus: string) => {
    switch (searchStatus) {
      case "aktiv":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">● Aktiv</span>;
      case "pausiert":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">⏸ Pausiert</span>;
      case "abgelaufen":
        return <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">⏹ Abgelaufen</span>;
      default:
        return null;
    }
  };

  const getQualityBadge = (tier: string) => {
    switch (tier) {
      case "premium":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">⚡ Premium</span>;
      case "pro":
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">🔥 Pro</span>;
      default:
        return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">Standard</span>;
    }
  };

  const getIntervalLabel = (interval: number) => {
    if (interval <= 5) return "Alle 5 Min";
    if (interval <= 15) return "Alle 15 Min";
    return "Alle 30 Min";
  };

  if (status === "loading" || loading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <img src="/gecko-logo.png" alt="Laden..." className="w-12 h-12 animate-gecko-pulse" />
            <span className="text-gray-400 text-sm">Laden...</span>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <Navbar />
      <main className="flex-1 py-8 overflow-x-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 overflow-x-hidden">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Link href="/dashboard" className="text-gray-400 hover:text-gray-600 text-sm">
                  Dashboard
                </Link>
                <span className="text-gray-300">/</span>
                <span className="text-gray-900 font-medium text-sm">Preisradar</span>
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                  📡 Preisradar
                </h1>
                {/* Dezentes Gecko-Video */}
                <div className="w-[120px] h-[120px] rounded-xl overflow-hidden shadow-md flex-shrink-0 hidden sm:block">
                  <video
                    autoPlay
                    muted
                    loop
                    playsInline
                    preload="metadata"
                    className="w-full h-full object-cover"
                    src="/gecko-06.mp4"
                  />
                </div>
              </div>
              <p className="text-gray-600 mt-1 text-sm sm:text-base">Überwache Marktplätze und finde die besten Angebote.</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
              <Link
                href="/dashboard/preisradar/saved"
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
              >
                🔖 Gespeichert
              </Link>
              <Link
                href="/dashboard/preisradar/alerts"
                className="bg-white border border-gray-200 text-gray-700 px-4 py-2.5 rounded-lg font-medium hover:bg-gray-50 transition text-sm"
              >
                🔔 Treffer ansehen
              </Link>
              <button
                onClick={handleNewSearchClick}
                className="bg-emerald-600 text-white px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition text-xs sm:text-sm whitespace-nowrap"
              >
                + Neue Suche
              </button>
            </div>
          </div>

          {/* Erfolgsmeldung */}
          {successMessage && (
            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center gap-3">
              <span className="text-emerald-600 text-lg">✅</span>
              <p className="text-sm text-emerald-700 font-medium">{successMessage}</p>
              <button
                onClick={() => setSuccessMessage(null)}
                className="ml-auto text-emerald-400 hover:text-emerald-600 text-lg"
              >
                ×
              </button>
            </div>
          )}

          {/* Suchen-Liste */}
          {searches.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <span className="text-5xl block mb-4">📡</span>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">Noch keine Suchen</h2>
              <p className="text-gray-500 mb-6 max-w-md mx-auto">
                Erstelle deine erste Preisradar-Suche und werde automatisch benachrichtigt, wenn es neue Angebote gibt.
              </p>
              <button
                onClick={handleNewSearchClick}
                className="bg-emerald-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-emerald-700 transition"
              >
                + Erste Suche erstellen
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {searches.map((search) => (
                <div key={search.id} className="bg-white rounded-xl border border-gray-200 p-4 sm:p-5 hover:shadow-md transition overflow-hidden">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="font-semibold text-gray-900 text-lg truncate flex-1 mr-2">
                      &ldquo;{search.query}&rdquo;
                    </h3>
                    {getStatusBadge(search.status)}
                  </div>

                  {/* Kategorie-Details */}
                  {formatSearchDetails(search) && (
                    <div className="text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-1.5 mb-3 truncate">
                      {formatSearchDetails(search)}
                    </div>
                  )}

                  {/* Plattformen + Qualität */}
                  <div className="flex flex-wrap gap-1 mb-3">
                    {search.platforms.map((p) => (
                      <span key={p} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                        {getPlatformDisplayName(p)}
                      </span>
                    ))}
                    {getQualityBadge(search.qualityTier)}
                  </div>

                  {/* Details */}
                  <div className="text-sm text-gray-500 space-y-1 mb-4">
                    {(search.minPrice || search.maxPrice) && (
                      <p>
                        💰 {search.minPrice ? `CHF ${(search.minPrice / 100).toFixed(0)}` : "–"}
                        {" – "}
                        {search.maxPrice ? `CHF ${(search.maxPrice / 100).toFixed(0)}` : "∞"}
                      </p>
                    )}
                    <p>🔔 {search.alertCount} Treffer</p>
                    <p>⏱ {DURATIONS.find((d) => d.id === search.duration)?.name || search.duration}</p>
                    <p>🔄 {getIntervalLabel(search.interval)}</p>
                    <p>🦎 {search.checkosCharged} Checko{search.checkosCharged > 1 ? "s" : ""} bezahlt</p>
                    {search.lastScrapedAt && (
                      <p>🔍 Letzte Suche: {new Date(search.lastScrapedAt).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                    {search.lastScrapedAt && search.status === "aktiv" && (
                      <p>⏭ Nächste Suche: {new Date(new Date(search.lastScrapedAt).getTime() + search.interval * 60000).toLocaleString("de-CH", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                    )}
                    {!search.lastScrapedAt && search.status === "aktiv" && (
                      <p>🔄 Erste Suche läuft...</p>
                    )}
                    {search.expiresAt && (
                      <p>📅 Läuft ab: {new Date(search.expiresAt).toLocaleDateString("de-CH")}</p>
                    )}
                  </div>

                  {/* Aktionen */}
                  <div className="flex gap-2 pt-3 border-t border-gray-100">
                    {search.status !== "abgelaufen" && (
                      <>
                        <button
                          onClick={() => openEditModal(search)}
                          className="flex-1 text-xs py-2 rounded-lg font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 transition"
                        >
                          ✏️ Bearbeiten
                        </button>
                        <button
                          onClick={() => handleToggleSearch(search.id, search.status === "aktiv", search.isDraft)}
                          className={`flex-1 text-xs py-2 rounded-lg font-medium transition ${
                            search.status === "aktiv"
                              ? "bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                              : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          }`}
                        >
                          {search.status === "aktiv" ? "⏸ Pausieren" : "▶ Aktivieren"}
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => handleDeleteSearch(search.id)}
                      className="flex-1 text-xs py-2 rounded-lg font-medium bg-red-50 text-red-700 hover:bg-red-100 transition"
                    >
                      🗑 Löschen
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modal: Neue Suche */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl relative">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Neue Preisradar-Suche</h2>
                <button
                  onClick={() => { setShowModal(false); setError(null); }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleCreateSearch} className="space-y-5">
                {/* SCHRITT 1: Kategorie wählen (Pflicht) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    1. Kategorie wählen *
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(CATEGORIES).map(([cat, config]) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => {
                          setCategory(cat);
                          setSubcategory("");
                          // Reset category-specific fields when changing category
                          if (cat !== "Fahrzeuge") {
                            setVehicleMake(""); setVehicleModel("");
                            setYearFrom(""); setYearTo("");
                            setKmFrom(""); setKmTo("");
                            setFuelType(""); setTransmission("");
                            setEngineSizeCcm(""); setMotorcycleType("");
                          }
                          if (cat !== "Immobilien") {
                            setPropertyType(""); setPropertyOffer("");
                            setRooms(""); setAreaM2(""); setLocation("");
                          }
                          if (cat !== "Möbel") {
                            setFurnitureType("");
                          }
                          // Clear query for structured categories
                          if (cat === "Fahrzeuge" || cat === "Immobilien") {
                            setQuery("");
                          }
                        }}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-lg border text-center transition ${
                          category === cat
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-200"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <span className="text-xl">{config.icon}</span>
                        <span className="text-xs font-medium">{cat}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Unterkategorie (wenn Kategorie gewählt) */}
                {category && CATEGORIES[category] && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Unterkategorie
                    </label>
                    <select
                      value={subcategory}
                      onChange={(e) => setSubcategory(e.target.value)}
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 bg-white text-sm"
                    >
                      <option value="">Alle</option>
                      {CATEGORIES[category].subcategories.map((sub) => (
                        <option key={sub} value={sub}>{sub}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* SCHRITT 2: Kategorie-spezifische Felder */}
                {!category && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center text-gray-500 text-sm">
                    👆 Wähle zuerst eine Kategorie, um die passenden Suchfelder zu sehen.
                  </div>
                )}

                {/* === FAHRZEUGE: Marke, Modell, Baujahr, KM, Preis, Getriebe, Treibstoff — KEIN Freitext === */}
                {(category === "Fahrzeuge" && (subcategory === "Autos" || subcategory === "" || subcategory === "Wohnmobile" || subcategory === "Fahrräder")) && (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-800">🚗 Fahrzeug-Suche</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Marke *</label>
                        <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                          placeholder="z.B. BMW, Audi, VW" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Modell</label>
                        <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                          placeholder="z.B. M3, A4, Golf" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr von</label>
                        <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}
                          placeholder="2015" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr bis</label>
                        <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)}
                          placeholder="2026" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">KM von</label>
                        <input type="number" value={kmFrom} onChange={(e) => setKmFrom(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">KM bis</label>
                        <input type="number" value={kmTo} onChange={(e) => setKmTo(e.target.value)}
                          placeholder="200000" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Treibstoff</label>
                        <select value={fuelType} onChange={(e) => setFuelType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500">
                          <option value="">Alle</option>
                          <option value="benzin">Benzin</option>
                          <option value="diesel">Diesel</option>
                          <option value="elektro">Elektro</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="plug-in-hybrid">Plug-in-Hybrid</option>
                          <option value="gas">Gas (LPG/CNG)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Getriebe</label>
                        <select value={transmission} onChange={(e) => setTransmission(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500">
                          <option value="">Alle</option>
                          <option value="automat">Automatik</option>
                          <option value="manuell">Manuell</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* === MOTORRÄDER: Marke, Modell, Baujahr, KM, Preis, Typ, Hubraum — KEIN Freitext === */}
                {category === "Fahrzeuge" && subcategory === "Motorräder" && (
                  <div className="bg-orange-50/50 border border-orange-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-orange-800">🏍️ Motorrad-Suche</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Marke *</label>
                        <input type="text" value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)}
                          placeholder="z.B. Honda, Yamaha, BMW" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" required />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Modell</label>
                        <input type="text" value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)}
                          placeholder="z.B. CBR600, MT-07" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr von</label>
                        <input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)}
                          placeholder="2015" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr bis</label>
                        <input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)}
                          placeholder="2026" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">KM bis</label>
                        <input type="number" value={kmTo} onChange={(e) => setKmTo(e.target.value)}
                          placeholder="50000" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Hubraum (ccm)</label>
                        <input type="number" value={engineSizeCcm} onChange={(e) => setEngineSizeCcm(e.target.value)}
                          placeholder="600" min="50" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Typ</label>
                        <select value={motorcycleType} onChange={(e) => setMotorcycleType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                          <option value="">Alle</option>
                          <option value="naked">Naked</option>
                          <option value="sport">Sport</option>
                          <option value="chopper">Chopper/Cruiser</option>
                          <option value="enduro">Enduro/Cross</option>
                          <option value="touring">Touring</option>
                          <option value="scooter">Roller/Scooter</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* === Fahrzeuge: Ersatzteile/Zubehör — Suchbegriff + Preis === */}
                {category === "Fahrzeuge" && (subcategory === "Ersatzteile" || subcategory === "Zubehör") && (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-800">🔧 {subcategory}-Suche</p>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Suchbegriff *</label>
                      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder={`z.B. ${subcategory === "Ersatzteile" ? "BMW E46 Scheinwerfer" : "Dachbox, Felgen 19 Zoll"}`}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Zustand</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* === IMMOBILIEN: Typ, Kauf/Miete, Zimmer, Fläche, Preis, Ort — KEIN Freitext === */}
                {category === "Immobilien" && (
                  <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-purple-800">🏠 Immobilien-Suche</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Typ *</label>
                        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500" required>
                          <option value="">Bitte wählen</option>
                          <option value="wohnung">Wohnung</option>
                          <option value="haus">Haus</option>
                          <option value="grundstueck">Grundstück</option>
                          <option value="gewerbe">Gewerbe</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Angebot *</label>
                        <select value={propertyOffer} onChange={(e) => setPropertyOffer(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-purple-500" required>
                          <option value="">Bitte wählen</option>
                          <option value="miete">Miete</option>
                          <option value="kauf">Kauf</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Zimmer (min)</label>
                        <input type="number" value={rooms} onChange={(e) => setRooms(e.target.value)}
                          placeholder="2" min="1" max="20" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Fläche m² (min)</label>
                        <input type="number" value={areaM2} onChange={(e) => setAreaM2(e.target.value)}
                          placeholder="50" min="10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Ort / PLZ</label>
                        <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
                          placeholder="Zürich, 8000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {/* === MÖBEL/HAUSHALT: Suchbegriff + Typ + Preis + Zustand === */}
                {(category === "Möbel" || category === "Haushalt") && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-800">{category === "Möbel" ? "🪑" : "🏡"} {category}-Suche</p>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Suchbegriff *</label>
                      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder={category === "Möbel" ? "z.B. IKEA Kallax, Ledersofa, Esstisch Eiche" : "z.B. Staubsauger Dyson, Kaffeemaschine"}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500" required />
                    </div>
                    {category === "Möbel" && (
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Möbelart</label>
                        <select value={furnitureType} onChange={(e) => setFurnitureType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-amber-500">
                          <option value="">Alle</option>
                          <option value="sofa">Sofa / Couch</option>
                          <option value="tisch">Tisch</option>
                          <option value="stuhl">Stuhl</option>
                          <option value="schrank">Schrank</option>
                          <option value="bett">Bett</option>
                          <option value="regal">Regal</option>
                          <option value="kommode">Kommode</option>
                          <option value="schreibtisch">Schreibtisch</option>
                        </select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Zustand</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* === ALLGEMEIN (Elektronik, Kleidung, Sport, Sonstiges): Suchbegriff + Preis + Zustand === */}
                {(category === "Elektronik" || category === "Kleidung" || category === "Sport" || category === "Sonstiges") && (
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-gray-800">{CATEGORIES[category]?.icon} {category}-Suche</p>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Suchbegriff *</label>
                      <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                        placeholder="Was suchst du?"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis von (CHF)</label>
                        <input type="number" value={minPrice} onChange={(e) => setMinPrice(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Preis bis (CHF)</label>
                        <input type="number" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)}
                          placeholder="∞" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Zustand</label>
                      <select value={condition} onChange={(e) => setCondition(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        {CONDITIONS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                  </div>
                )}

                {/* Länder-Auswahl */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Welche Länder durchsuchen?
                  </label>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {(Object.entries(COUNTRY_PLATFORMS) as [CountryCode, typeof COUNTRY_PLATFORMS[CountryCode]][]).map(([code, config]) => (
                      <button
                        key={code}
                        type="button"
                        onClick={() => handleCountryToggle(code)}
                        disabled={!config.enabled}
                        className={`flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-sm font-medium transition ${
                          !config.enabled
                            ? "border-gray-200 bg-gray-50 text-gray-400 cursor-not-allowed"
                            : selectedCountries.has(code)
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300 text-gray-600"
                        }`}
                      >
                        <span>{config.flag}</span>
                        <span>{config.label}</span>
                        {!config.enabled && (
                          <span className="text-[10px] text-gray-400 ml-0.5">(Demnächst)</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Plattformen (Sub-Checkboxen) */}
                  <div className="border border-gray-200 rounded-lg p-3 bg-gray-50/50">
                    <p className="text-xs text-gray-500 mb-2">Einzelne Plattformen an-/abwählen:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {ACTIVE_PLATFORMS.map((p) => {
                        const countryConfig = COUNTRY_PLATFORMS[p.country];
                        const isDisabled = "disabled" in p && p.disabled;
                        const disabledReason = "disabledReason" in p ? (p as { disabledReason?: string }).disabledReason : undefined;
                        const isRestricted = RESTRICTED_PLATFORMS.has(p.id);
                        return (
                          <label
                            key={p.id}
                            title={isDisabled ? `${p.name}: Temporär deaktiviert (${disabledReason || "Bot-Schutz"})` : isRestricted ? `${p.name}: Eingeschränkt (Cloudflare-Schutz)` : p.name}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                              isDisabled
                                ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60"
                                : selectedPlatforms.includes(p.id)
                                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 cursor-pointer"
                                  : "border-gray-200 hover:border-gray-300 bg-white cursor-pointer"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={!isDisabled && selectedPlatforms.includes(p.id)}
                              onChange={() => !isDisabled && togglePlatform(p.id)}
                              disabled={isDisabled}
                              className="sr-only"
                            />
                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                              isDisabled
                                ? "border-gray-300 bg-gray-200"
                                : selectedPlatforms.includes(p.id)
                                  ? "border-emerald-500 bg-emerald-500"
                                  : "border-gray-300"
                            }`}>
                              {!isDisabled && selectedPlatforms.includes(p.id) && (
                                <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </span>
                            <div className="flex items-center gap-1 min-w-0">
                              <span className="text-xs">{countryConfig.flag}</span>
                              <span className={`text-sm truncate ${isDisabled ? "line-through" : ""}`}>{p.name}</span>
                              {isDisabled && <span className="text-[10px] text-gray-400 ml-auto">⚠️</span>}
                              {isRestricted && !isDisabled && <span className="text-[10px] text-amber-500 ml-auto" title="Cloudflare-Schutz kann Ergebnisse einschränken">⚡</span>}
                            </div>
                          </label>
                        );
                      })}
                    </div>
                    {selectedPlatforms.some(p => RESTRICTED_PLATFORMS.has(p)) && (
                      <p className="text-xs text-amber-600 mt-2 flex items-center gap-1">
                        <span>⚡</span> Tutti.ch und Anibis.ch sind durch Cloudflare eingeschränkt — Ergebnisse können variieren.
                      </p>
                    )}
                  </div>
                </div>

                {/* Qualitätsstufe — mit Intervall-Info */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Qualitätsstufe & Scan-Intervall
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {QUALITY_TIERS.map((tier) => (
                      <button
                        key={tier.id}
                        type="button"
                        onClick={() => setQualityTier(tier.id)}
                        className={`py-3 px-2 rounded-lg border text-center transition ${
                          qualityTier === tier.id
                            ? tier.id === "pro"
                              ? "border-purple-500 bg-purple-50 text-purple-700"
                              : tier.id === "premium"
                                ? "border-blue-500 bg-blue-50 text-blue-700"
                                : "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <div className="font-medium text-sm">{tier.name}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{tier.desc}</div>
                        <div className="text-xs font-semibold mt-1">
                          🔄 {tier.intervalLabel}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          🤖 {tier.model}
                        </div>
                        <div className="text-xs font-semibold mt-1">
                          {tier.checkos} Checko{tier.checkos > 1 ? "s" : ""}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Dauer — mit dynamischen Kosten je nach Qualitätsstufe */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Dauer
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {DURATIONS.map((d) => {
                      const baseCost = DURATION_BASE_COSTS[d.id] || 2;
                      const qualityCost = QUALITY_CHECKO_COSTS[qualityTier] || 2;
                      const ratio = qualityCost / QUALITY_CHECKO_COSTS["standard"];
                      const cost = Math.round(baseCost * ratio);
                      return (
                        <button
                          key={d.id}
                          type="button"
                          onClick={() => setDuration(d.id)}
                          className={`py-3 px-2 rounded-lg border text-center transition ${
                            duration === d.id
                              ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : "border-gray-200 hover:border-gray-300"
                          }`}
                        >
                          <div className="font-medium text-sm">{d.name}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {cost} Checko{cost > 1 ? "s" : ""}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Live-Kostenanzeige + Guthaben-Check */}
                <div className="space-y-3">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-sm text-emerald-700 font-medium">Kosten für diese Suche:</span>
                        <div className="text-xs text-emerald-600 mt-0.5">
                          {DURATIONS.find((d) => d.id === duration)?.name || duration}
                          {" · "}
                          {QUALITY_TIERS.find((t) => t.id === qualityTier)?.name || "Standard"}
                          {" · "}
                          {QUALITY_TIERS.find((t) => t.id === qualityTier)?.intervalLabel || "Alle 30 Minuten"}
                        </div>
                      </div>
                      <span className="text-lg font-bold text-emerald-800">
                        🦎 {currentCost} Checko{currentCost > 1 ? "s" : ""}
                      </span>
                    </div>
                    {qualityTier !== "standard" && (
                      <div className="text-xs text-emerald-600 mt-2 pt-2 border-t border-emerald-200">
                        💡 Standard würde nur {DURATION_BASE_COSTS[duration] || 2} Checko{(DURATION_BASE_COSTS[duration] || 2) > 1 ? "s" : ""} kosten
                      </div>
                    )}
                  </div>

                  {/* Guthaben-Anzeige */}
                  {checkosBalance !== null && (
                    <div className={`rounded-lg p-3 border ${
                      checkosBalance >= currentCost
                        ? "bg-emerald-50 border-emerald-200"
                        : "bg-red-50 border-red-200"
                    }`}>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-medium ${
                          checkosBalance >= currentCost ? "text-emerald-700" : "text-red-700"
                        }`}>
                          💰 Guthaben: {checkosBalance} Checko{checkosBalance !== 1 ? "s" : ""}
                        </span>
                        {checkosBalance >= currentCost ? (
                          <span className="text-xs font-medium text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">
                            ✓ Reicht
                          </span>
                        ) : (
                          <span className="text-xs font-medium text-red-600 bg-red-100 px-2 py-0.5 rounded-full">
                            ✗ Nicht genug
                          </span>
                        )}
                      </div>
                      {checkosBalance < currentCost && (
                        <div className="mt-2 pt-2 border-t border-red-200">
                          <p className="text-xs text-red-600 mb-2">
                            Du brauchst {currentCost}, hast aber nur {checkosBalance}.
                          </p>
                          <Link
                            href="/dashboard/checkos"
                            className="inline-flex items-center text-xs font-medium text-red-700 bg-red-100 hover:bg-red-200 px-3 py-1.5 rounded-lg transition"
                          >
                            💰 Checkos kaufen
                          </Link>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Sofort-Suche Hinweis */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-blue-700">
                    🚀 <strong>Sofort-Scan:</strong> Deine Suche wird direkt nach dem Erstellen gescannt — du musst nicht auf den nächsten Cron-Lauf warten!
                  </p>
                </div>

                {/* Submit — 3 Buttons: Abbrechen / Speichern (Draft) / Suche starten */}
                <div className="flex gap-2 pt-4 sticky bottom-0 bg-white pb-2 -mb-2 border-t border-gray-100 mt-4 z-10">
                  <button
                    type="button"
                    onClick={() => { setShowModal(false); setError(null); }}
                    className="py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition text-sm"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    disabled={creating || selectedPlatforms.length === 0 || !category || (!query.trim() && !vehicleMake.trim() && !propertyType)}
                    onClick={handleSaveDraft}
                    className="flex-1 py-3 px-4 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {creating ? "Wird gespeichert..." : "💾 Speichern"}
                  </button>
                  <button
                    type="submit"
                    disabled={creating || selectedPlatforms.length === 0 || !category || (!query.trim() && !vehicleMake.trim() && !propertyType) || (checkosBalance !== null && checkosBalance < currentCost)}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {creating ? "Wird erstellt..." : `🚀 Starten (${currentCost} 🦎)`}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Suche bearbeiten */}
      {showEditModal && editingSearch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto overflow-x-hidden shadow-2xl relative">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Suche bearbeiten</h2>
                <button
                  onClick={() => { setShowEditModal(false); setEditingSearch(null); setEditError(null); }}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-red-700 text-sm">
                  {editError}
                </div>
              )}

              <form onSubmit={handleEditSearch} className="space-y-5">
                {/* Suchbegriff */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Suchbegriff *
                  </label>
                  <input
                    type="text"
                    value={editQuery}
                    onChange={(e) => setEditQuery(e.target.value)}
                    placeholder="z.B. iPhone 15 Pro, BMW 320d, Sofa..."
                    className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    minLength={2}
                    maxLength={200}
                  />
                </div>

                {/* Preislimit */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Min. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={editMinPrice}
                      onChange={(e) => setEditMinPrice(e.target.value)}
                      placeholder="0"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Max. Preis (CHF)
                    </label>
                    <input
                      type="number"
                      value={editMaxPrice}
                      onChange={(e) => setEditMaxPrice(e.target.value)}
                      placeholder="∞"
                      min="0"
                      className="w-full px-3 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {/* Plattformen (Edit-Modal — einfache Checkboxen) */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Plattformen *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {ACTIVE_PLATFORMS.map((p) => {
                      const isDisabled = "disabled" in p && p.disabled;
                      const disabledReason = "disabledReason" in p ? (p as { disabledReason?: string }).disabledReason : undefined;
                      return (
                        <label
                          key={p.id}
                          title={isDisabled ? `Temporär deaktiviert (${disabledReason || "Bot-Schutz"})` : p.name}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition ${
                            isDisabled
                              ? "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed opacity-60"
                              : editPlatforms.includes(p.id)
                                ? "border-emerald-500 bg-emerald-50 text-emerald-700 cursor-pointer"
                                : "border-gray-200 hover:border-gray-300 cursor-pointer"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!isDisabled && editPlatforms.includes(p.id)}
                            onChange={() => !isDisabled && toggleEditPlatform(p.id)}
                            disabled={isDisabled}
                            className="sr-only"
                          />
                          <span className={`w-4 h-4 rounded border-2 flex items-center justify-center ${
                            isDisabled
                              ? "border-gray-300 bg-gray-200"
                              : editPlatforms.includes(p.id)
                                ? "border-emerald-500 bg-emerald-500"
                                : "border-gray-300"
                          }`}>
                            {!isDisabled && editPlatforms.includes(p.id) && (
                              <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                            )}
                          </span>
                          <span className={`text-sm ${isDisabled ? "line-through" : ""}`}>
                            {p.name} {isDisabled && "⚠️"}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Kategorie-Felder im Edit-Modal */}
                {(editCategory === "Fahrzeuge") && (
                  <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-blue-800">🚗 Fahrzeug-Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Marke</label>
                        <input type="text" value={editVehicleMake} onChange={(e) => setEditVehicleMake(e.target.value)}
                          placeholder="z.B. BMW, Audi" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Modell</label>
                        <input type="text" value={editVehicleModel} onChange={(e) => setEditVehicleModel(e.target.value)}
                          placeholder="z.B. M3, A4" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr von</label>
                        <input type="number" value={editYearFrom} onChange={(e) => setEditYearFrom(e.target.value)}
                          placeholder="2015" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Baujahr bis</label>
                        <input type="number" value={editYearTo} onChange={(e) => setEditYearTo(e.target.value)}
                          placeholder="2026" min="1950" max="2026" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">km von</label>
                        <input type="number" value={editKmFrom} onChange={(e) => setEditKmFrom(e.target.value)}
                          placeholder="0" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">km bis</label>
                        <input type="number" value={editKmTo} onChange={(e) => setEditKmTo(e.target.value)}
                          placeholder="200000" min="0" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Treibstoff</label>
                        <select value={editFuelType} onChange={(e) => setEditFuelType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                          <option value="">Alle</option>
                          <option value="benzin">Benzin</option>
                          <option value="diesel">Diesel</option>
                          <option value="elektro">Elektro</option>
                          <option value="hybrid">Hybrid</option>
                          <option value="plug-in-hybrid">Plug-in-Hybrid</option>
                          <option value="gas">Gas (LPG/CNG)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Getriebe</label>
                        <select value={editTransmission} onChange={(e) => setEditTransmission(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                          <option value="">Alle</option>
                          <option value="automat">Automatik</option>
                          <option value="manuell">Manuell</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {editCategory === "Immobilien" && (
                  <div className="bg-purple-50/50 border border-purple-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-purple-800">🏠 Immobilien-Details</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Typ</label>
                        <select value={editPropertyType} onChange={(e) => setEditPropertyType(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                          <option value="">Alle</option>
                          <option value="wohnung">Wohnung</option>
                          <option value="haus">Haus</option>
                          <option value="grundstueck">Grundstück</option>
                          <option value="gewerbe">Gewerbe</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Angebot</label>
                        <select value={editPropertyOffer} onChange={(e) => setEditPropertyOffer(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                          <option value="">Miete & Kauf</option>
                          <option value="miete">Miete</option>
                          <option value="kauf">Kauf</option>
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Zimmer (min)</label>
                        <input type="number" value={editRooms} onChange={(e) => setEditRooms(e.target.value)}
                          placeholder="2" min="1" max="20" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Fläche m² (min)</label>
                        <input type="number" value={editAreaM2} onChange={(e) => setEditAreaM2(e.target.value)}
                          placeholder="50" min="10" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Ort / PLZ</label>
                        <input type="text" value={editLocation} onChange={(e) => setEditLocation(e.target.value)}
                          placeholder="Zürich, 8000" className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
                      </div>
                    </div>
                  </div>
                )}

                {editCategory === "Möbel" && (
                  <div className="bg-amber-50/50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-800">🪑 Möbel-Details</p>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Möbelart</label>
                      <select value={editFurnitureType} onChange={(e) => setEditFurnitureType(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white">
                        <option value="">Alle</option>
                        <option value="sofa">Sofa / Couch</option>
                        <option value="tisch">Tisch</option>
                        <option value="stuhl">Stuhl</option>
                        <option value="schrank">Schrank</option>
                        <option value="bett">Bett</option>
                        <option value="regal">Regal</option>
                        <option value="kommode">Kommode</option>
                        <option value="schreibtisch">Schreibtisch</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Info: Dauer/Qualität/Intervall nicht änderbar */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <p className="text-xs text-gray-500">
                    ℹ️ Dauer, Qualitätsstufe und Scan-Intervall können nach der Erstellung nicht mehr geändert werden, da die Checkos bereits berechnet wurden.
                  </p>
                  <div className="flex gap-3 mt-2 text-sm text-gray-700">
                    <span>⏱ {DURATIONS.find((d) => d.id === editingSearch.duration)?.name || editingSearch.duration}</span>
                    <span>·</span>
                    <span>{QUALITY_TIERS.find((t) => t.id === editingSearch.qualityTier)?.name || "Standard"}</span>
                    <span>·</span>
                    <span>🔄 {getIntervalLabel(editingSearch.interval)}</span>
                  </div>
                </div>

                {/* Submit */}
                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setShowEditModal(false); setEditingSearch(null); setEditError(null); }}
                    className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="submit"
                    disabled={editing || editPlatforms.length === 0 || (!editQuery.trim() && !editVehicleMake.trim() && !editPropertyType)}
                    className="flex-1 py-3 px-4 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {editing ? "Wird gespeichert..." : "Änderungen speichern"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Nicht genug Checkos */}
      {showInsufficientModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6 text-center">
            <div className="text-5xl mb-4">🦎</div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              Nicht genug Checkos
            </h2>
            <p className="text-gray-600 mb-2">
              Für diese Suche werden <span className="font-bold text-emerald-600">{requiredCheckos} Checkos</span> benötigt.
            </p>
            <p className="text-gray-500 text-sm mb-6">
              Dein aktuelles Guthaben: <span className="font-bold">{checkosBalance ?? 0} Checkos</span>
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard/checkos"
                className="block w-full bg-emerald-600 text-white py-3 rounded-xl font-semibold hover:bg-emerald-700 transition"
              >
                💰 Checkos aufladen
              </Link>
              <button
                onClick={() => setShowInsufficientModal(false)}
                className="w-full py-2 text-gray-500 hover:text-gray-700 text-sm transition"
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
