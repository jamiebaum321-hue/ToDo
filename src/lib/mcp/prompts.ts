import { BUCKETS } from "../buckets";

const BUCKET_GUIDE = BUCKETS.map((b) => `- **${b.label}** (\`${b.key}\`) — ${b.blurb}`).join("\n");

/**
 * The instruction set that makes the daily run behave. This is the product:
 * everything else is plumbing around getting these rules followed every morning.
 */
export function dailyTriagePrompt(args: { windowDays?: string; focus?: string } = {}) {
  const windowDays = args.windowDays ?? "14";
  const focus = args.focus?.trim();

  return `You are running the morning triage for a ToDo list. Work through this in order and do not skip step 1.

**1. Read the context first.**
Call \`get_run_context\`. It gives you the user's local time, the rolling window, the tasks already on the list, and \`alreadyHandled\` — the items the user has personally cleared in the app.

\`alreadyHandled\` is the rule that matters most. If a source key is in that list, the user has dealt with it. Do not recreate it, do not reword it, do not file it under a different bucket. An email they never replied to may look unanswered from the outside — they may have called instead, or handled it in a meeting, or decided it did not need a reply. They told you it is done by clearing it. Believe them.

**2. Sweep every connector for the last and next ${windowDays} days.**
Go through the mail, calendar, chat and meeting connectors you have. You are looking for anything that implies the user owes someone an action:
- Emails asking for something, waiting on a reply, or with a deadline in them
- Meetings that need preparation, an agenda, or a follow-up
- Chat messages that ended with a question to the user
- Commitments the user made in their own sent mail ("I'll send that over Thursday")
- Deadlines mentioned anywhere, including in attachments and calendar descriptions

Capture the low-hanging fruit especially — the two-minute replies that keep slipping. Those are the whole point.

**3. Sort every item into exactly one bucket.**
${BUCKET_GUIDE}

Be honest about the difference between urgent and important. Something with a deadline that nobody actually cares about is \`urgent_not_priority\`. Something only the user can do that moves real work forward is \`urgent_important\`, deadline or not. If someone else could do it, it is \`delegate\` — say who. If it needs nothing, it is \`delete\` — the user will confirm and it disappears.

**4. Write each task so it can be done without thinking.**
- **title** — the action, in the user's voice: "Get back to Bob on the proposal". Not "Email from Bob".
- **description** — what happened and what finishing looks like: "Bob wants the full proposal deck sent over. He asked Tuesday and is waiting on it before their board meeting Friday."
- **reason** — one line on why it sits in this bucket.
- **source** — always fill in \`provider\`, \`externalId\` (or \`messageId\`), \`from\`, \`subject\` and the connector's own \`url\` if it gave you one. This is what puts an "Open in Outlook" button on the card that lands on the exact message. A task without a source link is a task the user has to go hunting for.
- **dueAt** — only when there is a real deadline.

**5. Draft the replies you can.**
Where a task is "reply to X" and the answer is straightforward, write the reply, save it to the user's drafts, and pass the draft's id and URL in the \`draft\` field. The task then shows a "See your draft" button — the user reads it, sends it, done. Do not send anything yourself.

**6. Send it in one call.**
One \`sync_tasks\` call with the complete list and \`replace: "window"\`. Anything you leave out gets cleared, which is how the list stays current instead of growing forever.

**7. Read what comes back.**
The response includes \`skippedTasks\` — anything the app refused because the user had already handled it. That is your feedback signal. Note those source keys and do not raise them again.${
    focus ? `\n\n**Extra focus for this run:** ${focus}` : ""
  }

Keep the whole list to what genuinely needs the user. Twelve real tasks beat forty they will scroll past.`;
}

export const PROMPTS = [
  {
    name: "daily_triage",
    title: "Run the morning triage",
    description:
      "The full scheduled run: sweep every connector over the rolling window, sort into the four buckets, draft the easy replies, and replace the list. Respects everything the user has already cleared.",
    arguments: [
      { name: "windowDays", description: "How many days back and forward to cover. Defaults to 14.", required: false },
      { name: "focus", description: "Anything to weight this run towards, e.g. 'the Henderson deal'.", required: false },
    ],
    build: dailyTriagePrompt,
  },
  {
    name: "quick_capture",
    title: "Capture what I just said",
    description: "Turn something the user mentions in conversation into a single well-formed task, with a source link if there is one.",
    arguments: [{ name: "note", description: "What the user said.", required: true }],
    build: (args: { note?: string }) =>
      `Turn this into one task on the user's ToDo list:

"${args.note ?? ""}"

Work out which of the four buckets it belongs in, write a title in the user's voice ("Get back to Bob on the proposal", not "Bob's email"), and add a description covering what finishing looks like. If it refers to something in their mail, calendar or chat, find it and fill in the \`source\` field so the task links straight back to it. Then call \`create_task\` once.`,
  },
  {
    name: "end_of_day",
    title: "Close out the day",
    description: "Review what was cleared today, tidy anything stale, and tell the user what is waiting tomorrow.",
    arguments: [],
    build: () =>
      `Close out the user's day:

1. Call \`get_stats\` for what was cleared and what is still open.
2. Call \`list_tasks\` with status "open" and read what is left.
3. Check whether anything still open was actually handled elsewhere today — a reply they sent, a meeting that got booked. If so, call \`complete_task\` with a short note saying how you know.
4. Anything in \`delete\` the user has not touched in a few days, mention it so they can confirm it goes.
5. Finish with a short plain summary: what got done, what is carrying over, and the one thing that matters most tomorrow.

No push notification unless they ask for one.`,
  },
] as const;

export function listPromptsPayload() {
  return {
    prompts: PROMPTS.map((p) => ({
      name: p.name,
      title: p.title,
      description: p.description,
      arguments: p.arguments,
    })),
  };
}

export function getPromptPayload(name: string, args: Record<string, string> = {}) {
  const prompt = PROMPTS.find((p) => p.name === name);
  if (!prompt) return null;
  return {
    description: prompt.description,
    messages: [
      {
        role: "user" as const,
        content: { type: "text" as const, text: (prompt.build as (a: any) => string)(args) },
      },
    ],
  };
}
