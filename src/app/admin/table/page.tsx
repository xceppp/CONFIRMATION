"use client";

import { useEffect, useMemo, useState } from "react";

type Row = Record<string, string>;

function parseScore(r: Row): number {
  const raw = String(r.Score || "")
    .trim()
    .replace(",", ".");
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : NaN;
}

export default function AdminTablePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger");
        return;
      }
      setRows(data.rows || []);
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const byFiliere = new Map<string, number>();
    const byAgent = new Map<string, number>();
    let withScore = 0;
    let scoreSum = 0;
    let scoreMin = Infinity;
    let scoreMax = -Infinity;

    for (const r of rows) {
      const f = String(r.Filiere || "—").trim() || "—";
      byFiliere.set(f, (byFiliere.get(f) || 0) + 1);
      const a = String(r.Agent || "—").trim() || "—";
      byAgent.set(a, (byAgent.get(a) || 0) + 1);
      const s = parseScore(r);
      if (Number.isFinite(s)) {
        withScore += 1;
        scoreSum += s;
        scoreMin = Math.min(scoreMin, s);
        scoreMax = Math.max(scoreMax, s);
      }
    }

    const filiereBars = [...byFiliere.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));

    const agentBars = [...byAgent.entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, "fr"));

    return {
      total: rows.length,
      filiereCount: byFiliere.size,
      agentCount: byAgent.size,
      avgScore: withScore ? scoreSum / withScore : null,
      scoreMin: withScore ? scoreMin : null,
      scoreMax: withScore ? scoreMax : null,
      filiereBars,
      agentBars,
      maxF: filiereBars[0]?.count || 1,
      maxA: agentBars[0]?.count || 1,
    };
  }, [rows]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Table
          </h2>
          <p className="mt-1 text-[var(--muted)]">
            Statistiques des confirmations
            {loading ? "" : ` — ${stats.total} au total`}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
        >
          Actualiser
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="mt-6 text-sm text-[var(--muted)]">Chargement…</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4 sm:col-span-2 lg:col-span-3">
            <h3 className="font-semibold">Statistiques</h3>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Total</dt>
                <dd className="text-2xl font-semibold">{stats.total}</dd>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Filières</dt>
                <dd className="text-2xl font-semibold">{stats.filiereCount}</dd>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Agents actifs</dt>
                <dd className="text-2xl font-semibold">{stats.agentCount}</dd>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Score moyen</dt>
                <dd className="text-2xl font-semibold">
                  {stats.avgScore == null ? "—" : stats.avgScore.toFixed(2)}
                </dd>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Score min</dt>
                <dd className="text-xl font-semibold">
                  {stats.scoreMin == null ? "—" : stats.scoreMin}
                </dd>
              </div>
              <div className="rounded-xl border border-[var(--line)] bg-white px-3 py-2">
                <dt className="text-[var(--muted)]">Score max</dt>
                <dd className="text-xl font-semibold">
                  {stats.scoreMax == null ? "—" : stats.scoreMax}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4 sm:col-span-2 lg:col-span-2">
            <h3 className="font-semibold">Par filière</h3>
            {stats.filiereBars.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">Aucune donnée.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stats.filiereBars.map((b) => (
                  <li key={b.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium" title={b.label}>
                        {b.label}
                      </span>
                      <span className="shrink-0 text-[var(--muted)]">
                        {b.count}
                        <span className="ml-1 text-xs">
                          (
                          {Math.round(
                            (b.count / Math.max(stats.total, 1)) * 100,
                          )}
                          %)
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                      <div
                        className="h-full rounded-full bg-[var(--brand)] transition-[width]"
                        style={{
                          width: `${Math.max(4, (b.count / stats.maxF) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-4">
            <h3 className="font-semibold">Par agent</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Nombre de confirmations par agent.
            </p>
            {stats.agentBars.length === 0 ? (
              <p className="mt-3 text-sm text-[var(--muted)]">Aucune donnée.</p>
            ) : (
              <ul className="mt-3 space-y-2.5">
                {stats.agentBars.map((b) => (
                  <li key={b.label}>
                    <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium" title={b.label}>
                        {b.label}
                      </span>
                      <span className="shrink-0 font-semibold">{b.count}</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[var(--line)]">
                      <div
                        className="h-full rounded-full bg-[var(--accent)] transition-[width]"
                        style={{
                          width: `${Math.max(4, (b.count / stats.maxA) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
