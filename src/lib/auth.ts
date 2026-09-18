import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";
import {
  COOKIE_NAME,
  type Session,
  type SessionRole,
} from "./session-types";
import { findAdminAccount } from "./admins";

export { COOKIE_NAME, type Session, type SessionRole };

const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 heures

function getSecret(): string {
  return process.env.APP_PASSWORD || "change-me";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Legacy: mot de passe APP_PASSWORD seul (compte Admin). */
export function verifyAdminPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return false;
  return safeEqual(password, expected);
}

/**
 * Connexion admin par nom + mot de passe.
 * - amine / localdev, saida / saida
 * - ou nom « Admin » (ou vide) + APP_PASSWORD
 * Retourne le nom canonique ou null.
 */
export function verifyAdminCredentials(
  name: string,
  password: string,
): string | null {
  const named = findAdminAccount(name, password);
  if (named) {
    return named.name.charAt(0).toUpperCase() + named.name.slice(1);
  }

  const n = name.trim().toLowerCase();
  if ((!n || n === "admin") && verifyAdminPassword(password)) {
    return "Admin";
  }
  return null;
}

function encodePayload(session: Omit<Session, "ts"> & { ts?: number }): string {
  const body = {
    role: session.role,
    name: session.name || "",
    ts: session.ts ?? Date.now(),
  };
  return Buffer.from(JSON.stringify(body), "utf8").toString("base64url");
}

function decodePayload(raw: string): Session | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const data = JSON.parse(json) as Session;
    if (data.role !== "admin" && data.role !== "agent") return null;
    if (typeof data.ts !== "number") return null;
    if (data.role === "agent" && !data.name) return null;
    return {
      role: data.role,
      name: String(data.name || ""),
      ts: data.ts,
    };
  } catch {
    return null;
  }
}

export function parseSessionCookie(
  raw: string | undefined | null,
): Session | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return null;

  const session = decodePayload(payload);
  if (!session) return null;
  const age = Date.now() - session.ts;
  if (!Number.isFinite(age) || age >= MAX_AGE_SECONDS * 1000) return null;
  return session;
}

export async function createSessionCookie(session: {
  role: SessionRole;
  name?: string;
}): Promise<void> {
  const payload = encodePayload({
    role: session.role,
    name: session.name || "",
  });
  const jar = await cookies();
  jar.set(COOKIE_NAME, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  return parseSessionCookie(jar.get(COOKIE_NAME)?.value);
}

export async function isAuthenticated(): Promise<boolean> {
  return Boolean(await getSession());
}

export async function requireAdmin(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== "admin") return null;
  return session;
}

export async function requireAgent(): Promise<Session | null> {
  const session = await getSession();
  if (!session || session.role !== "agent") return null;
  return session;
}
