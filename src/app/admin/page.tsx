"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FILIERES } from "@/lib/filieres";

type Stats = {
  etudiants: number;
  confirmations: number;
  parFiliere: Record<string, number>;
};

type RecentRow = Record<string, string>;

export default function AdminPage() {
  const router = useRouter();
  const [filiereCode, setFiliereCode] = useState("FBA");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [recent, setRecent] = useState<RecentRow[]>([]);
  const [loadingStats, setLoadingStats] = useState(true);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function loadStats() {
    setLoadingStats(true);
    try {
      const res = await fetch("/api/admin/stats");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger les stats");
        return;
      }
      setStats(data.stats);
      setRecent(data.recent || []);
    } catch {
      setError("Erreur réseau (stats).");
    } finally {
      setLoadingStats(false);
    }
  }

  useEffect(() => {
    loadStats();
  }, []);

  async function onUpload(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (!file) {
      setError("Choisissez un fichier CSV.");
      return;
    }

    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("filiereCode", filiereCode);
      const res = await fetch("/api/admin/upload", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Import impossible");
        return;
      }
      setMessage(data.message);
      setFile(null);
      await loadStats();
    } catch {
      setError("Erreur réseau pendant l'import.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--brand)] uppercase">
            Administration
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Base étudiants
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            Importez chaque liste CSV (une filière à la fois).
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/"
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
          >
            Agents
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
          >
            Quitter
          </button>
        </div>
      </header>

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Lignes étudiants</p>
          <p className="text-3xl font-semibold">
            {loadingStats ? "…" : (stats?.etudiants ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Confirmations</p>
          <p className="text-3xl font-semibold">
            {loadingStats ? "…" : (stats?.confirmations ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Filières chargées</p>
          <p className="text-3xl font-semibold">
            {loadingStats
              ? "…"
              : Object.keys(stats?.parFiliere || {}).length}
          </p>
        </div>
      </section>

      <form
        onSubmit={onUpload}
        className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <h2 className="text-xl font-semibold">Importer un CSV</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Séparateur <code>;</code> — comme l&apos;export Massar. Choisissez la
          filière correspondant au fichier.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Filière</span>
            <select
              value={filiereCode}
              onChange={(e) => setFiliereCode(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 outline-none ring-[var(--brand)] focus:ring-2"
            >
              {FILIERES.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.code} — {f.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Fichier CSV</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--brand)] file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-white"
            />
          </label>
        </div>

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

        <button
          type="submit"
          disabled={uploading}
          className="mt-5 rounded-xl bg-[var(--brand)] px-5 py-3 font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
        >
          {uploading ? "Import en cours…" : "Importer dans Google Sheets"}
        </button>
      </form>

      {stats && Object.keys(stats.parFiliere).length > 0 ? (
        <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-semibold">Répartition par filière</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(stats.parFiliere)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([code, count]) => (
                <li
                  key={code}
                  className="flex justify-between rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium">{code}</span>
                  <span className="text-[var(--muted)]">{count}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
        <h2 className="text-lg font-semibold">Dernières confirmations</h2>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-[var(--muted)]">Aucune pour le moment.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                  <th className="py-2 pr-3 font-medium">Code</th>
                  <th className="py-2 pr-3 font-medium">Nom</th>
                  <th className="py-2 pr-3 font-medium">Filière</th>
                  <th className="py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r, i) => (
                  <tr key={`${r.Code}-${i}`} className="border-b border-[var(--line)]/70">
                    <td className="py-2 pr-3 font-medium">{r.Code}</td>
                    <td className="py-2 pr-3">
                      {r.PrenomFr} {r.NomFr}
                    </td>
                    <td className="py-2 pr-3">
                      {r.FiliereCode || r.Filiere}
                    </td>
                    <td className="py-2 text-[var(--muted)]">
                      {r.DateConfirmation}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
