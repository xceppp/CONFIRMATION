"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AgentLoginPage() {
  const router = useRouter();
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingNames, setLoadingNames] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agents");
        const data = await res.json();
        if (!cancelled) {
          const list: string[] = data.agents || [];
          setNames(list);
          if (list.length === 1) setName(list[0]);
        }
      } catch {
        if (!cancelled) setError("Impossible de charger la liste des agents.");
      } finally {
        if (!cancelled) setLoadingNames(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: "agent", name, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Connexion impossible");
        return;
      }
      router.replace("/agent");
      router.refresh();
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-8 shadow-[0_20px_50px_rgba(28,42,36,0.08)]">
        <p className="text-sm font-semibold tracking-wide text-[var(--brand)] uppercase">
          Confirmation
        </p>
        <h1
          className="mt-2 text-3xl font-semibold tracking-tight text-[var(--ink)]"
          style={{ fontFamily: "var(--font-display), Georgia, serif" }}
        >
          Accès agent
        </h1>
        <p className="mt-2 text-[var(--muted)]">
          Choisissez votre nom, puis entrez le mot de passe donné par
          l&apos;admin.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Votre nom</span>
            <select
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-lg outline-none ring-[var(--brand)] focus:ring-2"
              required
              disabled={loadingNames}
            >
              <option value="">
                {loadingNames ? "Chargement…" : "— Sélectionner —"}
              </option>
              {names.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-sm font-medium">Mot de passe</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-lg outline-none ring-[var(--brand)] focus:ring-2"
              required
            />
          </label>

          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
              {error}
            </p>
          ) : null}

          {!loadingNames && names.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Aucun agent configuré. L&apos;admin doit ajouter des agents
              d&apos;abord.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={loading || !name}
            className="w-full rounded-xl bg-[var(--brand)] px-4 py-3 text-lg font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-60"
          >
            {loading ? "Connexion…" : "Entrer"}
          </button>
        </form>
      </div>
    </main>
  );
}
