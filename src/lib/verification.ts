import { prisma } from "./db";
import { randomToken, sha256 } from "./crypto";
import { appUrl, changeEmailEmail, passwordResetEmail, sendMail, verificationEmail } from "./mail";

/**
 * One-time email links.
 *
 * Only the hash is stored, so the database never holds anything that could be
 * replayed as a sign-in. Issuing a new token of a purpose retires the older
 * ones, so the most recent email in someone's inbox is always the one that
 * works — which is what people expect after clicking "resend".
 */

export const PURPOSES = ["verify_email", "password_reset", "change_email"] as const;
export type Purpose = (typeof PURPOSES)[number];

const TTL_SECONDS: Record<Purpose, number> = {
  verify_email: 24 * 3600,
  // Short: a reset link is a live credential sitting in a mailbox.
  password_reset: 3600,
  change_email: 24 * 3600,
};

export async function issueToken(userId: string, purpose: Purpose, payload?: string) {
  // Retire outstanding tokens of the same purpose.
  await prisma.verificationToken.updateMany({
    where: { userId, purpose, usedAt: null },
    data: { usedAt: new Date() },
  });

  const token = randomToken(32);
  await prisma.verificationToken.create({
    data: {
      userId,
      purpose,
      tokenHash: sha256(token),
      payload: payload ?? null,
      expiresAt: new Date(Date.now() + TTL_SECONDS[purpose] * 1000),
    },
  });
  return token;
}

export type ConsumeResult =
  | { ok: true; userId: string; payload: string | null }
  | { ok: false; reason: "invalid" | "expired" | "used" };

/**
 * Check and burn a token in one step. Marking it used inside the same
 * transaction as the lookup means a link cannot be redeemed twice by two
 * requests arriving together.
 */
export async function consumeToken(token: string, purpose: Purpose): Promise<ConsumeResult> {
  const record = await prisma.verificationToken.findUnique({ where: { tokenHash: sha256(token) } });

  if (!record || record.purpose !== purpose) return { ok: false, reason: "invalid" };
  if (record.usedAt) return { ok: false, reason: "used" };
  if (record.expiresAt < new Date()) return { ok: false, reason: "expired" };

  const burned = await prisma.verificationToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  // Someone else got there first.
  if (burned.count === 0) return { ok: false, reason: "used" };

  return { ok: true, userId: record.userId, payload: record.payload };
}

export async function pruneVerificationTokens(): Promise<number> {
  const { count } = await prisma.verificationToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 7 * 864e5) } },
  });
  return count;
}

// ---------------------------------------------------------------------------
// Sending
// ---------------------------------------------------------------------------

export async function sendVerificationEmail(user: { id: string; email: string; name: string | null }) {
  const token = await issueToken(user.id, "verify_email");
  const message = verificationEmail(`${appUrl()}/verify?token=${encodeURIComponent(token)}`, user.name);
  return sendMail({ ...message, to: user.email });
}

export async function sendPasswordResetEmail(user: { id: string; email: string; name: string | null }) {
  const token = await issueToken(user.id, "password_reset");
  const message = passwordResetEmail(`${appUrl()}/reset?token=${encodeURIComponent(token)}`, user.name);
  return sendMail({ ...message, to: user.email });
}

export async function sendChangeEmailEmail(user: { id: string; name: string | null }, newAddress: string) {
  const token = await issueToken(user.id, "change_email", newAddress);
  const message = changeEmailEmail(`${appUrl()}/verify-email-change?token=${encodeURIComponent(token)}`, newAddress);
  // Sent to the *new* address — proving control of it is the point.
  return sendMail({ ...message, to: newAddress });
}
