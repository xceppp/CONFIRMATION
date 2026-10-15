"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ADMIN_AGENTS,
  ADMIN_CONFIRMATIONS,
  ADMIN_COUNTS,
  ADMIN_HORS,
  ADMIN_STATS,
  beginAdminGet,
} from "@/lib/admin-view-cache";

type Warm = { key: string; url: string };

const GROUPS: {
  label: string;
  links: { href: string; label: string; exact?: boolean; warm: Warm[] }[];
}[] = [
  {
    label: "Suivi",
    links: [
      {
        href: "/admin",
        label: "Vue d'ensemble",
        exact: true,
        warm: [ADMIN_STATS],
      },
      {
        href: "/admin/confirmations",
        label: "Confirmations",
        warm: [ADMIN_CONFIRMATIONS],
      },
      {
        href: "/admin/table",
        label: "Table",
        warm: [ADMIN_CONFIRMATIONS],
      },
    ],
  },
  {
    label: "Listes",
    links: [
      {
        href: "/admin/final",
        label: "Final",
        warm: [ADMIN_COUNTS, ADMIN_HORS],
      },
      { href: "/admin/export", label: "Export", warm: [] },
    ],
  },
  {
    label: "Réglages",
    links: [
      { href: "/admin/import", label: "Importation", warm: [] },
      { href: "/admin/agents", label: "Agents", warm: [ADMIN_AGENTS] },
    ],
  },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [leaving, setLeaving] = useState(false);
  const [open, setOpen] = useState(false);
  const warmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    for (const group of GROUPS) {
      for (const link of group.links) router.prefetch(link.href);
    }
  }, [router]);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  function warmLink(link: (typeof GROUPS)[number]["links"][number]) {
    router.prefetch(link.href);
    if (warmTimer.current) clearTimeout(warmTimer.current);
    warmTimer.current = setTimeout(() => {
      for (const item of link.warm) {
        void beginAdminGet(item.key, item.url).catch(() => undefined);
      }
    }, 100);
  }

  async function logout() {
    if (leaving) return;
    setLeaving(true);
    try {
      await fetch("/api/logout", { method: "POST" });
      router.replace("/admin/login");
      router.refresh();
    } catch {
      setLeaving(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed top-4 left-4 z-50 rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm font-semibold shadow-sm md:hidden"
      >
        {open ? "Fermer" : "Menu"}
      </button>
      {open ? (
        <button
          type="button"
          aria-label="Fermer le menu"
          className="fixed inset-0 z-30 bg-[#1c2a24]/30 md:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col border-r border-[var(--line)] bg-[var(--bg-card)] px-4 py-6 transition-transform duration-200 md:sticky md:top-0 md:h-screen md:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-2">
          <p className="text-xs font-semibold tracking-[0.14em] text-[var(--brand)] uppercase">
            Administration
          </p>
          <h1
            className="mt-1 text-2xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Confirmation
          </h1>
        </div>

        <nav className="mt-8 flex flex-1 flex-col gap-6 overflow-y-auto">
          {GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2 text-[10px] font-semibold tracking-[0.14em] text-[var(--muted)] uppercase">
                {group.label}
              </p>
              <div className="mt-2 flex flex-col gap-1">
                {group.links.map((link) => {
                  const active = link.exact
                    ? pathname === link.href
                    : pathname === link.href ||
                      pathname.startsWith(`${link.href}/`);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      prefetch
                      onMouseEnter={() => warmLink(link)}
                      onFocus={() => warmLink(link)}
                      className={`rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                        active
                          ? "bg-[var(--brand)] text-white shadow-[0_4px_14px_rgba(15,92,76,0.25)]"
                          : "text-[var(--ink)] hover:bg-[#e8f4f0]"
                      }`}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <button
          type="button"
          onClick={logout}
          disabled={leaving}
          className="mt-4 rounded-xl border border-[var(--line)] bg-white px-4 py-2.5 text-sm font-semibold transition hover:bg-[var(--bg)] disabled:opacity-60"
        >
          {leaving ? "Sortie…" : "Quitter"}
        </button>
      </aside>
    </>
  );
}
