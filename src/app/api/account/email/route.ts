import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/crypto";
import { getSessionUser } from "@/lib/auth";
import { badRequest, json, readJson, unauthorized } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { consumeToken, sendChangeEmailEmail } from "@/lib/verification";
import { mailConfigured } from "@/lib/mail";

export const runtime = "nodejs";

const requestSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1) });

/** Step one: prove the password, then send a link to the *new* address. */
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) return unauthorized();

  const limited = await rateLimit("emailSend", clientIp(req));
  if (!limited.ok) {
    return json({ error: "Too many requests. Try again later." }, { status: 429, headers: rateLimitHeaders(limited) });
  }

  const parsed = requestSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("Enter the new address and your password.");
  if (!mailConfigured()) return badRequest("This server cannot send email, so the address cannot be changed.");

  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return json({ error: "That password is not right." }, { status: 401 });
  }

  const email = parsed.data.email.toLowerCase().trim();
  if (email === user.email) return badRequest("That is already your address.");

  // Silent when taken: confirming which addresses exist is exactly what an
  // attacker with a valid session would use this endpoint for.
  if (!(await prisma.user.findUnique({ where: { email } }))) {
    await sendChangeEmailEmail(user, email).catch((err) => console.error("[email-change] failed:", err));
  }

  return json({ ok: true, pending: true });
}

const confirmSchema = z.object({ token: z.string().min(10).max(200) });

/** Step two: the link lands here and the address moves. */
export async function PATCH(req: Request) {
  const limited = await rateLimit("tokenCheck", clientIp(req));
  if (!limited.ok) {
    return json({ error: "Too many attempts." }, { status: 429, headers: rateLimitHeaders(limited) });
  }

  const parsed = confirmSchema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("That link is not valid.");

  const result = await consumeToken(parsed.data.token, "change_email");
  if (!result.ok || !result.payload) {
    return json({ error: "That link is not valid or has expired." }, { status: 400 });
  }

  // Re-checked at redemption: the address may have been claimed in between.
  if (await prisma.user.findUnique({ where: { email: result.payload } })) {
    return json({ error: "That address is no longer available." }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: result.userId },
    data: { email: result.payload, emailVerified: new Date() },
  });

  return json({ ok: true, email: result.payload });
}
