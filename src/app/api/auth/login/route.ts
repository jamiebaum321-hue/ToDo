import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { ensureSettings } from "@/lib/settings";
import { badRequest, json, readJson } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email(), password: z.string().min(1) });

export async function POST(req: Request) {
  const body = await readJson(req);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return badRequest("Enter an email address and password.");

  const user = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase().trim() } });
  // Same response either way, so this cannot be used to probe for accounts.
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return json({ error: "That email and password do not match." }, { status: 401 });
  }

  await ensureSettings(user.id);
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
