"use client";

import { useEffect, useMemo, useState } from "react";
import { buildFinalPoolForFiliere, isHorsDelai } from "@/lib/confirmations-export";
import { FILIERES, resolveFiliereFromLabel } from "@/lib/filieres";

type ConfCounts = Record<string, number>;

const PLACES_STORAGE_KEY = "admin-final-places";
const EXTRA_STORAGE_KEY = "admin-final-places-2";
const LIST1_EDIT_PASSWORD = "1955";

type ConfRow = Record<string, string>;

/** Default Places (N) — used until the admin edits (then remembered locally). */
const DEFAULT_PLACES: Record<string, string> = {
  DWM: "48",
  FBA: "58",
  GC: "48",
  GETE: "73",
  GI: "92",
  GTE: "84",
  IATE: "48",
  PMD: "58",
  TCC: "55",
  TM: "44",
};

function emptyPlaces(): Record<string, string> {
  const init: Record<string, string> = {};
  for (const f of FILIERES) init[f.code] = DEFAULT_PLACES[f.code] ?? "";
  return init;
}

function loadSavedMap(
  key: string,
  init: Record<string, string>,
): Record<string, string> {
  const next = { ...init };
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return next;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    if (!saved || typeof saved !== "object") return next;
    for (const f of FILIERES) {
      const v = saved[f.code];
      if (v != null && String(v).trim() !== "") {
        next[f.code] = String(v);
      }
    }
  } catch {
    /* ignore corrupt storage */
  }
  return next;
}

function emptyExtra(): Record<string, string> {
  const init: Record<string, string> = {};
  for (const f of FILIERES) init[f.code] = "";
  return init;
}

export default function AdminFinalPage() {
  const [places, setPlaces] = useState<Record<string, string>>(emptyPlaces);
  const [extra, setExtra] = useState<Record<string, string>>(emptyExtra);
  const [placesHydrated, setPlacesHydrated] = useState(false);
  const [confirmedByCode, setConfirmedByCode] = useState<ConfCounts>({});
  const [confRows, setConfRows] = useState<ConfRow[]>([]);
  const [horsCount, setHorsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<
    | "l1-excel"
    | "l1-pdf"
    | "l2-excel"
    | "l2-pdf"
    | "hors"
    | "hors-new"
    | "hors-lock"
    | "hors-unlock"
    | null
  >(null);
  const [list1Unlocked, setList1Unlocked] = useState(false);
  const [list2Unlocked, setList2Unlocked] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState<"l1" | "l2" | null>(null);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [horsLockedCount, setHorsLockedCount] = useState(0);
  const [horsLockedAt, setHorsLockedAt] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  async function loadHorsLockStatus() {
    try {
      const res = await fetch("/api/admin/final/hors-delai");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      setHorsLockedCount(Number(data.lockedCount || 0));
      setHorsLockedAt(String(data.lockedAt || ""));
    } catch {
      /* ignore */
    }
  }

  async function loadCounts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/confirmations");
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Impossible de charger les confirmations");
        return;
      }
      const counts: ConfCounts = {};
      for (const f of FILIERES) counts[f.code] = 0;

      const allRows: ConfRow[] = Array.isArray(data.rows) ? data.rows : [];
      const rows = allRows.filter((row) => !isHorsDelai(row));
      if (allRows.length > 0) {
        for (const row of rows) {
          const label = String(row.Filiere || row.FiliereCode || "");
          const match = resolveFiliereFromLabel(label);
          if (match) counts[match.code] = (counts[match.code] || 0) + 1;
        }
      } else {
        for (const g of data.groups || []) {
          const match = resolveFiliereFromLabel(String(g.filiere || ""));
          if (match) {
            counts[match.code] =
              (counts[match.code] || 0) + Number(g.count || 0);
          }
        }
      }
      setConfirmedByCode(counts);
      setConfRows(rows);
      setHorsCount(allRows.filter((row) => isHorsDelai(row)).length);
      await loadHorsLockStatus();
    } catch {
      setError("Erreur réseau.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPlaces(loadSavedMap(PLACES_STORAGE_KEY, emptyPlaces()));
    setExtra(loadSavedMap(EXTRA_STORAGE_KEY, emptyExtra()));
    setPlacesHydrated(true);
    void loadCounts();
  }, []);

  useEffect(() => {
    if (!placesHydrated) return;
    try {
      localStorage.setItem(PLACES_STORAGE_KEY, JSON.stringify(places));
      localStorage.setItem(EXTRA_STORAGE_KEY, JSON.stringify(extra));
    } catch {
      /* quota / private mode */
    }
  }, [places, extra, placesHydrated]);

  const filledCount = useMemo(
    () =>
      FILIERES.filter((f) => {
        const n = Number.parseInt(places[f.code] || "", 10);
        return Number.isFinite(n) && n > 0;
      }).length,
    [places],
  );

  const extraCount = useMemo(
    () =>
      FILIERES.filter((f) => {
        const n = Number.parseInt(extra[f.code] || "", 10);
        return Number.isFinite(n) && n > 0;
      }).length,
    [extra],
  );

  function tryUnlockList(which: "l1" | "l2") {
    if (unlockPassword.trim() !== LIST1_EDIT_PASSWORD) {
      setError(
        which === "l1"
          ? "Mot de passe incorrect. Liste 1 reste verrouillée."
          : "Mot de passe incorrect. Liste 2 reste verrouillée.",
      );
      return;
    }
    if (which === "l1") setList1Unlocked(true);
    else setList2Unlocked(true);
    setUnlockOpen(null);
    setUnlockPassword("");
    setError("");
    setInfo(
      which === "l1"
        ? "Liste 1 déverrouillée. Vous pouvez modifier les places."
        : "Liste 2 déverrouillée. Vous pouvez modifier les places.",
    );
  }

  function seuilOf(code: string): string {
    const n = Number.parseInt(places[code] || "", 10);
    if (!Number.isFinite(n) || n <= 0) return "—";
    const f = FILIERES.find((x) => x.code === code);
    if (!f) return "—";
    const built = buildFinalPoolForFiliere(confRows, f.code, f.name, n);
    return built.seuil || "—";
  }

  async function doExport(round: 1 | 2, format: "excel" | "pdf") {
    const tag = `${round === 1 ? "l1" : "l2"}-${format}` as
      | "l1-excel"
      | "l1-pdf"
      | "l2-excel"
      | "l2-pdf";
    setExporting(tag);
    setError("");
    setInfo("");
    try {
      const bodyPlaces: Record<string, number> = {};
      const bodyExtra: Record<string, number> = {};
      for (const f of FILIERES) {
        const n = Number.parseInt(String(places[f.code] || "").trim(), 10);
        const m = Number.parseInt(String(extra[f.code] || "").trim(), 10);
        if (Number.isFinite(n) && n > 0) bodyPlaces[f.code] = n;
        if (Number.isFinite(m) && m > 0) bodyExtra[f.code] = m;
      }
      if (round === 1 && Object.keys(bodyPlaces).length === 0) {
        setError("Indiquez au moins un nombre de places (> 0).");
        return;
      }
      if (round === 2 && Object.keys(bodyExtra).length === 0) {
        setError("Indiquez au moins un nombre pour la liste 2 (> 0).");
        return;
      }

      const res = await fetch("/api/admin/final/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places: bodyPlaces,
          extra: bodyExtra,
          format,
          round,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ||
        (format === "pdf"
          ? "admis_inscription.pdf"
          : "admis_inscription.xlsx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo(
        round === 2
          ? format === "pdf"
            ? "PDF liste 2 téléchargé — étudiants juste après le seuil de la liste 1."
            : "Excel liste 2 téléchargé — suite du classement, sans les étudiants de la liste 1."
          : format === "pdf"
            ? "PDF liste 1 téléchargé — top scores selon les places."
            : "Excel liste 1 téléchargé — top scores selon les places.",
      );
    } catch {
      setError("Erreur réseau pendant l'export.");
    } finally {
      setExporting(null);
    }
  }

  async function lockHorsDelaiFirst() {
    setExporting("hors-lock");
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/admin/final/hors-delai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "lock" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Verrouillage impossible");
        return;
      }
      setHorsLockedCount(Number(data.lockedCount || 0));
      setHorsLockedAt(String(data.lockedAt || ""));
      setInfo(
        data.message ||
          `1ère sélection hors délai verrouillée (${data.lockedCount}).`,
      );
    } catch {
      setError("Erreur réseau pendant le verrouillage hors délai.");
    } finally {
      setExporting(null);
    }
  }

  async function clearHorsDelaiFirstLock() {
    setExporting("hors-unlock");
    setError("");
    setInfo("");
    try {
      const res = await fetch("/api/admin/final/hors-delai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clearLock" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Impossible d'effacer le verrouillage");
        return;
      }
      setHorsLockedCount(0);
      setHorsLockedAt("");
      setInfo(data.message || "Verrouillage hors délai effacé.");
    } catch {
      setError("Erreur réseau.");
    } finally {
      setExporting(null);
    }
  }

  async function exportHorsDelai(onlyNew = false) {
    setExporting(onlyNew ? "hors-new" : "hors");
    setError("");
    setInfo("");
    try {
      const bodyPlaces: Record<string, number> = {};
      for (const f of FILIERES) {
        const n = Number.parseInt(String(places[f.code] || "").trim(), 10);
        if (Number.isFinite(n) && n > 0) bodyPlaces[f.code] = n;
      }
      if (Object.keys(bodyPlaces).length === 0) {
        setError("Indiquez les places liste 1 pour calculer le seuil.");
        return;
      }
      const res = await fetch("/api/admin/final/hors-delai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ places: bodyPlaces, onlyNew }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Export hors délai impossible");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        res.headers
          .get("Content-Disposition")
          ?.match(/filename="(.+)"/)?.[1] ||
        (onlyNew ? "hors_delai_nouveaux.xlsx" : "hors_delai.xlsx");
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setInfo(
        onlyNew
          ? "Excel NOUVEAUX hors délai uniquement."
          : horsLockedCount > 0
            ? "Excel séparé : feuilles « 1ère sélection » + feuilles « Nouveaux » (+ Resume)."
            : "Excel hors délai : Liste normale (≤ seuil) et TO CONTACT (> seuil). Verrouillez la 1ère sélection pour séparer les vagues.",
      );
    } catch {
      setError("Erreur réseau pendant l'export hors délai.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2
            className="text-2xl font-semibold"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Final
          </h2>
          <p className="mt-1 max-w-2xl text-[var(--muted)]">
            Liste 1 : top N + ex aequo + seuil publié. Liste 2 : suivants
            strictement sous le seuil, sans aucun CNE de la liste 1, sans
            trou dans le classement. Hors délai &gt; seuil → TO CONTACT
            (Excel). Verrouillez la 1ère vague hors délai, puis exportez
            « Nouveaux » pour les inserts suivants uniquement.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void loadCounts()}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[var(--bg)]"
            >
              Actualiser
            </button>
            <button
              type="button"
              disabled={exporting !== null || filledCount === 0}
              onClick={() => void doExport(1, "excel")}
              className="rounded-xl bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[var(--brand-dark)] disabled:opacity-50"
            >
              {exporting === "l1-excel" ? "Excel…" : "Liste 1 Excel"}
            </button>
            <button
              type="button"
              disabled={exporting !== null || filledCount === 0}
              onClick={() => void doExport(1, "pdf")}
              className="rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50"
            >
              {exporting === "l1-pdf" ? "PDF…" : "Liste 1 PDF"}
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={exporting !== null || extraCount === 0}
              onClick={() => void doExport(2, "excel")}
              className="rounded-xl border border-[var(--brand)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--brand)] hover:bg-[var(--bg)] disabled:opacity-50"
            >
              {exporting === "l2-excel" ? "Excel…" : "Liste 2 Excel"}
            </button>
            <button
              type="button"
              disabled={exporting !== null || extraCount === 0}
              onClick={() => void doExport(2, "pdf")}
              className="rounded-xl border border-[var(--accent)] bg-white px-4 py-2.5 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--bg)] disabled:opacity-50"
            >
              {exporting === "l2-pdf" ? "PDF…" : "Liste 2 PDF"}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => void exportHorsDelai(false)}
              className="rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold hover:bg-[var(--bg)] disabled:opacity-50"
            >
              {exporting === "hors"
                ? "Hors délai…"
                : `Hors délai${horsCount > 0 ? ` (${horsCount})` : ""}`}
            </button>
            <button
              type="button"
              disabled={exporting !== null || horsCount === 0}
              onClick={() => void lockHorsDelaiFirst()}
              className="rounded-xl border border-amber-600 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
              title="Fige la vague actuelle : les prochains inserts = export Nouveaux"
            >
              {exporting === "hors-lock"
                ? "Verrouillage…"
                : horsLockedCount > 0
                  ? `Re-verrouiller (${horsLockedCount})`
                  : "Verrouiller 1ère sélection"}
            </button>
            <button
              type="button"
              disabled={exporting !== null || horsLockedCount === 0}
              onClick={() => void exportHorsDelai(true)}
              className="rounded-xl border border-emerald-700 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
            >
              {exporting === "hors-new" ? "Nouveaux…" : "Hors délai (nouveaux)"}
            </button>
            {horsLockedCount > 0 ? (
              <button
                type="button"
                disabled={exporting !== null}
                onClick={() => void clearHorsDelaiFirstLock()}
                className="rounded-xl border border-[var(--line)] bg-white px-3 py-2.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--bg)] disabled:opacity-50"
              >
                {exporting === "hors-unlock" ? "…" : "Effacer verrou"}
              </button>
            ) : null}
          </div>
          {horsLockedCount > 0 ? (
            <p className="max-w-xl text-right text-xs text-[var(--muted)]">
              1ère sélection hors délai verrouillée : {horsLockedCount}{" "}
              étudiant(s)
              {horsLockedAt ? ` — ${horsLockedAt}` : ""}. L’export « Hors
              délai » sépare 1ère sélection / Nouveaux.
            </p>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-[var(--danger)]">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-[var(--ok)]">
          {info}
        </p>
      ) : null}

      <section className="mt-6 overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--bg-card)] p-5">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <p className="text-sm text-[var(--muted)]">
            Liste 1 et Liste 2 sont verrouillées pour éviter une modification
            accidentelle.
          </p>
          <div className="flex flex-wrap gap-2">
            {list1Unlocked ? (
              <button
                type="button"
                onClick={() => {
                  setList1Unlocked(false);
                  setUnlockOpen(null);
                  setUnlockPassword("");
                  setInfo("Liste 1 verrouillée.");
                }}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
              >
                Verrouiller liste 1
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUnlockOpen((v) => (v === "l1" ? null : "l1"));
                  setUnlockPassword("");
                  setError("");
                }}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
              >
                Modifier liste 1
              </button>
            )}
            {list2Unlocked ? (
              <button
                type="button"
                onClick={() => {
                  setList2Unlocked(false);
                  setUnlockOpen(null);
                  setUnlockPassword("");
                  setInfo("Liste 2 verrouillée.");
                }}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
              >
                Verrouiller liste 2
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setUnlockOpen((v) => (v === "l2" ? null : "l2"));
                  setUnlockPassword("");
                  setError("");
                }}
                className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold"
              >
                Modifier liste 2
              </button>
            )}
          </div>
        </div>
        {unlockOpen &&
        ((unlockOpen === "l1" && !list1Unlocked) ||
          (unlockOpen === "l2" && !list2Unlocked)) ? (
          <div className="mb-4 flex flex-wrap items-end gap-2">
            <label className="text-sm font-medium">
              Mot de passe ({unlockOpen === "l1" ? "Liste 1" : "Liste 2"})
              <input
                type="password"
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && unlockOpen)
                    tryUnlockList(unlockOpen);
                }}
                autoComplete="off"
                className="mt-1.5 block w-40 rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2"
              />
            </label>
            <button
              type="button"
              onClick={() => unlockOpen && tryUnlockList(unlockOpen)}
              className="rounded-xl bg-[var(--brand)] px-4 py-2 text-sm font-semibold text-white"
            >
              Déverrouiller
            </button>
          </div>
        ) : null}
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Chargement…</p>
        ) : (
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--line)] text-[var(--muted)]">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Filière</th>
                <th className="py-2 pr-3 font-medium">Confirmés</th>
                <th className="py-2 pr-3 font-medium">Liste 1 (N)</th>
                <th className="py-2 pr-3 font-medium">Seuil</th>
                <th className="py-2 font-medium">Liste 2 (+)</th>
              </tr>
            </thead>
            <tbody>
              {FILIERES.map((f) => {
                const confirmed = confirmedByCode[f.code] || 0;
                const n = Number.parseInt(places[f.code] || "", 10);
                const short =
                  Number.isFinite(n) && n > 0 && confirmed < n
                    ? confirmed
                    : null;
                return (
                  <tr
                    key={f.code}
                    className="border-b border-[var(--line)]/70"
                  >
                    <td className="py-3 pr-3 font-semibold">{f.code}</td>
                    <td className="py-3 pr-3">{f.name}</td>
                    <td className="py-3 pr-3 text-[var(--muted)]">
                      {confirmed}
                      {short != null ? (
                        <span className="ml-2 text-xs text-[var(--danger)]">
                          (moins que N)
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="ex. 50"
                        value={places[f.code]}
                        disabled={!list1Unlocked}
                        onChange={(e) =>
                          setPlaces((prev) => ({
                            ...prev,
                            [f.code]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2 disabled:cursor-not-allowed disabled:bg-[var(--bg)] disabled:text-[var(--muted)]"
                      />
                    </td>
                    <td className="py-3 pr-3 font-medium text-[var(--ink)]">
                      {seuilOf(f.code)}
                    </td>
                    <td className="py-3">
                      <input
                        type="number"
                        min={0}
                        step={1}
                        inputMode="numeric"
                        placeholder="ex. 25"
                        value={extra[f.code] || ""}
                        disabled={!list2Unlocked}
                        onChange={(e) =>
                          setExtra((prev) => ({
                            ...prev,
                            [f.code]: e.target.value,
                          }))
                        }
                        className="w-28 rounded-xl border border-[var(--line)] bg-white px-3 py-2 outline-none ring-[var(--brand)] focus:ring-2 disabled:cursor-not-allowed disabled:bg-[var(--bg)] disabled:text-[var(--muted)]"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
