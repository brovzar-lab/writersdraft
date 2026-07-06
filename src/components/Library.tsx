/**
 * Script library: every script in this browser (IndexedDB) plus, when signed
 * in, the cloud copies owned by this account — the recovery path for a new
 * device or cleared site data.
 */
import { useEffect, useState } from "react";
import { listScripts, type LocalScriptMeta } from "../storage/local";
import { useScriptStore } from "../stores/scriptStore";
import type { CloudScriptMeta } from "../firebase/sync";

export interface LibraryProps {
  userId: string | null;
  onOpen: (scriptId: string) => void;
  onNew: () => void;
  onDelete: (scriptId: string) => void;
}

export function Library({ userId, onOpen, onNew, onDelete }: LibraryProps) {
  const currentId = useScriptStore((s) => s.script.id);
  const [local, setLocal] = useState<LocalScriptMeta[] | null>(null);
  const [cloud, setCloud] = useState<CloudScriptMeta[] | null>(null);
  const [cloudError, setCloudError] = useState(false);

  const refresh = () => {
    listScripts()
      .then(setLocal)
      .catch(() => setLocal([]));
    if (userId) {
      import("../firebase/sync")
        .then(({ listCloudScripts }) => listCloudScripts(userId))
        .then(setCloud)
        .catch(() => setCloudError(true));
    }
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(refresh, [userId, currentId]);

  const localIds = new Set((local ?? []).map((s) => s.id));
  const cloudOnly = (cloud ?? []).filter((c) => !localIds.has(c.id));

  return (
    <div className="mx-auto max-w-2xl p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Scripts</h1>
          <p className="text-sm text-ink-3">
            Stored in this browser{userId ? " and synced to your account" : ""}.
          </p>
        </div>
        <button
          onClick={onNew}
          className="rounded bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-press"
        >
          + New script
        </button>
      </div>

      {local === null && <p className="text-sm text-ink-3">Loading…</p>}
      {local !== null && local.length === 0 && cloudOnly.length === 0 && (
        <div className="mt-12 rounded-xl border border-dashed border-line p-8 text-center">
          <p className="text-sm font-medium text-ink-2">
            Your library is empty
          </p>
          <p className="mx-auto mt-1 max-w-sm text-xs text-ink-3">
            Every script you write lives here — stored in this browser, and in
            your account's cloud once you sign in. Start one and it appears
            automatically.
          </p>
          <button
            onClick={onNew}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-press"
          >
            Start your first script
          </button>
        </div>
      )}

      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {(local ?? []).map((s) => (
          <li
            key={s.id}
            className="card card-hover group flex items-center gap-3 p-3"
          >
            <button
              onClick={() => onOpen(s.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block truncate font-medium text-ink">
                {s.title}
                {s.id === currentId && (
                  <span className="ml-2 rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent-press">
                    open
                  </span>
                )}
              </span>
              <span className="text-xs text-ink-3">
                {s.updatedAt
                  ? new Date(s.updatedAt).toLocaleString()
                  : "never saved"}{" "}
                · {s.elementCount} elements
              </span>
            </button>
            {s.id !== currentId && (
              <button
                onClick={() => {
                  if (
                    window.confirm(
                      `Delete "${s.title}" from this browser? A cloud copy (if synced) is kept.`,
                    )
                  ) {
                    onDelete(s.id);
                    refresh();
                  }
                }}
                className="hidden rounded border border-line px-2 py-1 text-xs text-ink-3 hover:border-error/50 hover:text-on-error group-hover:block"
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>

      {userId && (
        <div className="mt-8">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-3">
            In the cloud only
          </h2>
          {cloudError && (
            <p className="text-xs text-ink-3">
              Couldn't reach the cloud library.
            </p>
          )}
          {cloud === null && !cloudError && (
            <p className="text-xs text-ink-3">Loading…</p>
          )}
          {cloud !== null && cloudOnly.length === 0 && (
            <p className="text-xs text-ink-3">
              Everything in the cloud is also on this device.
            </p>
          )}
          <ul className="flex flex-col gap-2">
            {cloudOnly.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded border border-dashed border-line p-3"
              >
                <button
                  onClick={() => onOpen(s.id)}
                  className="flex-1 text-left"
                >
                  <span className="block font-medium text-ink-2">
                    {s.title}
                  </span>
                  <span className="text-xs text-ink-3">
                    {s.updatedAt ? new Date(s.updatedAt).toLocaleString() : ""}{" "}
                    · download & open
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
