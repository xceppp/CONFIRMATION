"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Stats = {
  etudiants: number;
  confirmations: number;
  parFiliere: Record<string, number>;
  filiereSheets?: string[];
};

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/warm", { method: "POST" });
    (async () => {
      try {
        const res = await fetch("/api/admin/stats");
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Impossible de charger les stats");
          return;
        }
        setStats(data.stats);
      } catch {
        setError("Erreur r├®seau (stats).");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div>
      <p className="mb-6 text-[var(--muted)]">
        G├®rez les agents, importez les listes (une feuille Google par fili├¿re),
        suivez les confirmations.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Lignes ├®tudiants</p>
          <p className="text-3xl font-semibold">
            {loading ? "ÔÇª" : (stats?.etudiants ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Confirmations</p>
          <p className="text-3xl font-semibold">
            {loading ? "ÔÇª" : (stats?.confirmations ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Feuilles fili├¿re</p>
          <p className="text-3xl font-semibold">
            {loading
              ? "ÔÇª"
              : (stats?.filiereSheets?.length ??
                Object.keys(stats?.parFiliere || {}).length)}
          </p>
        </div>
      </section>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Link
          href="/admin/import"
          className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--brand)]"
        >
          <p className="font-semibold">Importation</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            CSV ÔåÆ feuille nomm├®e comme la fili├¿re (ex. FBA, GI).
          </p>
        </Link>
        <Link
          href="/admin/agents"
          className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--brand)]"
        >
          <p className="font-semibold">Agents</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Ajouter des noms et mots de passe.
          </p>
        </Link>
        <Link
          href="/admin/confirmations"
          className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 transition hover:border-[var(--brand)]"
        >
          <p className="font-semibold">Confirmations</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Derni├¿res inscriptions confirm├®es.
          </p>
        </Link>
      </div>

      {stats && Object.keys(stats.parFiliere).length > 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-semibold">R├®partition par feuille</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {Object.entries(stats.parFiliere)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([code, count]) => (
                <li
                  key={code}
                  className="flex justify-between rounded-lg border border-[var(--line)] bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium">Feuille {code}</span>
                  <span className="text-[var(--muted)]">{count}</span>
                </li>
              ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
