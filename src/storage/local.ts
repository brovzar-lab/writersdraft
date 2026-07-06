/**
 * Durable local persistence on IndexedDB. localStorage cannot hold a
 * feature-length script plus its version timeline (~5MB quota), so IndexedDB
 * is the store of record; a namespaced localStorage fallback keeps
 * persistence alive in environments without IndexedDB.
 *
 * Object stores:
 *   scripts    – full Script documents keyed by script id
 *   timelines  – delta-encoded version timelines keyed by script id
 *   meta       – small key/value pairs (current script id, migration flags)
 */
import type { Script } from '../types'
import type { StoredTimeline } from '../engine/timelineCodec'

const DB_NAME = 'writersdraft'
const DB_VERSION = 1
const STORES = ['scripts', 'timelines', 'meta'] as const
type StoreName = (typeof STORES)[number]

const FALLBACK_PREFIX = 'writersdraft:idb-fallback:'

let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null)
        return
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = () => {
        for (const name of STORES) {
          if (!req.result.objectStoreNames.contains(name)) {
            req.result.createObjectStore(name)
          }
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function idbGet<T>(store: StoreName, key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          resolve(fallbackGet<T>(store, key))
          return
        }
        const req = db.transaction(store, 'readonly').objectStore(store).get(key)
        req.onsuccess = () => resolve((req.result as T | undefined) ?? null)
        req.onerror = () => reject(req.error)
      }),
  )
}

function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          fallbackPut(store, key, value)
          resolve()
          return
        }
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).put(value, key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.onabort = () => reject(tx.error ?? new Error('idb transaction aborted'))
      }),
  )
}

function idbDelete(store: StoreName, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          fallbackDelete(store, key)
          resolve()
          return
        }
        const tx = db.transaction(store, 'readwrite')
        tx.objectStore(store).delete(key)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      }),
  )
}

function idbGetAll<T>(store: StoreName): Promise<T[]> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        if (!db) {
          resolve(fallbackGetAll<T>(store))
          return
        }
        const req = db.transaction(store, 'readonly').objectStore(store).getAll()
        req.onsuccess = () => resolve(req.result as T[])
        req.onerror = () => reject(req.error)
      }),
  )
}

// --- localStorage fallback (only used when IndexedDB is unavailable) ---

function fallbackKey(store: StoreName, key: string): string {
  return `${FALLBACK_PREFIX}${store}:${key}`
}

function fallbackGet<T>(store: StoreName, key: string): T | null {
  try {
    const raw = localStorage.getItem(fallbackKey(store, key))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function fallbackPut(store: StoreName, key: string, value: unknown): void {
  localStorage.setItem(fallbackKey(store, key), JSON.stringify(value))
}

function fallbackDelete(store: StoreName, key: string): void {
  try {
    localStorage.removeItem(fallbackKey(store, key))
  } catch {
    // ignore
  }
}

function fallbackGetAll<T>(store: StoreName): T[] {
  const out: T[] = []
  try {
    const prefix = `${FALLBACK_PREFIX}${store}:`
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix)) {
        const raw = localStorage.getItem(k)
        if (raw) out.push(JSON.parse(raw) as T)
      }
    }
  } catch {
    // ignore
  }
  return out
}

// --- Public API ---

export interface LocalScriptMeta {
  id: string
  title: string
  updatedAt: number
  elementCount: number
}

export function putScript(script: Script): Promise<void> {
  return idbPut('scripts', script.id, script)
}

export function getScript(id: string): Promise<Script | null> {
  return idbGet<Script>('scripts', id)
}

export function deleteScript(id: string): Promise<void> {
  return idbDelete('scripts', id).then(() => idbDelete('timelines', id))
}

export async function listScripts(): Promise<LocalScriptMeta[]> {
  const all = await idbGetAll<Script>('scripts')
  return all
    .filter((s) => s && typeof s.id === 'string')
    .map((s) => ({
      id: s.id,
      title: s.titlePage?.title || 'Untitled',
      updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : 0,
      elementCount: Array.isArray(s.elements) ? s.elements.length : 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

export function putTimeline(scriptId: string, timeline: StoredTimeline): Promise<void> {
  return idbPut('timelines', scriptId, timeline)
}

export function getTimeline(scriptId: string): Promise<StoredTimeline | null> {
  return idbGet<StoredTimeline>('timelines', scriptId)
}

export function getMeta<T>(key: string): Promise<T | null> {
  return idbGet<T>('meta', key)
}

export function setMeta(key: string, value: unknown): Promise<void> {
  return idbPut('meta', key, value)
}

/**
 * One-time migration of the legacy localStorage save into IndexedDB.
 * The localStorage copy is deliberately left in place as a safety net —
 * migration must never be the step that loses a draft.
 */
export async function migrateLegacyLocalStorage(): Promise<Script | null> {
  try {
    const done = await getMeta<boolean>('legacyMigrated')
    if (done) return null
    const raw = localStorage.getItem('writersdraft:script')
    if (!raw) {
      await setMeta('legacyMigrated', true)
      return null
    }
    const script = JSON.parse(raw) as Script
    if (!script || typeof script.id !== 'string') {
      await setMeta('legacyMigrated', true)
      return null
    }
    const existing = await getScript(script.id)
    // Never overwrite a newer IndexedDB copy with the legacy one.
    if (!existing || (existing.updatedAt ?? 0) <= (script.updatedAt ?? 0)) {
      await putScript(script)
    }
    await setMeta('legacyMigrated', true)
    return script
  } catch {
    return null
  }
}
