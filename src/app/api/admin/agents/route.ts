import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  addAgent,
  deleteAgent,
  listAgentsForAdmin,
  updateAgent,
} from "@/lib/sheets";

export async function GET() {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }
  try {
    const agents = await listAgentsForAdmin();
    return NextResponse.json({ agents });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();
  const password = String(body?.password || "").trim();

  try {
    const agent = await addAgent(name, password);
    return NextResponse.json({
      ok: true,
      agent: { Nom: agent.Nom },
      message: `Agent « ${agent.Nom} » ajouté.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const oldName = String(body?.oldName || body?.name || "").trim();
  const newName = String(body?.newName || body?.name || "").trim();
  const password = String(body?.password || "").trim();

  try {
    const agent = await updateAgent(oldName, newName, password);
    return NextResponse.json({
      ok: true,
      agent: { Nom: agent.Nom },
      message: `Agent « ${agent.Nom} » mis à jour.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!(await requireAdmin())) {
    return NextResponse.json({ error: "Accès admin refusé" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const name = String(body?.name || "").trim();

  try {
    await deleteAgent(name);
    return NextResponse.json({
      ok: true,
      message: `Agent « ${name} » supprimé.`,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Erreur serveur";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
