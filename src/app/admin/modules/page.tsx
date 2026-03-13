// Admin Modules — Activate/deactivate modules, change prices
"use client";

import { useEffect, useState, useCallback } from "react";

interface Module {
  id: string;
  slug: string;
  name: string;
  description: string;
  priceMonthly: number;
  isActive: boolean;
  sortOrder: number;
  _count: { subscriptions: number };
}

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPrice, setEditPrice] = useState("");

  const fetchModules = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/modules");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setModules(data.modules);
    } catch {
      setError("Module konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchModules();
  }, [fetchModules]);

  const toggleActive = async (moduleId: string, isActive: boolean) => {
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, isActive: !isActive }),
      });
      if (!res.ok) throw new Error("Fehler");
      fetchModules();
    } catch {
      alert("Fehler beim Aktualisieren.");
    }
  };

  const savePrice = async (moduleId: string) => {
    const price = Math.round(parseFloat(editPrice) * 100);
    if (isNaN(price) || price < 0) {
      alert("Ungueltiger Preis.");
      return;
    }
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, priceMonthly: price }),
      });
      if (!res.ok) throw new Error("Fehler");
      setEditingId(null);
      fetchModules();
    } catch {
      alert("Fehler beim Speichern.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Modul-Verwaltung</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Preis/Mt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Abos</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.map((mod) => (
                <tr key={mod.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{mod.name}</td>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{mod.slug}</td>
                  <td className="px-4 py-3">
                    {editingId === mod.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.01"
                          value={editPrice}
                          onChange={(e) => setEditPrice(e.target.value)}
                          className="w-24 px-2 py-1 border border-gray-300 rounded text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => savePrice(mod.id)}
                          className="text-emerald-600 hover:text-emerald-700 text-xs font-medium"
                        >
                          ✓
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-gray-400 hover:text-gray-600 text-xs"
                        >
                          ✕
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          setEditingId(mod.id);
                          setEditPrice((mod.priceMonthly / 100).toFixed(2));
                        }}
                        className="text-gray-900 hover:text-emerald-600 transition"
                      >
                        CHF {(mod.priceMonthly / 100).toFixed(2)}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{mod._count.subscriptions}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        mod.isActive
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {mod.isActive ? "Aktiv" : "Inaktiv"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleActive(mod.id, mod.isActive)}
                      className={`text-sm font-medium ${
                        mod.isActive
                          ? "text-red-600 hover:text-red-700"
                          : "text-emerald-600 hover:text-emerald-700"
                      }`}
                    >
                      {mod.isActive ? "Deaktivieren" : "Aktivieren"}
                    </button>
                  </td>
                </tr>
              ))}
              {modules.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Keine Module vorhanden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
