/**
 * Cloud sync + realtime collaboration over Firestore.
 *
 * - saveScript/loadScript: whole-document persistence (debounced by caller)
 * - subscribeToScript: live updates for co-writing; last-write-wins per save,
 *   remote snapshots newer than local state are loaded into the store
 * - presence: per-user cursor + activity heartbeat in a subcollection
 */
import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  collection,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { signInAnonymously, onAuthStateChanged, type User } from 'firebase/auth'
import { getFirebase } from './config'
import type { Script } from '../types'

export async function ensureSignedIn(): Promise<User> {
  const { auth } = getFirebase()
  if (auth.currentUser) return auth.currentUser
  const cred = await signInAnonymously(auth)
  return cred.user
}

export function watchAuth(cb: (user: User | null) => void): Unsubscribe {
  const { auth } = getFirebase()
  return onAuthStateChanged(auth, cb)
}

export async function saveScript(script: Script, ownerId: string): Promise<void> {
  const { db } = getFirebase()
  await setDoc(
    doc(db, 'scripts', script.id),
    { ...script, ownerId, savedAt: serverTimestamp() },
    { merge: true },
  )
}

export async function loadScript(scriptId: string): Promise<Script | null> {
  const { db } = getFirebase()
  const snap = await getDoc(doc(db, 'scripts', scriptId))
  if (!snap.exists()) return null
  return snap.data() as Script
}

export function subscribeToScript(
  scriptId: string,
  onRemote: (script: Script) => void,
): Unsubscribe {
  const { db } = getFirebase()
  return onSnapshot(doc(db, 'scripts', scriptId), (snap) => {
    if (!snap.exists() || snap.metadata.hasPendingWrites) return
    onRemote(snap.data() as Script)
  })
}

export interface PresenceInfo {
  userId: string
  name: string
  color: string
  elementId: string | null
  updatedAt: number
}

export async function publishPresence(
  scriptId: string,
  info: PresenceInfo,
): Promise<void> {
  const { db } = getFirebase()
  await setDoc(doc(db, 'scripts', scriptId, 'presence', info.userId), info)
}

export function subscribePresence(
  scriptId: string,
  onUpdate: (peers: PresenceInfo[]) => void,
): Unsubscribe {
  const { db } = getFirebase()
  return onSnapshot(collection(db, 'scripts', scriptId, 'presence'), (snap) => {
    const now = Date.now()
    const peers: PresenceInfo[] = []
    snap.forEach((d) => {
      const p = d.data() as PresenceInfo
      if (now - p.updatedAt < 60_000) peers.push(p)
    })
    onUpdate(peers)
  })
}
