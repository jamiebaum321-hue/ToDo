import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/crypto";
import { createSession } from "@/lib/auth";
import { ensureSettings } from "@/lib/settings";
import { isValidTimeZone } from "@/lib/time";
import { badRequest, json, readJson } from "@/lib/api";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Use at least 8 characters."),
  name: z.string().trim().max(80).optional(),
  timezone: z.string().trim().max(64).optional(),
});

/**
 * Open only until the first account exists, then closed. This is a personal
 * app: you set it up once, and after that nobody else can claim your instance.
 * Set ALLOW_SIGNUPS=true to keep it open for a household or a small team.
 */
export async function POST(req: Request) {
  const existing = await prisma.user.count();
  if (existing > 0 && process.env.ALLOW_SIGNUPS !== "true") {
    return json({ error: "This ToDo is already set up. Sign in instead." }, { status: 403 });
  }

  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Check the form and try again.");

  const email = parsed.data.email.toLowerCase().trim();
  if (await prisma.user.findUnique({ where: { email } })) {
    return badRequest("That email is already registered.");
  }

  const timezone =
    parsed.data.timezone && isValidTimeZone(parsed.data.timezone) ? parsed.data.timezone : "America/New_York";

  const user = await prisma.user.create({
    data: {
      email,
      name: parsed.data.name || null,
      passwordHash: await hashPassword(parsed.data.password),
      timezone,
    },
  });

  await ensureSettings(user.id);
  await createSession(user.id, req.headers.get("user-agent"));
  return json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
}
