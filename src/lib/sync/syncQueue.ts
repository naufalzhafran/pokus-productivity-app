import { getDB, SyncOperation } from "./db";
import { getSupabaseClient } from "@/lib/supabase/client";

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 30000;

let isProcessing = false;
let syncTimeoutId: ReturnType<typeof setTimeout> | null = null;

function getBackoffDelay(retryCount: number): number {
  const delay = Math.min(BASE_DELAY_MS * Math.pow(2, retryCount), MAX_DELAY_MS);
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.round(delay + jitter);
}

export async function addToSyncQueue(
  operation: Omit<
    SyncOperation,
    "id" | "retryCount" | "nextRetryAt" | "createdAt"
  >,
): Promise<void> {
  const db = await getDB();
  const syncOp: SyncOperation = {
    ...operation,
    id: crypto.randomUUID(),
    retryCount: 0,
    nextRetryAt: Date.now(),
    createdAt: Date.now(),
  };

  await db.put("syncQueue", syncOp);

  if (navigator.onLine) {
    scheduleSyncProcessing();
  }
}

export async function getPendingOperations(): Promise<SyncOperation[]> {
  const db = await getDB();
  return db.getAll("syncQueue");
}

async function removeFromQueue(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("syncQueue", id);
}

async function updateOperationRetry(operation: SyncOperation): Promise<void> {
  const db = await getDB();
  const newRetryCount = operation.retryCount + 1;

  if (newRetryCount >= MAX_RETRIES) {
    console.warn(
      `Sync operation ${operation.id} failed after ${MAX_RETRIES} retries`,
    );
    await removeFromQueue(operation.id);
    return;
  }

  const updatedOp: SyncOperation = {
    ...operation,
    retryCount: newRetryCount,
    nextRetryAt: Date.now() + getBackoffDelay(newRetryCount),
  };

  await db.put("syncQueue", updatedOp);
}

async function processOperation(operation: SyncOperation): Promise<boolean> {
  const supabase = getSupabaseClient();

  try {
    switch (operation.type) {
      case "CREATE": {
        await supabase.from(operation.table).insert(operation.data);
        break;
      }

      case "UPDATE": {
        const { id, ...updateData } = operation.data;
        await supabase
          .from(operation.table)
          .update(updateData)
          .eq("id", id as string);
        break;
      }

      case "DELETE": {
        await supabase
          .from(operation.table)
          .delete()
          .eq("id", operation.data.id as string);
        break;
      }
    }

    return true;
  } catch (error) {
    console.error(`Sync operation failed:`, error);
    return false;
  }
}

export async function processSyncQueue(): Promise<void> {
  if (isProcessing || !navigator.onLine) {
    return;
  }

  isProcessing = true;

  try {
    const db = await getDB();
    const operations = await db.getAllFromIndex("syncQueue", "by-next-retry");
    const now = Date.now();

    for (const operation of operations) {
      if (operation.nextRetryAt > now) {
        continue;
      }

      const success = await processOperation(operation);

      if (success) {
        await removeFromQueue(operation.id);

        if (operation.table === "pokus_sessions") {
          const { markSessionSynced } = await import("./sessionStore");
          await markSessionSynced(operation.data.id as string);
        }
      } else {
        await updateOperationRetry(operation);
      }
    }

    const remaining = await db.getAll("syncQueue");
    if (remaining.length > 0) {
      const nextRetry = Math.min(...remaining.map((op) => op.nextRetryAt));
      const delay = Math.max(nextRetry - Date.now(), 1000);
      scheduleSyncProcessing(delay);
    }
  } finally {
    isProcessing = false;
  }
}

function scheduleSyncProcessing(delay: number = 0): void {
  if (syncTimeoutId) {
    clearTimeout(syncTimeoutId);
  }

  syncTimeoutId = setTimeout(() => {
    syncTimeoutId = null;
    processSyncQueue();
  }, delay);
}

export function initSyncQueue(): void {
  window.addEventListener("online", () => {
    console.log("Back online, processing sync queue...");
    processSyncQueue();
  });

  window.addEventListener("offline", () => {
    console.log("Went offline, sync queue paused");
    if (syncTimeoutId) {
      clearTimeout(syncTimeoutId);
      syncTimeoutId = null;
    }
  });

  if (navigator.onLine) {
    processSyncQueue();
  }
}

export async function forceSyncAll(): Promise<void> {
  if (!navigator.onLine) {
    console.warn("Cannot force sync while offline");
    return;
  }

  await processSyncQueue();
}
