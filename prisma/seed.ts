/**
 * Seed a working list so the app can be looked at before an assistant is wired
 * up. Everything here is shaped exactly the way sync_tasks writes it, so what
 * you see is what a real run produces.
 *
 *   npm run db:seed
 */
import { loadEnv } from "../scripts/load-env";

loadEnv();

import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/crypto";
import { syncTasks } from "../src/lib/sync";
import { syncInput, type TaskInputRaw } from "../src/lib/validation";

const prisma = new PrismaClient();

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600e3).toISOString();
const daysFromNow = (d: number) => new Date(Date.now() + d * 864e5).toISOString();

const TASKS: TaskInputRaw[] = [
  {
    title: "Get back to Bob on the proposal",
    description:
      "Bob wants the full proposal deck sent over. He asked on Tuesday and is waiting on it before their board meeting Friday.",
    bucket: "urgent_important",
    reason: "A client is blocked on you and there is a dated meeting behind it.",
    confidence: 0.94,
    dueAt: daysFromNow(1),
    estimateMinutes: 25,
    tags: ["client", "proposal"],
    source: {
      provider: "outlook",
      type: "email",
      externalId: "AAMkAGI2TG93AAA=-bob-proposal-001",
      account: "jamie@company.com",
      from: "Bob Whitaker <bob@acmeindustrial.com>",
      subject: "Re: Q3 partnership — ready for the full deck",
      snippet: "Looks great so far. Send the full proposal over and I'll walk the board through it Friday.",
      receivedAt: hoursAgo(26),
    },
    draft: {
      provider: "outlook",
      kind: "reply",
      subject: "Re: Q3 partnership — ready for the full deck",
      body:
        "Hi Bob,\n\nGreat news — the full proposal is attached. It covers the phased rollout we discussed, the pricing tiers, and the support model.\n\nHappy to join Friday's board call if a live walkthrough would help.\n\nBest,\nJamie",
      externalId: "AAMkAGI2TG93AAA=-draft-bob-001",
    },
  },
  {
    title: "Confirm Thursday's site visit with Priya",
    description:
      "Priya asked twice whether 10am Thursday still works. The calendar hold is there but she has had no reply.",
    bucket: "urgent_important",
    reason: "Someone is waiting on a yes or no and has now asked twice.",
    confidence: 0.91,
    dueAt: daysFromNow(0.4),
    estimateMinutes: 3,
    tags: ["scheduling"],
    source: {
      provider: "teams",
      type: "message",
      externalId: "19:meeting_NzJk@thread.tacv2",
      from: "Priya Raman",
      subject: "Thursday site visit",
      snippet: "Sorry to chase — is 10am Thursday still good for you?",
      receivedAt: hoursAgo(19),
      url: "https://teams.microsoft.com/l/message/19:meeting_NzJk@thread.tacv2/1737000000000?tenantId=demo",
    },
  },
  {
    title: "Send the signed NDA back to Legal",
    description: "Legal sent the countersigned NDA on Monday and needs your signature page returned before the kickoff.",
    bucket: "urgent_important",
    reason: "It blocks the kickoff and takes two minutes.",
    confidence: 0.88,
    dueAt: daysFromNow(2),
    estimateMinutes: 5,
    tags: ["legal"],
    source: {
      provider: "gmail",
      type: "email",
      messageId: "<CAF8xQ1s9NDA-legal-2024@mail.gmail.com>",
      account: "jamie@company.com",
      from: "Dana Okoro <dana@company.com>",
      subject: "NDA — signature page needed",
      snippet: "Attached is the countersigned copy. Just need your page back and we're set.",
      receivedAt: hoursAgo(52),
    },
  },
  {
    title: "Approve the invoice from Northwind",
    description: "Sitting in approvals since Friday. It is a routine renewal, but the finance close is on the 30th.",
    bucket: "urgent_not_priority",
    reason: "Dated, but routine and not yours to think hard about.",
    confidence: 0.79,
    dueAt: daysFromNow(3),
    estimateMinutes: 2,
    tags: ["finance"],
    source: {
      provider: "outlook",
      type: "email",
      externalId: "AAMkAGI2TG93AAA=-invoice-northwind",
      from: "accounts@northwind.io",
      subject: "Invoice NW-4482 awaiting approval",
      snippet: "This is an automated reminder that invoice NW-4482 is awaiting your approval.",
      receivedAt: hoursAgo(74),
    },
  },
  {
    title: "Reply to the conference speaker invite",
    description: "SaaSNorth want a yes or no on the October keynote by the end of the week.",
    bucket: "urgent_not_priority",
    reason: "Has a deadline, but nothing downstream depends on it.",
    confidence: 0.72,
    dueAt: daysFromNow(4),
    estimateMinutes: 8,
    tags: ["speaking"],
    source: {
      provider: "gmail",
      type: "email",
      messageId: "<saasnorth-keynote-9931@mail.gmail.com>",
      from: "Marta Klein <programme@saasnorth.co>",
      subject: "Keynote invitation — SaaSNorth, October 14",
      snippet: "We would love to have you open day two. Could you let us know by Friday?",
      receivedAt: hoursAgo(40),
    },
    draft: {
      provider: "gmail",
      kind: "reply",
      subject: "Re: Keynote invitation — SaaSNorth, October 14",
      body:
        "Hi Marta,\n\nThanks for thinking of me — I'd be glad to open day two.\n\nCould you send the format, the length you have in mind, and the AV setup? I'll get a title and abstract over next week.\n\nBest,\nJamie",
      externalId: "r-9931-draft",
    },
  },
  {
    title: "Book the offsite venue deposit",
    description: "The hold on the Riverside room expires in a week. Deposit is £400 and the card is on file.",
    bucket: "urgent_not_priority",
    reason: "Small, dated, and it disappears if left.",
    confidence: 0.7,
    dueAt: daysFromNow(6),
    estimateMinutes: 10,
    tags: ["offsite"],
    source: {
      provider: "outlook_calendar",
      type: "event",
      externalId: "AAMkAGI2-offsite-hold-01",
      subject: "HOLD — Riverside room, team offsite",
      receivedAt: hoursAgo(120),
    },
  },
  {
    title: "Hand the Q3 metrics pull to Sam",
    description:
      "Finance want the Q3 numbers by Friday. Sam already owns the dashboard and can produce this faster than you can.",
    bucket: "delegate",
    delegateTo: "Sam Whitfield",
    reason: "Someone else owns the source and can do it in a fraction of the time.",
    confidence: 0.86,
    dueAt: daysFromNow(3),
    estimateMinutes: 5,
    tags: ["reporting"],
    source: {
      provider: "outlook",
      type: "email",
      externalId: "AAMkAGI2TG93AAA=-q3-metrics",
      from: "Finance Team <finance@company.com>",
      subject: "Q3 metrics needed by Friday",
      snippet: "Could we get the Q3 pull before the board pack goes out Friday afternoon?",
      receivedAt: hoursAgo(30),
    },
  },
  {
    title: "Pass the vendor security questionnaire to IT",
    description: "Sixty questions on infrastructure. IT answers this exact form every quarter.",
    bucket: "delegate",
    delegateTo: "Ravi (IT)",
    reason: "It is entirely IT's domain and they have the answers on file.",
    confidence: 0.83,
    estimateMinutes: 4,
    tags: ["security", "vendor"],
    source: {
      provider: "gmail",
      type: "email",
      messageId: "<vendor-sec-q-7781@mail.gmail.com>",
      from: "compliance@vendorstack.com",
      subject: "Security questionnaire — response requested",
      snippet: "Please complete the attached questionnaire within 10 business days.",
      receivedAt: hoursAgo(64),
    },
  },
  {
    title: "Newsletter: “12 AI trends for 2026”",
    description: "Marketing newsletter. Nothing is asked of you.",
    bucket: "delete",
    reason: "No action, no deadline, no one waiting.",
    confidence: 0.96,
    tags: ["newsletter"],
    source: {
      provider: "gmail",
      type: "email",
      messageId: "<trends-2026-blast@mail.gmail.com>",
      from: "The Signal <hello@thesignal.co>",
      subject: "12 AI trends for 2026",
      snippet: "Our biggest issue yet — everything shaping the year ahead.",
      receivedAt: hoursAgo(14),
    },
  },
  {
    title: "“Reminder: all-hands recording available”",
    description: "Automated notice. You were in the room.",
    bucket: "delete",
    reason: "Notification only, and you already attended.",
    confidence: 0.98,
    tags: ["automated"],
    source: {
      provider: "teams",
      type: "message",
      externalId: "19:allhands-recording@thread.tacv2",
      from: "Microsoft Teams",
      subject: "Recording available: Company All-Hands",
      receivedAt: hoursAgo(9),
      url: "https://teams.microsoft.com/l/message/19:allhands-recording@thread.tacv2/1737000009000",
    },
  },
  {
    title: "Calendar invite you already accepted",
    description: "Duplicate invite for the design review you are already going to.",
    bucket: "delete",
    reason: "Already on your calendar — this is a duplicate.",
    confidence: 0.93,
    source: {
      provider: "outlook_calendar",
      type: "event",
      externalId: "AAMkAGI2-design-review-dupe",
      subject: "Design review (duplicate invite)",
      receivedAt: hoursAgo(6),
    },
  },
];

async function main() {
  const email = (process.env.SEED_EMAIL ?? "you@example.com").toLowerCase();
  const password = process.env.SEED_PASSWORD ?? "todo1234";

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: process.env.SEED_NAME ?? "Jamie",
      passwordHash: await hashPassword(password),
      timezone: process.env.SEED_TIMEZONE ?? "America/New_York",
      settings: { create: {} },
    },
    update: {},
  });
  await prisma.settings.upsert({ where: { userId: user.id }, create: { userId: user.id }, update: {} });

  // Run the seed through the very schema the MCP tool uses, so a broken sample
  // fails here rather than looking fine and behaving differently in production.
  const payload = syncInput.parse({
    tasks: TASKS,
    replace: "window",
    client: "Claude",
    summary: "Seeded sample sweep.",
  });
  const result = await syncTasks(user.id, payload, { source: "manual", client: "Claude" });

  console.log(`Seeded ${email} — ${result.message}`);
  console.log(`Sign in with:  ${email}  /  ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
