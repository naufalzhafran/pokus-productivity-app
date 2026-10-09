import { ClientResponseError } from "pocketbase";
import { describe, expect, it, vi } from "vitest";
import { queueCapture, readQueuedCaptures, syncQueuedCaptures, type QueuedCapture } from "@/lib/capture-queue";
import { clearAccountCache } from "@/lib/offline-store";

const capture = (id: string, createdAt: number): QueuedCapture => ({ id, kind: "note", url: null, title: "", note: id, preview: null, isProcessed: false, createdAt, updatedAt: createdAt, previewPending: false });
const failure = (status: number) => new ClientResponseError({ status, response: {} });

describe("offline capture queue", () => {
  it("keeps queued captures when the account's cached workspace is cleared", async () => {
    await queueCapture("queue-keep", capture("a", 1));
    await clearAccountCache("queue-keep");
    expect((await readQueuedCaptures("queue-keep")).map((item) => item.id)).toEqual(["a"]);
  });

  it("sends oldest first and stops at a network failure, keeping the rest", async () => {
    await queueCapture("queue-order", capture("second", 2));
    await queueCapture("queue-order", capture("first", 1));
    await queueCapture("queue-order", capture("third", 3));
    const sent: string[] = [];
    const upload = vi.fn(async (item: QueuedCapture) => { if (item.id === "second") throw failure(0); sent.push(item.id); return item; });
    const synced = vi.fn();
    await syncQueuedCaptures("queue-order", upload, synced);
    expect(sent).toEqual(["first"]);
    expect(synced).toHaveBeenCalledTimes(1);
    expect((await readQueuedCaptures("queue-order")).map((item) => item.id).sort()).toEqual(["second", "third"]);
  });

  it("marks a rejected capture and keeps syncing the others", async () => {
    await queueCapture("queue-rejected", capture("bad", 1));
    await queueCapture("queue-rejected", capture("good", 2));
    await syncQueuedCaptures("queue-rejected", async (item) => { if (item.id === "bad") throw failure(400); return item; }, () => undefined);
    const left = await readQueuedCaptures("queue-rejected");
    expect(left).toHaveLength(1);
    expect(left[0]).toMatchObject({ id: "bad", syncError: expect.any(String) });
    // A rejected capture isn't retried automatically.
    const upload = vi.fn();
    await syncQueuedCaptures("queue-rejected", upload, () => undefined);
    expect(upload).not.toHaveBeenCalled();
  });
});
