import { z } from "zod";
import { withActor, json, badRequest, readJson } from "@/lib/api";
import { prisma } from "@/lib/db";
import { listTeam, normalizeFunction, normalizeLevel } from "@/lib/team";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const memberSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  function: z.string().trim().max(40).optional(),
  level: z.string().trim().max(40).optional(),
  note: z.string().trim().max(300).optional().or(z.literal("")),
});

export async function GET(req: Request) {
  return withActor(req, async (actor) => json({ team: await listTeam(actor.user.id) }));
}

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = memberSchema.safeParse(await readJson(req));
    if (!parsed.success) return badRequest("Give them a name, and a valid address if you add one.");

    const { name, email, note } = parsed.data;
    const data = {
      name,
      email: email || null,
      note: note || null,
      function: normalizeFunction(parsed.data.function),
      level: normalizeLevel(parsed.data.level),
    };

    // Adding someone already listed reads as an edit, not an error.
    await prisma.teamMember.upsert({
      where: { userId_name: { userId: actor.user.id, name } },
      create: { userId: actor.user.id, ...data },
      update: data,
    });

    return json({ team: await listTeam(actor.user.id) }, { status: 201 });
  });
}

export async function DELETE(req: Request) {
  return withActor(req, async (actor) => {
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return badRequest("Which person?");

    // Scoped to the owner, so an id from another account deletes nothing.
    await prisma.teamMember.deleteMany({ where: { id, userId: actor.user.id } });
    return json({ team: await listTeam(actor.user.id) });
  });
}
