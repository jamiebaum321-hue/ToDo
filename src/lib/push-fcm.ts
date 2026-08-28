import { createSign } from "node:crypto";

/**
 * Firebase Cloud Messaging, HTTP v1.
 *
 * The native apps use FCM for both platforms — Firebase forwards to APNs for
 * iOS once the APNs key is uploaded to the project — so there is one push
 * integration to configure and one code path here, rather than a separate
 * APNs JWT signer that would need its own key rotation and its own bugs.
 *
 * Configure with FCM_SERVICE_ACCOUNT: the service-account JSON, either inline
 * or base64-encoded (base64 is easier to paste into a hosting dashboard).
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

let cached: { token: string; expiresAt: number } | null = null;

function serviceAccount(): ServiceAccount | null {
  const raw = process.env.FCM_SERVICE_ACCOUNT;
  if (!raw) return null;

  try {
    const json = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const parsed = JSON.parse(json) as ServiceAccount;
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) return null;
    // Dashboards frequently store the key with literal \n rather than newlines.
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return parsed;
  } catch {
    return null;
  }
}

export function fcmConfigured(): boolean {
  return serviceAccount() !== null;
}

export function fcmProjectId(): string | null {
  return serviceAccount()?.project_id ?? null;
}

const b64url = (input: Buffer | string) =>
  Buffer.from(input).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

/** Exchange the service account for an OAuth access token, and reuse it. */
async function accessToken(account: ServiceAccount): Promise<string> {
  // A minute of headroom, so a token never expires mid-flight.
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );

  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(account.private_key))}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`FCM token exchange failed (${res.status}): ${(await res.text()).slice(0, 200)}`);

  const data = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return data.access_token;
}

export interface FcmPayload {
  title: string;
  body: string;
  url: string;
  taskId?: string | null;
  tag?: string;
  badge?: number | null;
  urgent?: boolean;
}

export type FcmResult = { ok: true } | { ok: false; gone: boolean; error: string };

/** Send to one device token. `gone` means the token is dead and should be dropped. */
export async function sendFcm(deviceToken: string, payload: FcmPayload): Promise<FcmResult> {
  const account = serviceAccount();
  if (!account) return { ok: false, gone: false, error: "FCM is not configured" };

  try {
    const token = await accessToken(account);
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: deviceToken,
          notification: { title: payload.title, body: payload.body },
          // Data travels alongside so the app can route the tap to the task.
          data: {
            url: payload.url,
            taskId: payload.taskId ?? "",
            tag: payload.tag ?? "todo",
          },
          android: {
            priority: payload.urgent ? "HIGH" : "NORMAL",
            notification: { tag: payload.tag ?? "todo", click_action: "OPEN_TASK" },
          },
          apns: {
            headers: {
              "apns-priority": payload.urgent ? "10" : "5",
              ...(payload.tag ? { "apns-collapse-id": payload.tag } : {}),
            },
            payload: {
              aps: {
                sound: payload.urgent ? "default" : undefined,
                ...(typeof payload.badge === "number" ? { badge: payload.badge } : {}),
                "thread-id": payload.tag ?? "todo",
              },
            },
          },
        },
      }),
    });

    if (res.ok) return { ok: true };

    const detail = await res.text().catch(() => "");
    // UNREGISTERED / INVALID_ARGUMENT on the token mean the install is gone.
    const gone = res.status === 404 || /UNREGISTERED|NOT_FOUND/i.test(detail);
    return { ok: false, gone, error: `FCM ${res.status}: ${detail.slice(0, 200)}` };
  } catch (err: any) {
    return { ok: false, gone: false, error: err?.message ?? "FCM send failed" };
  }
}
