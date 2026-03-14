// Admin Users — Benutzerverwaltung
// Features: Suche, Filter, Sortierung, Bearbeiten, Löschen, Sperren, Checkos schenken
"use client";

import { useEffect, useState, useCallback } from "react";

interface User {
  id: string;
  name: string | null;
  email: string;
  role: string;
  checkosBalance: number;
  isSuspended: boolean;
  suspendReason: string | null;
  isEmailVerified: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Suche & Filter
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sort, setSort] = useState("createdAt");
  const [order, setOrder] = useState("desc");

  // Gift Modal State
  const [giftUserId, setGiftUserId] = useState<string | null>(null);
  const [giftAmount, setGiftAmount] = useState("");
  const [giftDescription, setGiftDescription] = useState("");
  const [giftLoading, setGiftLoading] = useState(false);
  const [giftSuccess, setGiftSuccess] = useState("");

  // Edit Modal State
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  // Delete Modal State
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // Suspend Modal State
  const [suspendUser, setSuspendUser] = useState<User | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [suspendLoading, setSuspendLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (roleFilter) params.set("role", roleFilter);
      if (statusFilter) params.set("filter", statusFilter);
      if (sort) params.set("sort", sort);
      if (order) params.set("order", order);

      const queryString = params.toString();
      const url = `/api/admin/users${queryString ? `?${queryString}` : ""}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Fehler beim Laden");
      const data = await res.json();
      setUsers(data.users);
      setError("");
    } catch {
      setError("Benutzer konnten nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  }, [search, roleFilter, statusFilter, sort, order]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchUsers();
    }, 300); // Debounce für Suche
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  // ==================== Checkos schenken ====================
  const handleGiftCheckos = async () => {
    if (!giftUserId) return;
    const amount = parseInt(giftAmount);
    if (!amount || amount <= 0 || amount > 10000) {
      alert("Bitte einen gültigen Betrag eingeben (1–10.000).");
      return;
    }

    setGiftLoading(true);
    setGiftSuccess("");

    try {
      const res = await fetch(`/api/admin/users/${giftUserId}/gift-checkos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount,
          description: giftDescription || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setGiftSuccess(`${amount} Checkos geschenkt! Neuer Stand: ${data.newBalance}`);
      setGiftAmount("");
      setGiftDescription("");
      fetchUsers();

      setTimeout(() => {
        setGiftUserId(null);
        setGiftSuccess("");
      }, 2000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Verschenken");
    } finally {
      setGiftLoading(false);
    }
  };

  // ==================== User bearbeiten ====================
  const openEditModal = (user: User) => {
    setEditUser(user);
    setEditName(user.name || "");
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditError("");
  };

  const handleEditUser = async () => {
    if (!editUser) return;
    setEditLoading(true);
    setEditError("");

    try {
      const body: { name?: string; email?: string; role?: string } = {};
      if (editName !== (editUser.name || "")) body.name = editName;
      if (editEmail !== editUser.email) body.email = editEmail;
      if (editRole !== editUser.role) body.role = editRole;

      if (Object.keys(body).length === 0) {
        setEditUser(null);
        return;
      }

      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setEditUser(null);
      fetchUsers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Fehler beim Speichern");
    } finally {
      setEditLoading(false);
    }
  };

  // ==================== User löschen ====================
  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setDeleteLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setDeleteUser(null);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Löschen");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ==================== User sperren/entsperren ====================
  const handleSuspendToggle = async (user: User) => {
    if (user.isSuspended) {
      // Direkt entsperren
      setSuspendLoading(true);
      try {
        const res = await fetch(`/api/admin/users/${user.id}/suspend`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isSuspended: false }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Fehler");
        fetchUsers();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Fehler beim Entsperren");
      } finally {
        setSuspendLoading(false);
      }
    } else {
      // Modal öffnen für Grund
      setSuspendUser(user);
      setSuspendReason("");
    }
  };

  const handleSuspendUser = async () => {
    if (!suspendUser) return;
    setSuspendLoading(true);

    try {
      const res = await fetch(`/api/admin/users/${suspendUser.id}/suspend`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          isSuspended: true,
          reason: suspendReason || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Fehler");

      setSuspendUser(null);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Fehler beim Sperren");
    } finally {
      setSuspendLoading(false);
    }
  };

  // ==================== Sortierung Toggle ====================
  const handleSort = (field: string) => {
    if (sort === field) {
      setOrder(order === "asc" ? "desc" : "asc");
    } else {
      setSort(field);
      setOrder("asc");
    }
  };

  const sortIcon = (field: string) => {
    if (sort !== field) return "↕";
    return order === "asc" ? "↑" : "↓";
  };

  // ==================== Render ====================
  const giftUser = users.find((u) => u.id === giftUserId);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Benutzer-Verwaltung</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Suche & Filter */}
      <div className="mb-4 flex flex-col sm:flex-row gap-3">
        <div className="flex-1">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Name oder E-Mail suchen…"
            className="w-full border border-gray-300 rounded-lg px-4 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="">Alle Rollen</option>
          <option value="admin">Admins</option>
          <option value="user">User</option>
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
        >
          <option value="">Alle Status</option>
          <option value="suspended">Gesperrte</option>
        </select>
      </div>

      {/* User Count */}
      <div className="mb-3 text-sm text-gray-500">
        {loading ? "Lade…" : `${users.length} Benutzer gefunden`}
      </div>

      {/* User-Tabelle */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => handleSort("name")}
                >
                  Name {sortIcon("name")}
                </th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">E-Mail</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Rolle</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Status</th>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => handleSort("checkosBalance")}
                >
                  Checkos {sortIcon("checkosBalance")}
                </th>
                <th
                  className="text-left px-4 py-3 font-medium text-gray-600 cursor-pointer hover:text-gray-900 select-none"
                  onClick={() => handleSort("createdAt")}
                >
                  Registriert {sortIcon("createdAt")}
                </th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!loading && users.map((user) => (
                <tr
                  key={user.id}
                  className={`hover:bg-gray-50 ${user.isSuspended ? "bg-red-50/50" : ""}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-900">
                    {user.name || "–"}
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    <div className="flex items-center gap-1">
                      {user.email}
                      {!user.isEmailVerified && (
                        <span className="text-xs text-amber-600" title="E-Mail nicht verifiziert">⚠️</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        user.role === "admin"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.isSuspended ? (
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700"
                        title={user.suspendReason || "Kein Grund angegeben"}
                      >
                        🚫 Gesperrt
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        ✅ Aktiv
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-gray-900 font-medium">
                      🦎 {user.checkosBalance}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString("de-CH")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                      <button
                        onClick={() => {
                          setGiftUserId(user.id);
                          setGiftAmount("");
                          setGiftDescription("");
                          setGiftSuccess("");
                        }}
                        className="text-emerald-600 hover:text-emerald-700 text-xs font-medium whitespace-nowrap"
                        title="Checkos schenken"
                      >
                        🎁 Schenken
                      </button>
                      <button
                        onClick={() => openEditModal(user)}
                        className="text-blue-600 hover:text-blue-700 text-xs font-medium whitespace-nowrap"
                        title="Bearbeiten"
                      >
                        ✏️ Bearbeiten
                      </button>
                      <button
                        onClick={() => handleSuspendToggle(user)}
                        disabled={suspendLoading}
                        className={`text-xs font-medium whitespace-nowrap ${
                          user.isSuspended
                            ? "text-green-600 hover:text-green-700"
                            : "text-orange-600 hover:text-orange-700"
                        }`}
                        title={user.isSuspended ? "Entsperren" : "Sperren"}
                      >
                        {user.isSuspended ? "🔓 Entsperren" : "🔒 Sperren"}
                      </button>
                      <button
                        onClick={() => setDeleteUser(user)}
                        className="text-red-600 hover:text-red-700 text-xs font-medium whitespace-nowrap"
                        title="Löschen"
                      >
                        🗑️ Löschen
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && users.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                    Keine Benutzer gefunden.
                  </td>
                </tr>
              )}
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center">
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-emerald-600" />
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================== Gift Checkos Modal ==================== */}
      {giftUserId && giftUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">🎁 Checkos schenken</h3>
            <p className="text-sm text-gray-500 mb-4">
              An: <strong>{giftUser.name || giftUser.email}</strong>
              <br />
              Aktueller Stand: {giftUser.checkosBalance} Checkos
            </p>

            {giftSuccess ? (
              <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm text-center">
                ✅ {giftSuccess}
              </div>
            ) : (
              <>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Anzahl Checkos
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="10000"
                      value={giftAmount}
                      onChange={(e) => setGiftAmount(e.target.value)}
                      placeholder="z.B. 50"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Grund (optional)
                    </label>
                    <input
                      type="text"
                      value={giftDescription}
                      onChange={(e) => setGiftDescription(e.target.value)}
                      placeholder="z.B. Willkommensgeschenk"
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button
                    onClick={() => setGiftUserId(null)}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
                  >
                    Abbrechen
                  </button>
                  <button
                    onClick={handleGiftCheckos}
                    disabled={giftLoading || !giftAmount}
                    className="flex-1 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {giftLoading ? "Wird geschenkt…" : "Schenken"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ==================== Edit User Modal ==================== */}
      {editUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-gray-900 mb-1">✏️ Benutzer bearbeiten</h3>
            <p className="text-sm text-gray-500 mb-4">
              Änderungen für: <strong>{editUser.name || editUser.email}</strong>
            </p>

            {editError && (
              <div className="mb-3 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">
                {editError}
              </div>
            )}

            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-Mail</label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                {editEmail !== editUser.email && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠️ Bei E-Mail-Änderung wird die Verifizierung zurückgesetzt.
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rolle</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setEditUser(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={handleEditUser}
                disabled={editLoading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {editLoading ? "Wird gespeichert…" : "Speichern"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Delete User Modal ==================== */}
      {deleteUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-red-700 mb-2">🗑️ Benutzer löschen</h3>
            <p className="text-sm text-gray-700 mb-4">
              User <strong>{deleteUser.name || deleteUser.email}</strong> wirklich löschen?
              Alle Daten gehen verloren.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              ⚠️ Diese Aktion kann nicht rückgängig gemacht werden. Alle Transaktionen, Suchen und
              sonstigen Daten dieses Benutzers werden unwiderruflich gelöscht.
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setDeleteUser(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleteLoading}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleteLoading ? "Wird gelöscht…" : "Endgültig löschen"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== Suspend User Modal ==================== */}
      {suspendUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-orange-700 mb-2">🔒 Benutzer sperren</h3>
            <p className="text-sm text-gray-700 mb-4">
              <strong>{suspendUser.name || suspendUser.email}</strong> wird gesperrt und kann sich
              nicht mehr einloggen.
            </p>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Grund (optional)
              </label>
              <input
                type="text"
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                placeholder="z.B. Verstoß gegen Nutzungsbedingungen"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setSuspendUser(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition"
              >
                Abbrechen
              </button>
              <button
                onClick={handleSuspendUser}
                disabled={suspendLoading}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {suspendLoading ? "Wird gesperrt…" : "Sperren"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
