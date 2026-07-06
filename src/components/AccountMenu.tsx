/**
 * Account chip in the toolbar. Anonymous users can link an email/password
 * to their session — linking keeps the same uid, so cloud scripts survive
 * cleared site data and follow the writer to new devices, where "Sign in"
 * recovers them.
 */
import { useState } from 'react'

export interface AccountUser {
  uid: string
  email: string | null
  isAnonymous: boolean
}

export function AccountMenu({
  user,
  onAuthChanged,
}: {
  user: AccountUser | null
  onAuthChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setOpen(false)
      setEmail('')
      setPassword('')
      onAuthChanged()
    } catch (e) {
      setError(e instanceof Error ? friendlyAuthError(e.message) : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const label = user ? (user.isAnonymous ? 'Guest' : user.email ?? 'Account') : 'Offline'

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`rounded px-1.5 py-0.5 text-xs border ${
          user && !user.isAnonymous
            ? 'border-green-300 text-green-600'
            : 'border-gray-200 dark:border-slate-600'
        }`}
        title="Account"
      >
        👤 {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-3 text-xs shadow-lg">
          {user && !user.isAnonymous ? (
            <p className="text-gray-600 dark:text-gray-300">
              Signed in as <b>{user.email}</b>. Your scripts sync to this account on any device.
            </p>
          ) : (
            <>
              <p className="mb-2 text-gray-600 dark:text-gray-300">
                {user
                  ? 'Your cloud copy is tied to this browser. Add an email so you can recover your scripts anywhere.'
                  : 'Cloud sync is offline. You can still link an account once a connection is available.'}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                className="mb-1.5 w-full rounded border border-gray-200 dark:border-slate-600 bg-transparent px-2 py-1"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password (6+ characters)"
                className="mb-2 w-full rounded border border-gray-200 dark:border-slate-600 bg-transparent px-2 py-1"
              />
              {error && <p className="mb-2 text-red-500">{error}</p>}
              <div className="flex gap-2">
                <button
                  disabled={busy || !email || password.length < 6}
                  onClick={() =>
                    run(async () => {
                      const { linkWithEmail } = await import('../firebase/sync')
                      await linkWithEmail(email, password)
                    })
                  }
                  className="flex-1 rounded bg-blue-500 px-2 py-1 text-white disabled:opacity-40"
                >
                  Create account
                </button>
                <button
                  disabled={busy || !email || !password}
                  onClick={() =>
                    run(async () => {
                      const { signInWithEmail } = await import('../firebase/sync')
                      await signInWithEmail(email, password)
                    })
                  }
                  className="flex-1 rounded border border-gray-300 dark:border-slate-600 px-2 py-1 disabled:opacity-40"
                >
                  Sign in
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function friendlyAuthError(message: string): string {
  if (message.includes('email-already-in-use') || message.includes('credential-already-in-use'))
    return 'That email already has an account — use Sign in instead.'
  if (message.includes('invalid-credential') || message.includes('wrong-password'))
    return 'Wrong email or password.'
  if (message.includes('weak-password')) return 'Password needs at least 6 characters.'
  if (message.includes('invalid-email')) return 'That email address looks invalid.'
  return 'Could not reach the account service.'
}
