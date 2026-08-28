import type { Metadata } from "next";
import { Callout, H2, LegalPage, P, UL } from "@/components/app/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What ToDo stores, why, and how to get rid of it.",
};

const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR_NAME || "the operator of this ToDo instance";
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "the address on the sign-in page";
const UPDATED = "28 August 2026";

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated={UPDATED}>
      <Callout>
        <strong>This is a template, not legal advice.</strong> It describes accurately what this software does, but
        {" "}{OPERATOR} should have it reviewed before relying on it, and must fill in the operator name, contact
        address and hosting locations for the specific deployment.
      </Callout>

      <P>
        ToDo is a task list that your own AI assistant fills in. Understanding the privacy of it turns on one fact:
        <strong> ToDo never connects to your email, calendar or chat.</strong> It has no credentials for them and
        cannot read them. Your Claude or ChatGPT subscription reads those through connectors you have already
        authorised, decides what needs doing, and sends the result here.
      </P>

      <H2>What is stored</H2>
      <P>Because your assistant writes your list, the list contains whatever it chose to put there. In practice:</P>
      <UL>
        <li><strong>Tasks</strong> — the title and description your assistant wrote, which bucket it chose, its reason, any due date, and who a task should be delegated to.</li>
        <li><strong>Source details</strong> — where a task came from: the provider, the message or event identifier, the sender, the subject line, and a short quoted snippet. This is a derived copy of parts of your mail and calendar, and it is the most sensitive thing here.</li>
        <li><strong>Links</strong> — the URLs that open the original item in Outlook, Gmail, Teams, Zoom or a calendar.</li>
        <li><strong>Drafts</strong> — if you turn the setting on, the text of replies your assistant wrote for you.</li>
        <li><strong>Your actions</strong> — what you completed, dismissed, snoozed or delegated, and when. This is sent back to your assistant so it stops re-raising things you have handled.</li>
        <li><strong>Your account</strong> — email address, name if given, timezone, and a hash of your password.</li>
        <li><strong>Sessions and devices</strong> — browser and approximate IP for each sign-in, so you can recognise and end them, plus push notification tokens for devices where you enabled notifications.</li>
        <li><strong>Connection tokens</strong> — a hash of each token you create for an assistant, its name, and when it was last used.</li>
      </UL>

      <H2>What is not stored</H2>
      <UL>
        <li>Your email account credentials — ToDo has none and never asks for them.</li>
        <li>Full message bodies, attachments, or your mailbox. Only what your assistant chose to include in a task.</li>
        <li>Your plaintext password, or the plaintext of any connection token. Both are stored only as hashes.</li>
        <li>Analytics, advertising identifiers, or third-party trackers. There are none in this application.</li>
      </UL>

      <H2>Why it is stored</H2>
      <P>
        Solely to run the service for you: to show your list, to open the right message when you tap a task, to send
        the notifications you asked for, and to tell your assistant what you have already handled. Your data is not
        sold, rented, or used to train any model.
      </P>

      <H2>Who else sees it</H2>
      <UL>
        <li><strong>Your AI assistant provider</strong> — Anthropic or OpenAI, depending on which you connect. They receive your tasks because they write them and read them back. Their handling is governed by their own terms, not this policy.</li>
        <li><strong>Hosting and database providers</strong> — this deployment runs on infrastructure operated by {OPERATOR}, who should name their hosting and database providers and regions here.</li>
        <li><strong>Email delivery</strong> — the provider configured for confirmation and password reset messages sees your email address.</li>
        <li><strong>Push services</strong> — Apple, Google and browser vendors relay notifications. They see the notification and the device it is bound for.</li>
      </UL>
      <P>Nobody else. There is no advertising, no data brokerage, and no analytics vendor.</P>

      <H2>How long it is kept</H2>
      <UL>
        <li>Open tasks stay until you or your assistant clear them.</li>
        <li>Completed tasks are removed automatically after the period you choose in Settings — a day, a week, a month, or never.</li>
        <li>Records of what you have handled persist so your assistant does not re-raise them, and go when you delete your account.</li>
        <li>Expired sessions, used email links and rate-limit counters are deleted automatically.</li>
      </UL>

      <H2>Deleting everything</H2>
      <P>
        Settings → Account → <strong>Delete my account</strong>. It takes effect immediately and removes your account,
        every task, every source detail, every draft, every connection token and every device registration. There is
        no soft delete and no recovery. Export your data first from the same screen if you want a copy.
      </P>

      <H2>Your rights</H2>
      <P>
        Depending on where you live you may have rights to access, correct, export or erase your personal data, and to
        object to its processing. Access and export are available in the app immediately; erasure is the delete button
        above. For anything else, contact {CONTACT}.
      </P>

      <H2>Security</H2>
      <UL>
        <li>Passwords are hashed with scrypt and a per-password salt.</li>
        <li>Session cookies and connection tokens are stored only as SHA-256 hashes; a token&apos;s plaintext is shown once, at creation.</li>
        <li>Sign-in, sign-up and password reset are rate limited.</li>
        <li>Every record is scoped to its owner, and that isolation is covered by automated tests on every change.</li>
        <li>Changing or resetting your password signs out every other device.</li>
      </UL>
      <P>
        No system is perfect. If you find a security problem, please report it to {CONTACT} rather than disclosing it
        publicly.
      </P>

      <H2>Children</H2>
      <P>ToDo is not intended for anyone under 16, and accounts are not knowingly created for them.</P>

      <H2>Changes</H2>
      <P>
        If this policy changes materially, the date above changes and account holders are notified by email before it
        takes effect.
      </P>
    </LegalPage>
  );
}
