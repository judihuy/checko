// Admin Audit Log — Zeigt alle Audit-Log-Einträge aus der DB
"use client";

import { useEffect, useState, useCallback } from "react";

interface AuditEntry {
  id: string;
  adminId: string;
  action: string;
  target: string | null;
  details: string | null;
  createdAt: string;
}

export default function AdminAuditLogPage() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/audit-log");
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setLogs(data.logs);
    } catch {
      setError("Audit-Logs konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Audit-Log</h1>

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
                <th className="text-left px-4 py-3 font-medium text-gray-600">Zeitpunkt</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Aktion</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Ziel</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Details</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Admin-ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                    {new Date(log.createdAt).toLocaleString("de-CH")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {log.target || "–"}
                  </td>
                  <td className="px-4 py-3 text-gray-600 text-xs max-w-xs truncate">
                    {log.details || "–"}
                  </td>
                  <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                    {log.adminId.substring(0, 8)}...
                  </td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Noch keine Audit-Log-Einträge vorhanden.
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
