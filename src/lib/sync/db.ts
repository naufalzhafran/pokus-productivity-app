import { openDB, IDBPDatabase } from "idb";

const DB_NAME = "pokus-offline";
const DB_VERSION = 5;

interface PokusDB {
  sessions: {
    key: string;
    value: LocalSession;
    indexes: { "by-sync-status": string; "by-created-at": string; "by-user-id": string };
  };
  syncQueue: {
    key: string;
    value: SyncOperation;
    indexes: { "by-next-retry": number };
  };
  projects: {
    key: string;
    value: LocalProject;
    indexes: { "by-user-id": string };
  };
  tasks: {
    key: string;
    value: LocalTask;
    indexes: { "by-project-id": string; "by-user-id": string };
  };
}

export interface LocalSession {
  id: string;
  title: string;
  duration: number;
  status: "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "ABANDONED";
  tags: string[];
  task_id?: string;
  started_at?: string;
  ended_at?: string;
  created_at: string;
  user_id: string;
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

export interface LocalProject {
  id: string;
  user_id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  syncStatus: "SYNCED" | "PENDING" | "FAILED";
  lastSyncedAt?: string;
}

export interface LocalTask {
  id: string;
  user_id: string;
  project_id: string;
  title: string;
  description: string;
  duration_minutes: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  syncStatus: "SYNCED" | "PENDING" | "FAILED";
  lastSyncedAt?: string;
}

let dbInstance: IDBPDatabase<PokusDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<PokusDB>> {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await openDB<PokusDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2) {
        if (!db.objectStoreNames.contains("sessions")) {
          const sessionStore = db.createObjectStore("sessions", {
            keyPath: "id",
          });
          sessionStore.createIndex("by-sync-status", "syncStatus");
          sessionStore.createIndex("by-created-at", "created_at");
          sessionStore.createIndex("by-user-id", "user_id");
        }

        if (!db.objectStoreNames.contains("syncQueue")) {
          const syncStore = db.createObjectStore("syncQueue", { keyPath: "id" });
          syncStore.createIndex("by-next-retry", "nextRetryAt");
        }
      }

      if (oldVersion === 2) {
        db.deleteObjectStore("sessions");
        const sessionStore = db.createObjectStore("sessions", {
          keyPath: "id",
        });
        sessionStore.createIndex("by-sync-status", "syncStatus");
        sessionStore.createIndex("by-created-at", "created_at");
        sessionStore.createIndex("by-user-id", "user_id");
      }

      if (oldVersion === 3) {
        if (db.objectStoreNames.contains("sessions")) {
          const tx = db.transaction("sessions", "readwrite");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (tx.objectStore("sessions") as any).createIndex("by-user-id", "user_id");
        }
      }

      if (oldVersion < 5) {
        if (!db.objectStoreNames.contains("projects")) {
          const projectStore = db.createObjectStore("projects", {
            keyPath: "id",
          });
          projectStore.createIndex("by-user-id", "user_id");
        }

        if (!db.objectStoreNames.contains("tasks")) {
          const taskStore = db.createObjectStore("tasks", {
            keyPath: "id",
          });
          taskStore.createIndex("by-project-id", "project_id");
          taskStore.createIndex("by-user-id", "user_id");
        }
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

export async function clearAllData(): Promise<void> {
  const db = await getDB();

  const sessionTx = db.transaction("sessions", "readwrite");
  await sessionTx.objectStore("sessions").clear();
  await sessionTx.done;

  const syncTx = db.transaction("syncQueue", "readwrite");
  await syncTx.objectStore("syncQueue").clear();
  await syncTx.done;

  console.log("IndexedDB data cleared");
}
