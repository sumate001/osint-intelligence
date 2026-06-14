import { create } from "zustand";

export type TaskStatus = "running" | "done" | "error" | "cancelled";
export type TaskType = "ai-search" | "scan" | "verify";

export interface BackgroundTask {
  id: string;          // unique — e.g. "ai-search-<caseId>"
  type: TaskType;
  label: string;       // shown in TaskBar
  status: TaskStatus;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result?: any;        // stored on completion so component can restore it
  error?: string;
  abort?: () => void;  // call to cancel
  startedAt: number;
  finishedAt?: number;
}

interface TaskStore {
  tasks: BackgroundTask[];
  add:    (task: Omit<BackgroundTask, "startedAt">) => void;
  update: (id: string, patch: Partial<BackgroundTask>) => void;
  remove: (id: string) => void;
  get:    (id: string) => BackgroundTask | undefined;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  add: (task) =>
    set((s) => ({
      tasks: [
        // replace if same id exists (re-run)
        ...s.tasks.filter((t) => t.id !== task.id),
        { ...task, startedAt: Date.now() },
      ],
    })),
  update: (id, patch) =>
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
  remove: (id) =>
    set((s) => ({ tasks: s.tasks.filter((t) => t.id !== id) })),
  get: (id) => get().tasks.find((t) => t.id === id),
}));
