import type { BoardPayload, TaskAction, TaskDTO } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const api = {
  board: (status = "open") => request<BoardPayload>(`/api/tasks?status=${status}`),

  act: (id: string, action: TaskAction, extra?: Record<string, unknown>) =>
    request<{ task: TaskDTO; undoable: boolean }>(`/api/tasks/${id}/action`, {
      method: "POST",
      body: JSON.stringify({ action, ...extra }),
    }),

  undo: () => request<{ ok: boolean; task?: TaskDTO }>("/api/tasks/undo", { method: "POST" }),

  create: (input: { title: string; description?: string; bucket?: string; dueAt?: string | null }) =>
    request<{ task: TaskDTO }>("/api/tasks", { method: "POST", body: JSON.stringify(input) }),

  update: (id: string, patch: Record<string, unknown>) =>
    request<{ task: TaskDTO }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(patch) }),

  remove: (id: string) => request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),

  clearBucket: (bucket: string, action: "delete" | "complete" = "delete") =>
    request<{ cleared: number }>("/api/tasks/clear", { method: "POST", body: JSON.stringify({ bucket, action }) }),

  settings: () => request<any>("/api/settings"),
  saveSettings: (patch: Record<string, unknown>) =>
    request<any>("/api/settings", { method: "PATCH", body: JSON.stringify(patch) }),

  tokens: () => request<{ tokens: any[] }>("/api/tokens"),
  createToken: (name: string) => request<{ token: string; record: any }>("/api/tokens", { method: "POST", body: JSON.stringify({ name }) }),
  revokeToken: (id: string) => request<{ ok: true }>(`/api/tokens/${id}`, { method: "DELETE" }),

  runs: () => request<{ runs: any[] }>("/api/runs"),

  subscribePush: (sub: PushSubscriptionJSON, platform: string) =>
    request<{ ok: true }>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys, platform }),
    }),
  unsubscribePush: (endpoint: string) =>
    request<{ ok: true }>("/api/push/subscribe", { method: "DELETE", body: JSON.stringify({ endpoint }) }),
  testPush: () => request<{ ok: true; sent: number }>("/api/push/test", { method: "POST" }),

  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),
};
