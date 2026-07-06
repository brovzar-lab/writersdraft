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
  getDocs,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  writeBatch,
  type Unsubscribe,
} from "firebase/firestore";
import {
  signInAnonymously,
  onAuthStateChanged,
  linkWithCredential,
  signInWithEmailAndPassword,
  EmailAuthProvider,
  type User,
} from "firebase/auth";
import { getFirebase } from "./config";
import type { Script } from "../types";

export async function ensureSignedIn(): Promise<User> {
  const { auth } = getFirebase();
  if (auth.currentUser) return auth.currentUser;
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export function watchAuth(cb: (user: User | null) => void): Unsubscribe {
  const { auth } = getFirebase();
  return onAuthStateChanged(auth, cb);
}

/** Current auth user (linking doesn't always fire onAuthStateChanged). */
export function currentUser(): User | null {
  return getFirebase().auth.currentUser;
}

/**
 * Upgrade the current anonymous session to an email/password account.
 * Linking keeps the same uid, so every script the anonymous user owns in
 * Firestore stays theirs — this is the recovery path for "cleared site
 * data" / "new device".
 */
export async function linkWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const { auth } = getFirebase();
  const user = auth.currentUser ?? (await ensureSignedIn());
  const cred = await linkWithCredential(
    user,
    EmailAuthProvider.credential(email, password),
  );
  return cred.user;
}

/** Sign in to an existing (previously linked) account, e.g. on a new device. */
export async function signInWithEmail(
  email: string,
  password: string,
): Promise<User> {
  const { auth } = getFirebase();
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export interface CloudScriptMeta {
  id: string;
  title: string;
  updatedAt: number;
}

/** List the cloud scripts owned by a user (for the library / recovery). */
export async function listCloudScripts(
  ownerId: string,
): Promise<CloudScriptMeta[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, "scripts"), where("ownerId", "==", ownerId)),
  );
  const out: CloudScriptMeta[] = [];
  snap.forEach((d) => {
    const data = d.data() as Partial<Script> & { ownerId?: string };
    noteRemote(d.id, data.ownerId);
    out.push({
      id: d.id,
      title: data.titlePage?.title || "Untitled",
      updatedAt: typeof data.updatedAt === "number" ? data.updatedAt : 0,
    });
  });
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

/**
 * Documents this session knows exist remotely, and who owns them. The
 * security rules make ownerId immutable and rate-limit creates, so the
 * client must (a) never stamp its own uid over an existing owner — a
 * collaborator's save would be rejected wholesale — and (b) pair each
 * genuine create with a userMeta rate-limiter bump in the same batch.
 */
const knownRemote = new Set<string>();
const remoteOwner = new Map<string, string>();

function noteRemote(scriptId: string, ownerId: unknown): void {
  knownRemote.add(scriptId);
  if (typeof ownerId === "string") remoteOwner.set(scriptId, ownerId);
}

export async function saveScript(
  script: Script,
  ownerId: string,
): Promise<void> {
  const { db } = getFirebase();
  // No merge: the client always writes the whole document. Merging maps
  // (sceneMeta) resurrected locally-deleted keys on the next load.
  const data = {
    ...script,
    ownerId: remoteOwner.get(script.id) ?? ownerId,
    savedAt: serverTimestamp(),
  };
  const ref = doc(db, "scripts", script.id);
  if (knownRemote.has(script.id)) {
    await setDoc(ref, data);
    return;
  }
  // First save of this document: a create must bump the caller's rate
  // limiter in the same batch or the rules reject it.
  const batch = writeBatch(db);
  batch.set(ref, data);
  batch.set(doc(db, "userMeta", data.ownerId), {
    lastCreateAt: serverTimestamp(),
  });
  await batch.commit();
  noteRemote(script.id, data.ownerId);
}

export async function loadScript(scriptId: string): Promise<Script | null> {
  const { db } = getFirebase();
  const snap = await getDoc(doc(db, "scripts", scriptId));
  if (!snap.exists()) return null;
  const data = snap.data() as Script & { ownerId?: string };
  noteRemote(scriptId, data.ownerId);
  return data;
}

export function subscribeToScript(
  scriptId: string,
  onRemote: (script: Script) => void,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(
    doc(db, "scripts", scriptId),
    (snap) => {
      if (!snap.exists() || snap.metadata.hasPendingWrites) return;
      const data = snap.data() as Script & { ownerId?: string };
      noteRemote(scriptId, data.ownerId);
      onRemote(data);
    },
    () => {
      // Permission denied (not signed in to the owning account yet) or
      // offline. The subscription is re-established on the next auth change.
    },
  );
}

export interface PresenceInfo {
  userId: string;
  name: string;
  color: string;
  elementId: string | null;
  updatedAt: number;
}

export async function publishPresence(
  scriptId: string,
  info: PresenceInfo,
): Promise<void> {
  const { db } = getFirebase();
  await setDoc(doc(db, "scripts", scriptId, "presence", info.userId), info);
}

export function subscribePresence(
  scriptId: string,
  onUpdate: (peers: PresenceInfo[]) => void,
): Unsubscribe {
  const { db } = getFirebase();
  return onSnapshot(
    collection(db, "scripts", scriptId, "presence"),
    (snap) => {
      const now = Date.now();
      const peers: PresenceInfo[] = [];
      snap.forEach((d) => {
        const p = d.data() as PresenceInfo;
        if (now - p.updatedAt < 60_000) peers.push(p);
      });
      onUpdate(peers);
    },
    () => {
      // Presence is best-effort; a denied or dropped stream is fine.
    },
  );
}
