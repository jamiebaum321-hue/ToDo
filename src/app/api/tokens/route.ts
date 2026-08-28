import { z } from "zod";
import { prisma } from "@/lib/db";
import { withActor, json, badRequest, readJson } from "@/lib/api";
import { issueApiToken } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  return withActor(req, async (actor) => {
    const tokens = await prisma.apiToken.findMany({
      where: { userId: actor.user.id, revokedAt: null },
      select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true, expiresAt: true },
      orderBy: { createdAt: "desc" },
    });
    return json({ tokens });
  });
}

const schema = z.object({
  name: z.string().trim().min(1).max(80).default("MCP connection"),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
});

export async function POST(req: Request) {
  return withActor(req, async (actor) => {
    const parsed = schema.safeParse((await readJson(req)) ?? {});
    if (!parsed.success) return badRequest("Give the connection a name.");

    const { record, token } = await issueApiToken(actor.user.id, parsed.data.name, parsed.data.expiresInDays);
    // The only time the plaintext leaves the server. It is never stored.
    return json(
      {
        token,
        record: { id: record.id, name: record.name, prefix: record.prefix, createdAt: record.createdAt },
      },
      { status: 201 },
    );
  });
}
