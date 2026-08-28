import type { Settings } from "@prisma/client";
import { prisma } from "./db";

/** Settings rows are created lazily so a user never hits a null. */
export async function ensureSettings(userId: string): Promise<Settings> {
  return prisma.settings.upsert({ where: { userId }, create: { userId }, update: {} });
}

export async function getSettings(userId: string): Promise<Settings> {
  return (await prisma.settings.findUnique({ where: { userId } })) ?? ensureSettings(userId);
}
