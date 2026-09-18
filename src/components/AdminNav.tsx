"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Vue d'ensemble", exact: true },
  { href: "/admin/import", label: "Importation" },
  { href: "/admin/agents", label: "Agents" },
  { href: "/admin/confirmations", label: "Confirmations" },
  { href: "/admin/final", label: "Final" },
];

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  return (
    <header className="mb-8 border-b border-[var(--line)] pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-wide text-[var(--brand)] uppercase">
            Administration
          </p>
          <h1
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Confirmation
          </h1>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-xl border border-[var(--line)] bg-white px-4 py-2 text-sm font-semibold hover:bg-[var(--bg)]"
        >
          Quitter
        </button>
      </div>

      <nav className="mt-5 flex flex-wrap gap-2">
        {LINKS.map((link) => {
          const active = link.exact
            ? pathname === link.href
            : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
                active
                  ? "bg-[var(--brand)] text-white"
                  : "border border-[var(--line)] bg-white text-[var(--ink)] hover:border-[var(--brand)]/40"
              }`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
