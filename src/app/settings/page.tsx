import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { publicVapidKey, pushConfigured } from "@/lib/push";
import { SettingsView } from "@/components/app/SettingsView";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const settings = await getSettings(user.id);
  const counts: Record<string, number> = {};
  for (const row of await prisma.task.groupBy({ by: ["bucket"], where: { userId: user.id, status: "open" }, _count: true })) {
    counts[row.bucket] = row._count;
  }
  const devices = await prisma.pushDevice.count({ where: { userId: user.id } });

  return (
    <SettingsView
      counts={counts}
      initial={{
        rollingWindowDays: settings.rollingWindowDays,
        digestTime: settings.digestTime,
        digestEnabled: settings.digestEnabled,
        urgentPushEnabled: settings.urgentPushEnabled,
        remindersEnabled: settings.remindersEnabled,
        quietHoursEnabled: settings.quietHoursEnabled,
        quietHoursStart: settings.quietHoursStart,
        quietHoursEnd: settings.quietHoursEnd,
        linkPreference: settings.linkPreference,
        showDrafts: settings.showDrafts,
        requestDrafts: settings.requestDrafts,
        showReasons: settings.showReasons,
        autoArchiveDays: settings.autoArchiveDays,
        theme: settings.theme,
        defaultView: settings.defaultView,
        timezone: user.timezone,
      }}
      user={{ name: user.name, email: user.email }}
      push={{ configured: pushConfigured(), publicKey: publicVapidKey(), devices }}
    />
  );
}
