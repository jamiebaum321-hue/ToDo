import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ConnectView } from "@/components/app/ConnectView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connect your assistant" };

export default async function ConnectPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id, revokedAt: null },
    select: { id: true, name: true, prefix: true, createdAt: true, lastUsedAt: true },
    orderBy: { createdAt: "desc" },
  });

  const counts: Record<string, number> = {};
  for (const row of await prisma.task.groupBy({ by: ["bucket"], where: { userId: user.id, status: "open" }, _count: true })) {
    counts[row.bucket] = row._count;
  }

  return (
    <ConnectView
      counts={counts}
      tokens={tokens.map((t) => ({
        ...t,
        createdAt: t.createdAt.toISOString(),
        lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
      }))}
    />
  );
}
