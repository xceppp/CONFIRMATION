import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "confirmation_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // 12 heures

function getSecret(): string {
  return process.env.APP_PASSWORD || "change-me";
}

function sign(value: string): string {
  return createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function verifyPassword(password: string): boolean {
  const expected = process.env.APP_PASSWORD || "";
  if (!expected) return false;
  try {
    const a = Buffer.from(password);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export async function createSessionCookie(): Promise<void> {
  const token = `ok.${Date.now()}`;
  const signature = sign(token);
  const jar = await cookies();
  jar.set(COOKIE_NAME, `${token}.${signature}`, {
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

export async function isAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  const raw = jar.get(COOKIE_NAME)?.value;
  if (!raw) return false;
  const parts = raw.split(".");
  if (parts.length !== 3) return false;
  const [flag, ts, signature] = parts;
  const token = `${flag}.${ts}`;
  const expected = sign(token);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    if (!timingSafeEqual(a, b)) return false;
  } catch {
    return false;
  }
  const age = Date.now() - Number(ts);
  return Number.isFinite(age) && age < MAX_AGE_SECONDS * 1000;
}
