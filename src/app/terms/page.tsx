import type { Metadata } from "next";
import { Callout, H2, LegalPage, P, UL } from "@/components/app/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms for using ToDo.",
};

const OPERATOR = process.env.NEXT_PUBLIC_OPERATOR_NAME || "the operator of this ToDo instance";
const CONTACT = process.env.NEXT_PUBLIC_PRIVACY_CONTACT || "the address on the sign-in page";
const UPDATED = "28 August 2026";

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated={UPDATED}>
      <Callout>
        <strong>This is a template, not legal advice.</strong> {OPERATOR} should have it reviewed and should set the
        governing jurisdiction and contact details for this deployment before relying on it.
      </Callout>

      <H2>What ToDo does</H2>
      <P>
        ToDo is a task list filled in by an AI assistant you connect yourself. It provides a place for that assistant
        to write tasks, and an interface for you to work through them. It does not read your email, calendar or chat —
        your assistant does that, under whatever authorisation you have already given it.
      </P>

      <H2>Your account</H2>
      <UL>
        <li>You must give a working email address and confirm it.</li>
        <li>You are responsible for keeping your password and your connection tokens secret. A connection token can read and rewrite your entire list — treat it like a password.</li>
        <li>One person per account. Do not share credentials.</li>
        <li>You must be at least 16.</li>
      </UL>

      <H2>Acceptable use</H2>
      <P>Do not use ToDo to:</P>
      <UL>
        <li>break the law, or help anyone else do so;</li>
        <li>store material you have no right to store;</li>
        <li>attack, overload or probe the service, or work around its rate limits;</li>
        <li>access anyone else&apos;s account or data.</li>
      </UL>

      <H2>Your content is yours</H2>
      <P>
        You keep all rights to your tasks and everything in them. {OPERATOR} claims no ownership and uses your content
        only to operate the service for you, as described in the Privacy Policy. It is not used to train models.
      </P>

      <H2>Third-party services</H2>
      <P>
        Connecting an assistant means sending your data to that provider, and their terms govern what they do with it.
        The deep links in your tasks point at Microsoft, Google, Zoom and similar services, which have their own terms.
        {" "}{OPERATOR} is not responsible for any of them, and cannot control what your assistant chooses to write
        into your list.
      </P>

      <H2>Availability</H2>
      <P>
        The service is provided as it is, without a guaranteed uptime. It may change, break, or be discontinued. Keep
        your own copy of anything you cannot afford to lose — the export button in Settings is there for that.
      </P>

      <H2>No warranty, and limits on liability</H2>
      <P>
        ToDo is provided &ldquo;as is&rdquo; without warranties of any kind, to the fullest extent the law allows. In
        particular, an AI assistant can misjudge what matters, miss something, or file it in the wrong place. <strong>
        Do not rely on ToDo as the only record of anything important.</strong>
      </P>
      <P>
        To the fullest extent permitted by law, {OPERATOR} is not liable for indirect or consequential loss, lost
        profits, or lost data arising from your use of the service. Some jurisdictions do not allow these exclusions,
        in which case they apply only as far as the law permits.
      </P>

      <H2>Ending it</H2>
      <P>
        You can delete your account at any time from Settings → Account, which removes everything immediately.
        {" "}{OPERATOR} may suspend or close an account that breaches these terms, and will give notice where it is
        reasonable to do so.
      </P>

      <H2>Changes</H2>
      <P>
        These terms may change. Material changes are notified by email before taking effect, and the date above
        changes. Continuing to use the service after that means accepting the new terms.
      </P>

      <H2>Contact</H2>
      <P>Questions about these terms go to {CONTACT}.</P>
    </LegalPage>
  );
}
