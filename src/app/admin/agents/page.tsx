"use client";

import { FormEvent, useEffect, useState } from "react";

type AgentInfo = { Nom: string; MotDePasse: string; hasPassword: boolean };

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [agentName, setAgentName] = useState("");
  const [agentPassword, setAgentPassword] = useState("");
  const [savingAgent, setSavingAgent] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [busyName, setBusyName] = useState<string | null>(null);

  async function loadAgents() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/agents");
      const data = await res.json();
      if (res.ok) setAgents(data.agents || []);
      else setError(data.error || "Impossible de charger les agents");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAgents();
  }, []);

  function clearAlerts() {
    setError("");
    setMessage("");
  }

  async function onAddAgent(e: FormEvent) {
    e.preventDefault();
    clearAlerts();
    setSavingAgent(true);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName,
          password: agentPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible d'ajouter l'agent");
        return;
      }
      setMessage(data.message || "Agent ajouté.");
      setAgentName("");
      setAgentPassword("");
      await loadAgents();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setSavingAgent(false);
    }
  }

  function startEdit(a: AgentInfo) {
    clearAlerts();
    setEditing(a.Nom);
    setEditName(a.Nom);
    setEditPassword(a.MotDePasse || "");
  }

  function cancelEdit() {
    setEditing(null);
    setEditName("");
    setEditPassword("");
  }

  async function saveEdit(oldName: string) {
    clearAlerts();
    setBusyName(oldName);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          oldName,
          newName: editName,
          password: editPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Modification impossible");
        return;
      }
      setMessage(data.message || "Agent mis à jour.");
      cancelEdit();
      await loadAgents();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusyName(null);
    }
  }

  async function removeAgent(name: string) {
    if (
      !window.confirm(
        `Supprimer l'agent « ${name} » ? Il ne pourra plus se connecter.`,
      )
    ) {
      return;
    }
    clearAlerts();
    setBusyName(name);
    try {
      const res = await fetch("/api/admin/agents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Suppression impossible");
        return;
      }
      setMessage(data.message || "Agent supprimé.");
      if (editing === name) cancelEdit();
      await loadAgents();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusyName(null);
    }
  }

  return (
    <div>
      <h2
        className="text-2xl font-semibold"
        style={{ fontFamily: "var(--font-display), Georgia, serif" }}
      >
        Agents
      </h2>
      <p className="mt-1 text-[var(--muted)]">
        Ajouter, modifier ou supprimer — enregistré dans la feuille{" "}
        <strong>Agents</strong>.
      </p>

      <form
        onSubmit={onAddAgent}
        className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <h3 className="text-lg font-semibold">Ajouter un agent</h3>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Nom</span>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="Ex: Sara"
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none ring-[var(--brand)] focus:ring-2"
              required
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Mot de passe</span>
            <input
              type="text"
              value={agentPassword}
              onChange={(e) => setAgentPassword(e.target.value)}
              placeholder="Mot de passe agent"
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none ring-[var(--brand)] focus:ring-2"
              required
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={savingAgent}
          className="mt-5 rounded-xl bg-[var(--brand)] px-5 py-3 font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {savingAgent ? "Enregistrement…" : "Ajouter l'agent"}
        </button>
      </form>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
          {message}
        </p>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
        <h3 className="text-lg font-semibold">Liste des agents</h3>
        {loading ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Chargement…</p>
        ) : agents.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Aucun agent pour l’instant.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {agents.map((a) => {
              const isEditing = editing === a.Nom;
              const busy = busyName === a.Nom;
              return (
                <li
                  key={a.Nom}
                  className="rounded-xl border border-[var(--line)] bg-white p-4"
                >
                  {isEditing ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                          Nom
                        </span>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-[var(--line)] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium text-[var(--muted)]">
                          Mot de passe
                        </span>
                        <input
                          type="text"
                          value={editPassword}
                          onChange={(e) => setEditPassword(e.target.value)}
                          className="w-full rounded-lg border border-[var(--line)] px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
                        />
                      </label>
                      <div className="flex flex-wrap gap-2 sm:col-span-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveEdit(a.Nom)}
                          className="rounded-lg bg-[var(--brand)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                        >
                          {busy ? "…" : "Enregistrer"}
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={cancelEdit}
                          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{a.Nom}</p>
                        <p className="text-sm text-[var(--muted)]">
                          Mot de passe :{" "}
                          <span className="font-mono">
                            {a.MotDePasse || "—"}
                          </span>
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(a)}
                          className="rounded-lg border border-[var(--line)] px-3 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removeAgent(a.Nom)}
                          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-[var(--danger)] hover:bg-red-100 disabled:opacity-60"
                        >
                          {busy ? "…" : "Supprimer"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
