import { z } from "zod";
import { prisma } from "@/lib/db";
import { badRequest, json, readJson } from "@/lib/api";
import { clientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { sendVerificationEmail } from "@/lib/verification";

export const runtime = "nodejs";

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const parsed = schema.safeParse(await readJson(req));
  if (!parsed.success) return badRequest("Enter your email address.");
  const email = parsed.data.email.toLowerCase().trim();

  // Limited by address and by connection: each of these sends mail to a third
  // party, so an unlimited endpoint is a spam cannon pointed at strangers.
  const [byEmail, byIp] = await Promise.all([rateLimit("emailSend", email), rateLimit("emailSend", clientIp(req))]);
  const limited = !byEmail.ok ? byEmail : !byIp.ok ? byIp : null;
  if (limited) {
    return json(
      { error: "We have sent that recently. Check your inbox, including spam." },
      { status: 429, headers: rateLimitHeaders(limited) },
    );
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (user && !user.emailVerified) {
    await sendVerificationEmail(user).catch((err) => console.error("[resend] failed:", err));
  }

  // Always the same answer — an unverified address is still not ours to confirm.
  return json({ ok: true });
}
