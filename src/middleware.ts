import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  COOKIE_NAME,
  type Session,
  type SessionRole,
} from "@/lib/session-types";

const enc = new TextEncoder();

async function hmacHex(secret: string, value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function readSession(request: NextRequest): Promise<Session | null> {
  const raw = request.cookies.get(COOKIE_NAME)?.value;
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  const secret = process.env.APP_PASSWORD || "change-me";
  const expected = await hmacHex(secret, payload);
  if (!safeEqual(signature, expected)) return null;

  try {
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const normalized = padded.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalized);
    const data = JSON.parse(decoded) as Session;
    if (data.role !== "admin" && data.role !== "agent") return null;
    const age = Date.now() - Number(data.ts);
    if (!Number.isFinite(age) || age >= 60 * 60 * 12 * 1000) return null;
    if (data.role === "agent" && !data.name) return null;
    return {
      role: data.role as SessionRole,
      name: String(data.name || ""),
      ts: Number(data.ts),
    };
  } catch {
    return null;
  }
}

const PUBLIC_EXACT = new Set([
  "/agent/login",
  "/admin/login",
  "/api/login",
  "/api/agents",
  "/login",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    PUBLIC_EXACT.has(pathname)
  ) {
    if (pathname === "/login") {
      const url = request.nextUrl.clone();
      url.pathname = "/agent/login";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  const session = await readSession(request);

  // Root → agent or admin home
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = session?.role === "admin" ? "/admin" : "/agent";
    if (!session) url.pathname = "/agent/login";
    return NextResponse.redirect(url);
  }

  const isAdminArea =
    (pathname === "/admin" || pathname.startsWith("/admin/") || pathname.startsWith("/api/admin")) &&
    pathname !== "/admin/login";
  const needsAuth =
    pathname.startsWith("/agent") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/");

  if (needsAuth && !session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = isAdminArea ? "/admin/login" : "/agent/login";
    return NextResponse.redirect(url);
  }

  // Agents cannot access admin at all
  if (isAdminArea && session && session.role !== "admin") {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
    }
    const url = request.nextUrl.clone();
    url.pathname = "/agent";
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
