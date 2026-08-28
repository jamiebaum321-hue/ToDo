"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { api } from "@/lib/client/api";
import type { BoardPayload, TaskAction, TaskDTO } from "@/lib/client/types";

export interface Toast {
  id: number;
  message: string;
  /** Present when the action can be taken back. */
  undo?: () => void;
  tone?: "default" | "success" | "error";
}

interface TodoContext {
  board: BoardPayload | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;

  tasks: TaskDTO[];
  openTasks: TaskDTO[];
  counts: Record<string, number>;

  selected: TaskDTO | null;
  select: (id: string | null) => void;

  act: (task: TaskDTO, action: TaskAction, extra?: Record<string, unknown>) => Promise<void>;
  createTask: (input: { title: string; description?: string; bucket?: string; dueAt?: string | null }) => Promise<void>;
  updateTask: (id: string, patch: Record<string, unknown>) => Promise<void>;
  removeTask: (task: TaskDTO) => Promise<void>;
  clearBucket: (bucket: string) => Promise<void>;

  toasts: Toast[];
  pushToast: (toast: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<TodoContext | null>(null);

const EMPTY_TASKS: TaskDTO[] = [];

const PAST_TENSE: Record<TaskAction, string> = {
  complete: "Done",
  reopen: "Back on the list",
  dismiss: "Dismissed",
  snooze: "Snoozed",
  delegate: "Handed off",
  pin: "Pinned",
  move: "Moved",
};

export function TodoProvider({ initial, children }: { initial: BoardPayload; children: ReactNode }) {
  const [board, setBoard] = useState<BoardPayload | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const toastId = useRef(0);

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const pushToast = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = (toastId.current += 1);
      setToasts((prev) => [...prev.slice(-2), { ...toast, id }]);
      // Long enough to reach for undo, short enough not to sit in the way.
      setTimeout(() => dismissToast(id), toast.undo ? 6500 : 3800);
    },
    [dismissToast],
  );

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await api.board("all");
      setBoard(next);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  // A phone that has been in a pocket for an hour is looking at a stale list.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  /*
   * An agent sweep happens somewhere else entirely, so a window that is already
   * open and focused never hears about it — which is why the list only appeared
   * after a manual reload.
   *
   * Poll a stamp rather than the board: a few dozen bytes every 25 seconds, and
   * the board is only re-fetched on the ticks where something actually changed,
   * which for most of the day is none of them. The interval is torn down while
   * the tab is hidden, so a backgrounded tab costs nothing at all.
   */
  useEffect(() => {
    let seen: string | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    const check = async () => {
      try {
        const { version } = await api.boardVersion();
        if (seen !== null && version !== seen) await refresh();
        seen = version;
      } catch {
        // Offline, or the session lapsed. The next tick tries again; the focus
        // listener above covers the case where the tab was asleep for it.
      }
    };

    const start = () => {
      if (timer || document.visibilityState !== "visible") return;
      void check();
      timer = setInterval(check, 25_000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };

    start();
    const onVisibility = () => (document.visibilityState === "visible" ? start() : stop());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [refresh]);

  const applyTask = useCallback((task: TaskDTO) => {
    setBoard((prev) => {
      if (!prev) return prev;
      const tasks = prev.tasks.some((t) => t.id === task.id)
        ? prev.tasks.map((t) => (t.id === task.id ? task : t))
        : [task, ...prev.tasks];
      return { ...prev, tasks, counts: recount(tasks) };
    });
  }, []);

  const act = useCallback(
    async (task: TaskDTO, action: TaskAction, extra?: Record<string, unknown>) => {
      // Optimistic: the card should move the instant it is tapped.
      const optimisticStatus =
        action === "complete"
          ? "completed"
          : action === "dismiss"
            ? "dismissed"
            : action === "snooze"
              ? "snoozed"
              : action === "delegate"
                ? "delegated"
                : action === "reopen"
                  ? "open"
                  : task.status;

      const optimistic: TaskDTO = {
        ...task,
        status: optimisticStatus as TaskDTO["status"],
        pinned: action === "pin" ? ((extra?.pinned as boolean) ?? !task.pinned) : task.pinned,
        bucket: action === "move" ? ((extra?.bucket as any) ?? task.bucket) : task.bucket,
      };
      applyTask(optimistic);
      if (action !== "pin" && action !== "move" && selectedId === task.id) setSelectedId(null);

      try {
        const res = await api.act(task.id, action, extra);
        applyTask(res.task);

        if (res.undoable) {
          pushToast({
            message: `${PAST_TENSE[action]} · ${truncate(task.title, 40)}`,
            tone: action === "complete" ? "success" : "default",
            undo: async () => {
              try {
                const back = await api.undo();
                if (back.task) applyTask(back.task);
                else await refresh();
              } catch {
                await refresh();
              }
            },
          });
        }
      } catch (err: any) {
        applyTask(task); // roll back
        pushToast({ message: err?.message ?? "That did not save.", tone: "error" });
      }
    },
    [applyTask, pushToast, refresh, selectedId],
  );

  const createTask = useCallback(
    async (input: { title: string; description?: string; bucket?: string; dueAt?: string | null }) => {
      try {
        const { task } = await api.create(input);
        applyTask(task);
        pushToast({ message: "Added", tone: "success" });
      } catch (err: any) {
        pushToast({ message: err?.message ?? "Could not add that.", tone: "error" });
      }
    },
    [applyTask, pushToast],
  );

  const updateTask = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      try {
        const { task } = await api.update(id, patch);
        applyTask(task);
      } catch (err: any) {
        pushToast({ message: err?.message ?? "Could not save that.", tone: "error" });
      }
    },
    [applyTask, pushToast],
  );

  const removeTask = useCallback(
    async (task: TaskDTO) => {
      setBoard((prev) => {
        if (!prev) return prev;
        const tasks = prev.tasks.filter((t) => t.id !== task.id);
        return { ...prev, tasks, counts: recount(tasks) };
      });
      if (selectedId === task.id) setSelectedId(null);
      try {
        await api.remove(task.id);
        pushToast({ message: `Deleted · ${truncate(task.title, 40)}` });
      } catch (err: any) {
        pushToast({ message: err?.message ?? "Could not delete that.", tone: "error" });
        await refresh();
      }
    },
    [pushToast, refresh, selectedId],
  );

  const clearBucket = useCallback(
    async (bucket: string) => {
      try {
        const { cleared } = await api.clearBucket(bucket, "delete");
        await refresh();
        pushToast({ message: cleared ? `Cleared ${cleared}` : "Nothing to clear", tone: "success" });
      } catch (err: any) {
        pushToast({ message: err?.message ?? "Could not clear that.", tone: "error" });
      }
    },
    [pushToast, refresh],
  );

  // Memoised so the empty-array fallback does not create a new identity every
  // render and invalidate everything downstream.
  const tasks = useMemo(() => board?.tasks ?? EMPTY_TASKS, [board]);
  const openTasks = useMemo(() => tasks.filter((t) => t.status === "open"), [tasks]);
  const selected = useMemo(() => tasks.find((t) => t.id === selectedId) ?? null, [tasks, selectedId]);

  const value: TodoContext = {
    board,
    loading,
    error,
    refresh,
    tasks,
    openTasks,
    counts: board?.counts ?? {},
    selected,
    select: setSelectedId,
    act,
    createTask,
    updateTask,
    removeTask,
    clearBucket,
    toasts,
    pushToast,
    dismissToast,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTodo(): TodoContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTodo must be used inside <TodoProvider>");
  return ctx;
}

function recount(tasks: TaskDTO[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const t of tasks) if (t.status === "open") counts[t.bucket] = (counts[t.bucket] ?? 0) + 1;
  return counts;
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}…`;
}
