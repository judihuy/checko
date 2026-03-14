// Admin Modules — Modul-Verwaltung mit Status, sortOrder, Preise
"use client";

import { useEffect, useState, useCallback } from "react";

interface Module {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string | null;
  priceMonthly: number;
  isActive: boolean;
  status: string;
  sortOrder: number;
}

const STATUS_OPTIONS = [
  { value: "active", label: "Aktiv", color: "bg-emerald-100 text-emerald-700" },
  { value: "coming_soon", label: "Demnächst", color: "bg-amber-100 text-amber-700" },
  { value: "beta", label: "Beta", color: "bg-blue-100 text-blue-700" },
  { value: "maintenance", label: "Wartung", color: "bg-red-100 text-red-700" },
];

export default function AdminModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

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

  const updateModule = async (moduleId: string, updates: Record<string, unknown>) => {
    setSaving(moduleId);
    try {
      const res = await fetch("/api/admin/modules", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ moduleId, ...updates }),
      });
      if (!res.ok) throw new Error("Fehler");
      await fetchModules();
    } catch {
      alert("Fehler beim Aktualisieren.");
    } finally {
      setSaving(null);
    }
  };

  const handleStatusChange = async (moduleId: string, newStatus: string) => {
    const isActive = newStatus === "active";
    await updateModule(moduleId, { status: newStatus, isActive });
  };

  const handleSortOrderChange = async (moduleId: string, newOrder: string) => {
    const order = parseInt(newOrder, 10);
    if (isNaN(order) || order < 0) return;
    await updateModule(moduleId, { sortOrder: order });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  const activeCount = modules.filter((m) => m.status === "active").length;
  const totalCount = modules.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Modul-Verwaltung</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activeCount} aktiv / {totalCount} gesamt
          </p>
        </div>
      </div>

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
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-12">#</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Modul</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Slug</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-40">Status</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600 w-24">Sortierung</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {modules.map((mod) => {
                const statusOption = STATUS_OPTIONS.find((s) => s.value === mod.status);
                const isSaving = saving === mod.id;

                return (
                  <tr
                    key={mod.id}
                    className={`hover:bg-gray-50 ${isSaving ? "opacity-50" : ""}`}
                  >
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {mod.sortOrder}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{mod.icon || "🔧"}</span>
                        <span className="font-medium text-gray-900">{mod.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                      {mod.slug}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={mod.status}
                        onChange={(e) => handleStatusChange(mod.id, e.target.value)}
                        disabled={isSaving}
                        className={`text-xs font-medium rounded-full px-3 py-1.5 border-0 cursor-pointer focus:ring-2 focus:ring-emerald-500 ${
                          statusOption?.color || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        value={mod.sortOrder}
                        onChange={(e) => handleSortOrderChange(mod.id, e.target.value)}
                        disabled={isSaving}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                      />
                    </td>
                  </tr>
                );
              })}
              {modules.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Keine Module vorhanden. Führe das Seed-Script aus: npm run db:seed
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
