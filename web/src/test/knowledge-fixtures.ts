import { vi } from "vitest";
import type { KnowledgeStore } from "@/hooks/useKnowledge";
import type { Capture } from "@/types/capture";
import type { Knowledge } from "@/types/knowledge";
import type { Project } from "@/types/task";

export const knowledgeProjects: Project[] = [
  { id: "reading", title: "Read Atomic Habits", description: "", createdAt: 1, status: "active", captureIds: ["book"] },
  { id: "fitness", title: "Fitness", description: "", createdAt: 2, status: "active", captureIds: [] },
];
export const bookCapture: Capture = { id: "book", kind: "book", url: null, title: "Atomic Habits", note: "", author: "James Clear", preview: null, isProcessed: false, createdAt: 1, updatedAt: 1 };

export function makeNote(overrides: Partial<Knowledge> = {}): Knowledge {
  return { id: "loop", title: "Habit loop", summary: "Cue, craving, response, reward.", body: "<p>Every habit runs the same <strong>four steps</strong>.</p>", projectId: "reading", linkedProjectIds: [], sourceIds: ["book"],
    locator: "Ch. 3", categoryId: null, status: "draft", reviewStep: 0, nextReviewAt: null, createdAt: 1, updatedAt: Date.UTC(2026, 8, 1), ...overrides };
}

export function knowledgeStore(knowledge: Knowledge[], overrides: Partial<KnowledgeStore> = {}): KnowledgeStore {
  return {
    knowledge, isLoading: false, loadError: null,
    createKnowledge: vi.fn(), updateKnowledge: vi.fn(), setKnowledgeStatus: vi.fn(async () => null), reviewKnowledge: vi.fn(async () => null),
    setKnowledgeLinked: vi.fn(async () => null), deleteKnowledge: vi.fn(async () => true),
    reconcileDeletedProject: vi.fn(), reconcileDeletedCapture: vi.fn(), reconcileDeletedCategory: vi.fn(),
    ...overrides,
  } as KnowledgeStore;
}
