/**
 * Firestore security-rules tests. Run against the emulator via
 * `npm run test:rules` (wraps vitest in `firebase emulators:exec`).
 *
 * Proves: an outsider cannot read or write someone else's script, presence
 * or (removed) history; ownerId cannot be hijacked on create or update;
 * only the owner edits the collaborators list; document shape and size are
 * bounded; creates are rate-limited to one per 5s per account.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  collection,
  writeBatch,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'

let env: RulesTestEnvironment

const OWNER = 'alice'
const COLLAB = 'carol'
const OUTSIDER = 'mallory'

function validScript(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    titlePage: { title: 'TEST', author: '', contact: '', draftDate: '' },
    elements: [{ id: 'e1', type: 'scene_heading', text: 'INT. TEST - DAY' }],
    locked: false,
    revisionColor: 'white',
    tags: [],
    notes: [],
    characters: [],
    sceneMeta: {},
    docs: [],
    updatedAt: 1,
    ownerId,
    savedAt: serverTimestamp(),
    ...extra,
  }
}

/** Create a script the way the client does: batched with a limiter bump. */
async function createScript(uid: string, id: string, extra: Record<string, unknown> = {}) {
  const db = env.authenticatedContext(uid).firestore()
  const batch = writeBatch(db)
  batch.set(doc(db, 'scripts', id), validScript(id, uid, extra))
  batch.set(doc(db, 'userMeta', uid), { lastCreateAt: serverTimestamp() })
  return batch.commit()
}

/** Seed data directly, bypassing rules (arrange step). */
async function seed(id: string, ownerId: string, extra: Record<string, unknown> = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), 'scripts', id), validScript(id, ownerId, extra))
  })
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'writersdraft-demo',
    firestore: { rules: readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8') },
  })
})

afterAll(async () => {
  await env.cleanup()
})

beforeEach(async () => {
  await env.clearFirestore()
})

describe('script access', () => {
  it('unauthenticated users can do nothing', async () => {
    await seed('s1', OWNER)
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, 'scripts', 's1')))
    await assertFails(setDoc(doc(db, 'scripts', 's1'), validScript('s1', OWNER)))
  })

  it('an outsider cannot read, update or delete someone else’s script', async () => {
    await seed('s1', OWNER)
    const db = env.authenticatedContext(OUTSIDER).firestore()
    await assertFails(getDoc(doc(db, 'scripts', 's1')))
    await assertFails(setDoc(doc(db, 'scripts', 's1'), validScript('s1', OWNER)))
    await assertFails(deleteDoc(doc(db, 'scripts', 's1')))
  })

  it('the owner can read and update; a collaborator can read and update', async () => {
    await seed('s1', OWNER, { collaborators: [COLLAB] })
    const owner = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(getDoc(doc(owner, 'scripts', 's1')))
    await assertSucceeds(
      setDoc(doc(owner, 'scripts', 's1'), validScript('s1', OWNER, { collaborators: [COLLAB], updatedAt: 2 })),
    )
    const collab = env.authenticatedContext(COLLAB).firestore()
    await assertSucceeds(getDoc(doc(collab, 'scripts', 's1')))
    await assertSucceeds(
      setDoc(doc(collab, 'scripts', 's1'), validScript('s1', OWNER, { collaborators: [COLLAB], updatedAt: 3 })),
    )
  })

  it('only the owner may delete', async () => {
    await seed('s1', OWNER, { collaborators: [COLLAB] })
    await assertFails(deleteDoc(doc(env.authenticatedContext(COLLAB).firestore(), 'scripts', 's1')))
    await assertSucceeds(deleteDoc(doc(env.authenticatedContext(OWNER).firestore(), 'scripts', 's1')))
  })
})

describe('ownership hijack', () => {
  it('cannot create a script owned by someone else', async () => {
    const db = env.authenticatedContext(OUTSIDER).firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, 'scripts', 'sX'), validScript('sX', OWNER))
    batch.set(doc(db, 'userMeta', OUTSIDER), { lastCreateAt: serverTimestamp() })
    await assertFails(batch.commit())
  })

  it('a collaborator cannot flip ownerId to themselves on update', async () => {
    await seed('s1', OWNER, { collaborators: [COLLAB] })
    const db = env.authenticatedContext(COLLAB).firestore()
    await assertFails(
      setDoc(doc(db, 'scripts', 's1'), validScript('s1', COLLAB, { collaborators: [COLLAB] })),
    )
  })

  it('even the owner cannot re-home the document', async () => {
    await seed('s1', OWNER)
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(setDoc(doc(db, 'scripts', 's1'), validScript('s1', OUTSIDER)))
  })

  it('only the owner may change the collaborators list', async () => {
    await seed('s1', OWNER, { collaborators: [COLLAB] })
    const collab = env.authenticatedContext(COLLAB).firestore()
    await assertFails(
      setDoc(
        doc(collab, 'scripts', 's1'),
        validScript('s1', OWNER, { collaborators: [COLLAB, OUTSIDER] }),
      ),
    )
    const owner = env.authenticatedContext(OWNER).firestore()
    await assertSucceeds(
      setDoc(doc(owner, 'scripts', 's1'), validScript('s1', OWNER, { collaborators: [COLLAB, 'dave'] })),
    )
  })
})

describe('document shape and size limits', () => {
  it('rejects foreign fields', async () => {
    await assertFails(createScript(OWNER, 's1', { superuser: true }))
  })

  it('rejects a mismatched embedded id', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    const batch = writeBatch(db)
    batch.set(doc(db, 'scripts', 's1'), validScript('OTHER-ID', OWNER))
    batch.set(doc(db, 'userMeta', OWNER), { lastCreateAt: serverTimestamp() })
    await assertFails(batch.commit())
  })

  it('rejects an oversized title and a non-list elements field', async () => {
    await assertFails(
      createScript(OWNER, 's1', {
        titlePage: { title: 'x'.repeat(301), author: '', contact: '', draftDate: '' },
      }),
    )
    await assertFails(createScript(OWNER, 's2', { elements: 'not-a-list' }))
  })

  it('rejects more than 25 collaborators', async () => {
    await assertFails(
      createScript(OWNER, 's1', { collaborators: Array.from({ length: 26 }, (_, i) => `u${i}`) }),
    )
  })
})

describe('create rate limiting', () => {
  it('rejects a create without the limiter bump in the same batch', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(setDoc(doc(db, 'scripts', 's1'), validScript('s1', OWNER)))
  })

  it('allows the first create and rejects an immediate second (spam-create)', async () => {
    await assertSucceeds(createScript(OWNER, 's1'))
    await assertFails(createScript(OWNER, 's2'))
  })

  it('the limiter is per-account: another user can still create', async () => {
    await assertSucceeds(createScript(OWNER, 's1'))
    await assertSucceeds(createScript(COLLAB, 's2'))
  })

  it('userMeta cannot be written for another user or with a fake timestamp', async () => {
    const db = env.authenticatedContext(OUTSIDER).firestore()
    await assertFails(setDoc(doc(db, 'userMeta', OWNER), { lastCreateAt: serverTimestamp() }))
    await assertFails(setDoc(doc(db, 'userMeta', OUTSIDER), { lastCreateAt: new Date(0) }))
  })
})

describe('presence', () => {
  beforeEach(async () => {
    await seed('s1', OWNER, { collaborators: [COLLAB] })
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'scripts', 's1', 'presence', OWNER), {
        userId: OWNER, name: 'Alice', color: '#f00', elementId: null, updatedAt: 1,
      })
    })
  })

  const presence = (userId: string) => ({
    userId, name: 'X', color: '#00f', elementId: 'e1', updatedAt: 2,
  })

  it('an outsider can neither read nor write presence', async () => {
    const db = env.authenticatedContext(OUTSIDER).firestore()
    await assertFails(getDocs(collection(db, 'scripts', 's1', 'presence')))
    await assertFails(
      setDoc(doc(db, 'scripts', 's1', 'presence', OUTSIDER), presence(OUTSIDER)),
    )
  })

  it('participants can read presence and write only their own document', async () => {
    const collab = env.authenticatedContext(COLLAB).firestore()
    await assertSucceeds(getDocs(collection(collab, 'scripts', 's1', 'presence')))
    await assertSucceeds(
      setDoc(doc(collab, 'scripts', 's1', 'presence', COLLAB), presence(COLLAB)),
    )
    // …but not someone else's presence document.
    await assertFails(
      setDoc(doc(collab, 'scripts', 's1', 'presence', OWNER), presence(OWNER)),
    )
    // …and not with a lying userId payload.
    await assertFails(
      setDoc(doc(collab, 'scripts', 's1', 'presence', COLLAB), presence(OWNER)),
    )
  })

  it('rejects presence documents with foreign fields', async () => {
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(
      setDoc(doc(db, 'scripts', 's1', 'presence', OWNER), {
        ...presence(OWNER), admin: true,
      }),
    )
  })
})

describe('removed history subcollection', () => {
  it('is unreadable and unwritable even for the owner', async () => {
    await seed('s1', OWNER)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'scripts', 's1', 'history', 'h1'), { x: 1 })
    })
    const db = env.authenticatedContext(OWNER).firestore()
    await assertFails(getDoc(doc(db, 'scripts', 's1', 'history', 'h1')))
    await assertFails(setDoc(doc(db, 'scripts', 's1', 'history', 'h2'), { x: 2 }))
    await assertFails(updateDoc(doc(db, 'scripts', 's1', 'history', 'h1'), { x: 3 }))
  })
})
