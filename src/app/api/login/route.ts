import { NextResponse } from "next/server";
import { createSessionCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const password = String(body?.password || "");

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: "APP_PASSWORD non configuré sur le serveur." },
      { status: 500 },
    );
  }

  if (!verifyPassword(password)) {
    return NextResponse.json(
      { error: "Mot de passe incorrect." },
      { status: 401 },
    );
  }

  await createSessionCookie();
  return NextResponse.json({ ok: true });
}
