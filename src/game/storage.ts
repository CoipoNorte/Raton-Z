import {
  DEFAULT_SETTINGS,
  EMPTY_PROFILE,
  type GameSettings,
  type Profile,
} from "./types";

const DB_NAME = "raton-z-survival";
let connection: Promise<IDBDatabase> | null = null;

function database(): Promise<IDBDatabase> {
  if (!connection) {
    connection = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("progress");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("Database is blocked"));
    });
  }
  return connection;
}

export async function loadProfile(): Promise<Profile> {
  try {
    const db = await database();
    const stored = await new Promise<Profile | undefined>((resolve, reject) => {
      const request = db
        .transaction("progress", "readonly")
        .objectStore("progress")
        .get("profile");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (stored)
      return {
        ...EMPTY_PROFILE,
        ...stored,
        upgrades: { ...EMPTY_PROFILE.upgrades, ...stored.upgrades },
      };
  } catch {
    /* Storage restrictions fall back to localStorage. */
  }
  try {
    const stored = localStorage.getItem("raton-z-profile");
    if (stored) {
      const parsed = JSON.parse(stored) as Profile;
      return {
        ...EMPTY_PROFILE,
        ...parsed,
        upgrades: { ...EMPTY_PROFILE.upgrades, ...parsed.upgrades },
        records: parsed.records ?? [],
      };
    }
  } catch {
    /* A private session can still play without persistence. */
  }
  return structuredClone(EMPTY_PROFILE);
}

export async function saveProfile(profile: Profile): Promise<void> {
  let fallbackSaved = false;
  try {
    localStorage.setItem("raton-z-profile", JSON.stringify(profile));
    fallbackSaved = true;
  } catch {
    /* IndexedDB remains the primary store. */
  }
  try {
    const db = await database();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("progress", "readwrite");
      transaction.objectStore("progress").put(profile, "profile");
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } catch {
    if (!fallbackSaved)
      throw new Error("No se pudo guardar el progreso en este navegador.");
  }
}

export function loadSettings(): GameSettings {
  try {
    return {
      ...DEFAULT_SETTINGS,
      ...JSON.parse(localStorage.getItem("raton-z-settings") || "{}"),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: GameSettings) {
  try {
    localStorage.setItem("raton-z-settings", JSON.stringify(settings));
  } catch {
    /* Settings remain available in memory. */
  }
}
