import { useCallback } from "react";
import { useCachedResource } from "@/hooks/useCachedResource";
import { requireConnection } from "@/hooks/useConnectivity";
import { normalizeKnowledgeInput } from "@/lib/knowledge";
import { pb } from "@/lib/pocketbase";
import { COLLECTIONS, createPocketBaseId, knowledgeFromRecord, knowledgeToRecord, listKnowledge, type KnowledgeRecord } from "@/lib/pocketbase-records";
import { firstReview, nextReview, scheduleForStatus } from "@/lib/review";
import type { Knowledge, KnowledgeInput } from "@/types/knowledge";

export type KnowledgeStore = ReturnType<typeof useKnowledge>;

function toRecordChanges(changes: Partial<Knowledge>) {
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (key === "projectId") body.project = value ?? "";
    else if (key === "linkedProjectIds") body.linkedProjects = value;
    else if (key === "sourceIds") body.sources = value;
    else if (key === "categoryId") body.category = value ?? "";
    else if (key === "nextReviewAt") body.nextReviewAt = value ?? 0;
    else body[key] = value;
  }
  return body;
}

export function useKnowledge() {
  const { items: knowledge, itemsRef: ref, replace, isLoading, loadError } = useCachedResource<Knowledge>("knowledge", listKnowledge);

  /** Optimistically applies a change and rolls back if PocketBase rejects it. */
  const save = useCallback(async (id: string, local: Partial<Knowledge>, body: Record<string, unknown> = toRecordChanges(local)) => {
    requireConnection();
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return null;
    replace(ref.current.map((item) => item.id === id ? { ...item, ...local } : item));
    try {
      const saved = knowledgeFromRecord(await pb.collection(COLLECTIONS.knowledge).update<KnowledgeRecord>(id, body, { requestKey: null }));
      replace(ref.current.map((item) => item.id === id ? saved : item));
      return saved;
    } catch (error) {
      replace(ref.current.map((item) => item.id === id ? previous : item));
      throw error;
    }
  }, [replace, ref]);

  const createKnowledge = useCallback(async (input: KnowledgeInput) => {
    requireConnection();
    const normalized = normalizeKnowledgeInput(input);
    const schedule = normalized.status === "evergreen" ? firstReview() : { reviewStep: 0, nextReviewAt: null };
    const note: Knowledge = { id: createPocketBaseId(), ...normalized, ...schedule, createdAt: Date.now(), updatedAt: Date.now() };
    const saved = knowledgeFromRecord(await pb.collection(COLLECTIONS.knowledge).create<KnowledgeRecord>(knowledgeToRecord(note), { requestKey: null }));
    replace([saved, ...ref.current]);
    return saved;
  }, [replace, ref]);

  const updateKnowledge = useCallback((id: string, input: KnowledgeInput) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return Promise.resolve(null);
    const normalized = normalizeKnowledgeInput(input);
    return save(id, { ...normalized, ...scheduleForStatus(previous, normalized.status), updatedAt: Date.now() });
  }, [ref, save]);

  const setKnowledgeStatus = useCallback((id: string, status: Knowledge["status"]) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return Promise.resolve(null);
    return save(id, { status, ...scheduleForStatus(previous, status) });
  }, [ref, save]);

  const reviewKnowledge = useCallback((id: string, remembered: boolean) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return Promise.resolve(null);
    return save(id, nextReview(previous.reviewStep, remembered));
  }, [ref, save]);

  /** Links or unlinks a project with PocketBase `+`/`-` modifiers, so concurrent edits don't overwrite each other. */
  const setKnowledgeLinked = useCallback((id: string, projectId: string, linked: boolean) => {
    const previous = ref.current.find((item) => item.id === id);
    if (!previous || previous.linkedProjectIds.includes(projectId) === linked) return Promise.resolve(previous ?? null);
    const linkedProjectIds = linked ? [...previous.linkedProjectIds, projectId] : previous.linkedProjectIds.filter((value) => value !== projectId);
    return save(id, { linkedProjectIds }, { [linked ? "linkedProjects+" : "linkedProjects-"]: [projectId] });
  }, [ref, save]);

  const deleteKnowledge = useCallback(async (id: string) => {
    requireConnection();
    const previous = ref.current.find((item) => item.id === id);
    if (!previous) return false;
    replace(ref.current.filter((item) => item.id !== id));
    try { await pb.collection(COLLECTIONS.knowledge).delete(id); return true; }
    catch (error) { replace([...ref.current, previous].sort((a, b) => b.updatedAt - a.updatedAt)); throw error; }
  }, [replace, ref]);

  /** Mirrors PocketBase clearing relations to a deleted record, without a refetch. */
  const reconcile = useCallback((update: (note: Knowledge) => Knowledge) => {
    const next = ref.current.map(update);
    if (next.some((note, index) => note !== ref.current[index])) replace(next);
  }, [replace, ref]);
  const reconcileDeletedProject = useCallback((projectId: string) => reconcile((note) => note.projectId === projectId || note.linkedProjectIds.includes(projectId)
    ? { ...note, projectId: note.projectId === projectId ? null : note.projectId, linkedProjectIds: note.linkedProjectIds.filter((id) => id !== projectId) } : note), [reconcile]);
  const reconcileDeletedCapture = useCallback((captureId: string) => reconcile((note) => note.sourceIds.includes(captureId) ? { ...note, sourceIds: note.sourceIds.filter((id) => id !== captureId) } : note), [reconcile]);
  const reconcileDeletedCategory = useCallback((categoryId: string) => reconcile((note) => note.categoryId === categoryId ? { ...note, categoryId: null } : note), [reconcile]);

  return { knowledge, isLoading, loadError, createKnowledge, updateKnowledge, setKnowledgeStatus, reviewKnowledge, setKnowledgeLinked, deleteKnowledge, reconcileDeletedProject, reconcileDeletedCapture, reconcileDeletedCategory };
}
