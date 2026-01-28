import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "pokus-offline";
const DB_VERSION = 2;

interface PokusDB {
  sessions: {
    key: string;
    value: LocalSession;
    indexes: { "by-sync-status": string; "by-created-at": string };
  };
  syncQueue: {
    key: string;
    value: SyncOperation;
    indexes: { "by-next-retry": number };
  };
}

export interface LocalSession {
  id: string;
  title: string;
  duration_planned: number;
  duration_actual?: number;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  tags: string[];
  started_at?: string;
  ended_at?: string;
  created_at: string;
  user_id: string;
  // Sync metadata
  syncStatus: "SYNCED" | "PENDING" | "FAILED";
  lastSyncedAt?: string;
}

export interface SyncOperation {
  id: string;
  type: "CREATE" | "UPDATE" | "DELETE";
  table: string;
  data: Record<string, unknown>;
  retryCount: number;
  nextRetryAt: number;
  createdAt: number;
}

let dbInstance: IDBPDatabase<PokusDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PokusDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<PokusDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      // Sessions store
      if (!db.objectStoreNames.contains("sessions")) {
        const sessionStore = db.createObjectStore("sessions", {
          keyPath: "id",
        });
        sessionStore.createIndex("by-sync-status", "syncStatus");
        sessionStore.createIndex("by-created-at", "created_at");
      }

      // Sync queue store
      if (!db.objectStoreNames.contains("syncQueue")) {
        const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
        syncStore.createIndex("by-next-retry", "nextRetryAt");
      }
    },
  });

  return dbInstance;
}

export async function closeDB(): Promise<void> {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

/**
 * Clear all data from IndexedDB (used on logout)
 */
export async function clearAllData(): Promise<void> {
  const db = await getDB();

  // Clear all sessions
  const sessionTx = db.transaction("sessions", "readwrite");
  await sessionTx.objectStore("sessions").clear();
  await sessionTx.done;

  // Clear sync queue
  const syncTx = db.transaction("syncQueue", "readwrite");
  await syncTx.objectStore("syncQueue").clear();
  await syncTx.done;

  console.log("IndexedDB data cleared");
}
