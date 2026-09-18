import { NextResponse } from "next/server";
import { createSessionCookie, verifyAdminCredentials } from "@/lib/auth";
import { verifyAgentCredentials } from "@/lib/sheets";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const role = String(body?.role || "").trim();
  const password = String(body?.password || "");

  if (!process.env.APP_PASSWORD) {
    return NextResponse.json(
      { error: "APP_PASSWORD non configuré sur le serveur." },
      { status: 500 },
    );
  }

  try {
    if (role === "admin") {
      const name = String(body?.name || "").trim();
      const adminName = verifyAdminCredentials(name, password);
      if (!adminName) {
        return NextResponse.json(
          { error: "Nom ou mot de passe admin incorrect." },
          { status: 401 },
        );
      }
      await createSessionCookie({ role: "admin", name: adminName });
      return NextResponse.json({
        ok: true,
        role: "admin",
        name: adminName,
      });
    }

    if (role === "agent") {
      const name = String(body?.name || "").trim();
      if (!name || !password) {
        return NextResponse.json(
          { error: "Nom et mot de passe requis." },
          { status: 400 },
        );
      }
      const agent = await verifyAgentCredentials(name, password);
      if (!agent) {
        return NextResponse.json(
          { error: "Nom ou mot de passe incorrect." },
          { status: 401 },
        );
      }
      await createSessionCookie({ role: "agent", name: agent.Nom });
      return NextResponse.json({ ok: true, role: "agent", name: agent.Nom });
    }

    return NextResponse.json({ error: "Rôle invalide." }, { status: 400 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
