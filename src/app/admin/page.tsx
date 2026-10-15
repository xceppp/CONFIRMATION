"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ADMIN_STATS, loadAdmin, readAdminCache } from "@/lib/admin-view-cache";

type Stats = {
  etudiants: number;
  confirmations: number;
  parFiliere: Record<string, number>;
  filiereSheets?: string[];
};

function statsFrom(data: { stats?: Stats } | null): Stats | null {
  return data?.stats ?? null;
}

export default function AdminHomePage() {
  const [stats, setStats] = useState<Stats | null>(() =>
    statsFrom(readAdminCache(ADMIN_STATS.key)),
  );
  const [loading, setLoading] = useState(
    () => statsFrom(readAdminCache(ADMIN_STATS.key)) === null,
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void fetch("/api/warm", { method: "POST" });
    let cancelled = false;
    (async () => {
      if (!readAdminCache(ADMIN_STATS.key)) setLoading(true);
      setRefreshing(true);
      try {
        const data = await loadAdmin<{ stats?: Stats; error?: string }>(
          ADMIN_STATS.key,
          ADMIN_STATS.url,
        );
        if (cancelled) return;
        setStats(data.stats ?? null);
        setError("");
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Erreur réseau (stats).");
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <p className="mb-6 text-[var(--muted)]">
        Gérez les agents, importez les listes (une feuille Google par filière),
        suivez les confirmations.
      </p>

      {error ? (
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      <section className="mb-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Lignes étudiants</p>
          <p className="text-3xl font-semibold">
            {loading ? "…" : (stats?.etudiants ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Confirmations</p>
          <p className="text-3xl font-semibold">
            {loading ? "…" : (stats?.confirmations ?? 0)}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-sm text-[var(--muted)]">Feuilles filière</p>
          <p className="text-3xl font-semibold">
            {loading
              ? "…"
              : (stats?.filiereSheets?.length ??
                Object.keys(stats?.parFiliere || {}).length)}
          </p>
        </div>
      </section>

      {refreshing && stats ? (
        <p className="mb-3 text-xs text-[var(--muted)]">Mise à jour…</p>
      ) : null}

      <div className="mb-6 grid gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            Suivi
          </p>
          <div className="mt-3 grid gap-2">
            <Link
              href="/admin/confirmations"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Confirmations</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Journal, tri, export.
              </p>
            </Link>
            <Link
              href="/admin/table"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Table</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Stats par filière et par agent.
              </p>
            </Link>
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            Listes
          </p>
          <div className="mt-3 grid gap-2">
            <Link
              href="/admin/final"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Final</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Places, listes 1 à 5, hors délai.
              </p>
            </Link>
            <Link
              href="/admin/export"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Export</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Excel local et PDF de publication.
              </p>
            </Link>
          </div>
        </section>
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
            Réglages
          </p>
          <div className="mt-3 grid gap-2">
            <Link
              href="/admin/import"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Importation</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                CSV vers la feuille de la filière.
              </p>
            </Link>
            <Link
              href="/admin/agents"
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-3 transition hover:border-[var(--brand)]"
            >
              <p className="font-semibold">Agents</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                Noms et mots de passe.
              </p>
            </Link>
          </div>
        </section>
      </div>

      {stats && Object.keys(stats.parFiliere).length > 0 ? (
        <section className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
          <h2 className="text-lg font-semibold">Répartition par feuille</h2>
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
