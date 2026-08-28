/**
 * Mint a VAPID key pair for web push.
 *
 *   npm run gen:vapid
 *
 * Paste the output into .env. The public key is also exposed to the browser as
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY, which is why it appears twice.
 */
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log(`
Add these to your .env:

VAPID_PUBLIC_KEY="${publicKey}"
VAPID_PRIVATE_KEY="${privateKey}"
NEXT_PUBLIC_VAPID_PUBLIC_KEY="${publicKey}"
VAPID_SUBJECT="mailto:you@example.com"

Keep the private key secret. Changing the pair later invalidates every device
that has already subscribed — they will need to turn notifications on again.
`);
