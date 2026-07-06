/**
 * Row-1 sync + account pill. Sync state lives here (a colored dot + word);
 * clicking opens a detail popover that, for a guest or offline session,
 * states plainly that the draft is on this device only and offers to create
 * an account. Linking an email keeps the same uid, so cloud scripts survive
 * cleared site data and follow the writer to new devices ("Sign in" recovers
 * them). This replaces the old standalone guest banner — the honesty moved,
 * it didn't disappear.
 */
import { useEffect, useRef, useState } from "react";
import { useUiStore } from "../stores/uiStore";

export interface AccountUser {
  uid: string;
  email: string | null;
  isAnonymous: boolean;
}

export function AccountMenu({
  user,
  onAuthChanged,
  syncState,
}: {
  user: AccountUser | null;
  onAuthChanged: () => void;
  syncState: string;
}) {
  // Open state lives in the UI store so other surfaces can open the pill.
  const open = useUiStore((s) => s.accountMenuOpen);
  const setOpen = useUiStore((s) => s.setAccountMenuOpen);
  const ref = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setOpen(false);
      setEmail("");
      setPassword("");
      onAuthChanged();
    } catch (e) {
      setError(
        e instanceof Error
          ? friendlyAuthError(e.message)
          : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const signedIn = !!user && !user.isAnonymous;
  const online = syncState === "synced";
  const dot = signedIn || online ? "#4ade80" : "#fbbf24";
  const label = signedIn
    ? "Synced"
    : online
      ? "Synced"
      : syncState === "offline"
        ? "Offline"
        : "Local only";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] text-chrome-ink-3 transition-colors hover:bg-chrome-raised hover:text-chrome-ink"
        aria-label={`Sync status: ${label}. Open account.`}
        aria-expanded={open}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: dot }}
        />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-40 mt-1.5 w-64 rounded-lg border border-line bg-surface p-3 text-xs shadow-[0_18px_48px_rgba(17,24,39,.28)]">
          {signedIn ? (
            <p className="text-ink-2">
              Signed in as <b className="text-ink">{user!.email}</b>. Your
              scripts sync to this account on any device.
            </p>
          ) : (
            <>
              <p className="mb-2 text-ink-2">
                {online
                  ? "You're writing as a guest — this draft's cloud copy is tied to this browser. Add an email to recover your work on any device."
                  : "Cloud sync is offline — this draft lives only in this browser right now. Add an account once you're online to protect it."}
              </p>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="email"
                className="mb-1.5 w-full rounded border border-line bg-transparent px-2 py-1 text-ink"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="password (6+ characters)"
                className="mb-2 w-full rounded border border-line bg-transparent px-2 py-1 text-ink"
              />
              {error && <p className="mb-2 text-on-error">{error}</p>}
              <div className="flex gap-2">
                <button
                  disabled={busy || !email || password.length < 6}
                  onClick={() =>
                    run(async () => {
                      const { linkWithEmail } = await import("../firebase/sync");
                      await linkWithEmail(email, password);
                    })
                  }
                  className="flex-1 rounded bg-accent px-2 py-1 text-on-accent hover:bg-accent-press disabled:opacity-40"
                >
                  Create account
                </button>
                <button
                  disabled={busy || !email || !password}
                  onClick={() =>
                    run(async () => {
                      const { signInWithEmail } =
                        await import("../firebase/sync");
                      await signInWithEmail(email, password);
                    })
                  }
                  className="flex-1 rounded border border-line px-2 py-1 text-ink-2 hover:bg-sunken disabled:opacity-40"
                >
                  Sign in
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function friendlyAuthError(message: string): string {
  if (
    message.includes("email-already-in-use") ||
    message.includes("credential-already-in-use")
  )
    return "That email already has an account — use Sign in instead.";
  if (
    message.includes("invalid-credential") ||
    message.includes("wrong-password")
  )
    return "Wrong email or password.";
  if (message.includes("weak-password"))
    return "Password needs at least 6 characters.";
  if (message.includes("invalid-email"))
    return "That email address looks invalid.";
  return "Could not reach the account service.";
}
