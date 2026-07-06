/**
 * First-run teaching card: shown above the page while the script is still
 * pristine. Tab/Enter IS the product — a new writer must learn it in ten
 * seconds. Offers a sample scene (one undo step) and dismisses forever.
 */
import { useState } from "react";
import { useScriptStore, makeElement } from "../stores/scriptStore";
import { useUiStore } from "../stores/uiStore";
import { IconZap } from "./icons";

const SEEN_KEY = "writersdraft:cheatSeen";

function sampleElements() {
  return [
    makeElement("scene_heading", "INT. WRITERS ROOM - DAY"),
    makeElement(
      "action",
      "A blank page glows on the monitor. YOU, a writer with a great idea, crack your knuckles.",
    ),
    makeElement("character", "MENTOR (V.O.)"),
    makeElement("parenthetical", "(warmly)"),
    makeElement(
      "dialogue",
      "Tab and Enter. That's the whole trick. Enter moves the story forward, Tab changes what kind of line you're on.",
    ),
    makeElement("action", "You try it. It works. The page starts to fill."),
    makeElement("transition", "CUT TO:"),
    makeElement("scene_heading", "INT. WRITERS ROOM - NIGHT"),
    makeElement(
      "action",
      "Coffee cups everywhere. Page 90. You don't even look at the toolbar anymore.",
    ),
  ];
}

export function FirstRunCard() {
  const [seen, setSeen] = useState(() => {
    try {
      return localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      return false;
    }
  });
  const pristine = useScriptStore(
    (s) => s.script.elements.length === 1 && s.script.elements[0].text === "",
  );

  if (seen || !pristine) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {
      /* private mode — session-only dismissal */
    }
    setSeen(true);
  };

  const insertSample = () => {
    const store = useScriptStore.getState();
    const first = store.script.elements[0];
    const parts = sampleElements();
    store.pasteElements(first.id, 0, parts);
    useUiStore
      .getState()
      .requestCaret(
        parts[parts.length - 1].id,
        parts[parts.length - 1].text.length,
      );
    dismiss();
  };

  return (
    <div
      data-testid="first-run-card"
      className="card no-print w-[34rem] max-w-[90vw] p-4 font-ui"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <IconZap size={14} className="text-accent" /> Write without touching the
        mouse
      </h2>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs text-ink-2">
        <dt>
          <Key>Enter</Key>
        </dt>
        <dd>next element — Scene Heading → Action, Character → Dialogue…</dd>
        <dt>
          <Key>Tab</Key>
        </dt>
        <dd>sibling element — Action → Character, Dialogue → Parenthetical…</dd>
        <dt>
          <Key>int.</Key>
        </dt>
        <dd>
          just type it — headings, transitions and shots are auto-detected
        </dd>
        <dt>
          <Key>Ctrl K</Key>
        </dt>
        <dd>jump to any scene or command</dd>
        <dt>
          <Key>Ctrl P</Key>
        </dt>
        <dd>print a submittable PDF</dd>
      </dl>
      <div className="mt-4 flex gap-2">
        <button
          onClick={insertSample}
          className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-on-accent hover:bg-accent-press"
        >
          Start with a sample scene
        </button>
        <button
          onClick={dismiss}
          className="rounded-md border border-line px-3 py-1.5 text-xs text-ink-2 hover:border-line hover:text-ink"
        >
          Got it — blank page
        </button>
      </div>
    </div>
  );
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-ui text-[10px] font-medium text-ink-2">
      {children}
    </kbd>
  );
}
