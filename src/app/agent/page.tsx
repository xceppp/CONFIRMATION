"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type FiliereOption = {
  FiliereCode: string;
  Filiere: string;
  Score: string;
};

type Suggestion = {
  Code: string;
  NomFr: string;
  PrenomFr: string;
  alreadyConfirmed?: boolean;
  Filiere?: string;
};

type SearchResult = {
  found: boolean;
  message?: string;
  alreadyConfirmed?: boolean;
  confirmation?: {
    Filiere?: string;
    FiliereCode?: string;
    DateConfirmation?: string;
    Agent?: string;
    Score?: string;
    NomComplet?: string;
    CNE?: string;
  };
  student?: {
    Code: string;
    NomFr: string;
    PrenomFr: string;
    Cin: string;
    Telephone: string;
    Email: string;
    Score: string;
  };
  filieres?: FiliereOption[];
};

export default function AgentPage() {
  const router = useRouter();
  const [agentName, setAgentName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [selected, setSelected] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestSeq = useRef(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetch("/api/warm", { method: "POST" });
    void fetch("/api/me")
      .then((r) => r.json())
      .then((data) => {
        if (data?.name) setAgentName(data.name);
        if (data?.role && data.role !== "agent" && data.role !== "admin") {
          router.replace("/agent/login");
        }
      })
      .catch(() => undefined);
  }, [router]);

  // Live name suggestions while typing Massar (after 4 chars) — RAM only server-side.
  useEffect(() => {
    const value = code.trim();
    if (value.length < 4) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    const seq = ++suggestSeq.current;
    const t = setTimeout(() => {
      void fetch(`/api/students?prefix=${encodeURIComponent(value)}`)
        .then((r) => r.json())
        .then((data) => {
          if (seq !== suggestSeq.current) return;
          const list = Array.isArray(data.suggestions) ? data.suggestions : [];
          setSuggestions(list);
          setShowSuggestions(list.length > 0);
        })
        .catch(() => {
          if (seq !== suggestSeq.current) return;
          setSuggestions([]);
        });
    }, 400);

    return () => clearTimeout(t);
  }, [code]);

  const canConfirm = useMemo(
    () =>
      Boolean(
        result?.found &&
          !result.alreadyConfirmed &&
          selected &&
          !confirming,
      ),
    [result, selected, confirming],
  );

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/agent/login");
    router.refresh();
  }

  async function search(e?: FormEvent, overrideCode?: string) {
    e?.preventDefault();
    setError("");
    setSuccess("");
    setResult(null);
    setSelected("");
    setShowSuggestions(false);
    const value = (overrideCode ?? code).trim();
    if (!value) return;
    if (overrideCode) setCode(overrideCode.toUpperCase());

    setLoading(true);
    try {
      const res = await fetch(`/api/students?code=${encodeURIComponent(value)}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Recherche impossible");
        return;
      }
      setResult(data);
      if (data.filieres?.length === 1) {
        setSelected(data.filieres[0].FiliereCode);
      }
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setLoading(false);
    }
  }

  function pickSuggestion(s: Suggestion) {
    setShowSuggestions(false);
    setSuggestions([]);
    void search(undefined, s.Code);
  }

  function focusCodeInput() {
    requestAnimationFrame(() => {
      codeInputRef.current?.focus();
      codeInputRef.current?.select();
    });
  }

  async function confirm(horsDelai = false) {
    if (!canConfirm || !result?.student) return;
    setConfirming(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: result.student.Code,
          filiereCode: selected,
          horsDelai,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.alreadyConfirmed && data.confirmation) {
          setResult({
            found: true,
            alreadyConfirmed: true,
            confirmation: data.confirmation,
            student: result.student,
            filieres: result.filieres,
          });
          setError("");
          setSelected("");
          return;
        }
        setError(data.error || "Confirmation impossible");
        return;
      }
      setSuccess(
        horsDelai
          ? `Hors délai : ${data.filiere}. Hors des listes 1 et 2.`
          : `Confirmé : ${data.filiere}${data.agent ? ` (par ${data.agent})` : ""}`,
      );
      setResult(null);
      setSelected("");
      setCode("");
      setSuggestions([]);
      setShowSuggestions(false);
      focusCodeInput();
    } catch {
      setError("Erreur réseau. Réessayez.");
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--brand)] uppercase">
            Confirmation
          </p>
          <h1
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            {agentName ? `Bienvenue, ${agentName}` : "Bienvenue"}
          </h1>
          <p className="mt-1 text-[var(--muted)]">
            Saisissez le code Massar, choisissez une filière, confirmez.
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
        >
          Quitter
        </button>
      </header>

      <form
        onSubmit={search}
        className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5 shadow-[0_12px_40px_rgba(28,42,36,0.06)]"
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Code Massar</span>
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <input
                ref={codeInputRef}
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.toUpperCase());
                  setResult(null);
                  setSelected("");
                  setSuccess("");
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowSuggestions(true);
                }}
                onBlur={() => {
                  if (blurTimer.current) clearTimeout(blurTimer.current);
                  blurTimer.current = setTimeout(
                    () => setShowSuggestions(false),
                    150,
                  );
                }}
                placeholder="Ex: G134724194"
                className="w-full rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-lg tracking-wide outline-none ring-[var(--brand)] focus:ring-2"
                autoFocus
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 ? (
                <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-[var(--line)] bg-white py-1 shadow-[0_12px_32px_rgba(28,42,36,0.12)]">
                  {suggestions.map((s) => {
                    const locked = Boolean(s.alreadyConfirmed);
                    return (
                      <li key={s.Code}>
                        <button
                          type="button"
                          className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left ${
                            locked
                              ? "bg-amber-50/80 hover:bg-amber-100/80"
                              : "hover:bg-[#e8f4f0]"
                          }`}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => pickSuggestion(s)}
                        >
                          <span className="font-semibold tracking-wide">
                            {s.Code}
                          </span>
                          <span className="text-sm text-[var(--muted)]">
                            {s.PrenomFr} {s.NomFr}
                          </span>
                          {locked ? (
                            <span className="text-xs font-semibold text-amber-800">
                              Déjà confirmé
                              {s.Filiere ? ` — ${s.Filiere}` : ""}
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </div>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-[var(--brand)] px-6 py-3 text-lg font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-60"
            >
              {loading ? "…" : "Chercher"}
            </button>
          </div>
        </label>
        <p className="mt-2 text-xs text-[var(--muted)]">
          En tapant le code, les noms correspondants apparaissent (à partir de 4
          caractères).
        </p>
      </form>

      {error ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="mt-4 rounded-xl bg-emerald-50 px-4 py-3 text-[var(--ok)]">
          {success}
        </p>
      ) : null}

      {result && !result.found ? (
        <p className="mt-6 rounded-xl border border-[var(--line)] bg-white px-4 py-4 text-[var(--muted)]">
          {result.message}
        </p>
      ) : null}

      {result?.found && result.student ? (
        <section className="mt-6 space-y-4">
          <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
            <h2
              className="text-2xl font-semibold"
              style={{ fontFamily: "var(--font-display), Georgia, serif" }}
            >
              {result.student.PrenomFr} {result.student.NomFr}
            </h2>
            <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--muted)]">Code</dt>
                <dd className="font-semibold">{result.student.Code}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">CIN</dt>
                <dd className="font-semibold">{result.student.Cin || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Téléphone</dt>
                <dd className="font-semibold">
                  {result.student.Telephone || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--muted)]">Email</dt>
                <dd className="font-semibold break-all">
                  {result.student.Email || "—"}
                </dd>
              </div>
            </dl>
          </div>

          {result.alreadyConfirmed ? (
            <div className="rounded-2xl border border-amber-200 bg-[var(--warn-bg)] p-5">
              <p className="font-semibold text-amber-900">
                Étudiant déjà confirmé — une seule filière autorisée
              </p>
              <dl className="mt-3 space-y-2 text-sm text-amber-950">
                <div>
                  <dt className="text-amber-900/70">Filière confirmée</dt>
                  <dd className="text-lg font-semibold">
                    {result.confirmation?.Filiere ||
                      result.confirmation?.FiliereCode ||
                      "—"}
                  </dd>
                </div>
                {result.confirmation?.Agent ? (
                  <div>
                    <dt className="text-amber-900/70">
                      Confirmé par l&apos;agent
                    </dt>
                    <dd className="text-lg font-semibold">
                      {result.confirmation.Agent}
                    </dd>
                  </div>
                ) : null}
                {result.confirmation?.Score ? (
                  <div>
                    <dt className="text-amber-900/70">Score</dt>
                    <dd className="font-medium">{result.confirmation.Score}</dd>
                  </div>
                ) : null}
              </dl>
              <p className="mt-3 text-sm text-amber-900/80">
                Impossible de confirmer une autre filière pour ce code Massar.
              </p>
            </div>
          ) : (
            <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
              <h3 className="text-lg font-semibold">Choisir une filière</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Une seule filière peut être confirmée pour cet étudiant.
              </p>
              <div className="mt-4 space-y-2">
                {(result.filieres || []).map((f) => (
                  <label
                    key={f.FiliereCode}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      selected === f.FiliereCode
                        ? "border-[var(--brand)] bg-[#e8f4f0]"
                        : "border-[var(--line)] bg-white hover:border-[var(--brand)]/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="filiere"
                      className="mt-1"
                      checked={selected === f.FiliereCode}
                      onChange={() => setSelected(f.FiliereCode)}
                    />
                    <span>
                      <span className="block font-semibold">
                        {f.FiliereCode} — {f.Filiere}
                      </span>
                      {f.Score ? (
                        <span className="text-sm text-[var(--muted)]">
                          Score : {f.Score}
                        </span>
                      ) : null}
                    </span>
                  </label>
                ))}
              </div>

              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void confirm(false)}
                className="mt-5 w-full rounded-xl bg-[var(--accent)] px-4 py-3 text-lg font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {confirming ? "Enregistrement…" : "Confirmer cette filière"}
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => void confirm(true)}
                className="mt-2 w-full rounded-xl border border-[var(--brand)] bg-white px-4 py-3 text-base font-semibold text-[var(--brand)] hover:bg-[var(--bg)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Confirmer hors délai
              </button>
              <p className="mt-2 text-center text-xs text-[var(--muted)]">
                Hors délai : enregistré à part, absent des listes 1 et 2.
              </p>
            </div>
          )}
        </section>
      ) : null}
    </main>
  );
}
