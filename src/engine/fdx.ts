/**
 * Final Draft (.fdx) import/export.
 *
 * FDX is XML: a <FinalDraft> root with a <Content> of typed <Paragraph>
 * elements whose Type attribute matches our element model almost 1:1
 * (Scene Heading / Action / Character / Parenthetical / Dialogue /
 * Transition / Shot / General). Beyond Fountain, FDX carries:
 *
 *  - scene numbers (Number attribute on Scene Heading paragraphs),
 *  - dual dialogue (<DualDialogue> wrapping two cue+speech columns),
 *  - script notes (<ScriptNote> inside the owning paragraph),
 *  - a real title page (<TitlePage><Content>…).
 *
 * All of those round-trip through the internal model. Sections Final Draft
 * regenerates itself (SmartType, ElementSettings, HeaderAndFooter, Revisions)
 * are ignored on import and omitted on export — emitting stale copies is how
 * exporters corrupt FD documents. Export is hand-built XML so the output
 * stays clean and minimal; import uses fast-xml-parser in order-preserving
 * mode (paragraph order IS the script).
 */
import { XMLParser } from "fast-xml-parser";
import type { ElementType, Script, ScriptElement, ScriptNote } from "../types";
import { emptyScript, makeElement, newId } from "../stores/scriptStore";

/* ---------------------------------- shared ---------------------------------- */

const FDX_TYPE_TO_ELEMENT: Record<string, ElementType> = {
  "Scene Heading": "scene_heading",
  Action: "action",
  Character: "character",
  Dialogue: "dialogue",
  Parenthetical: "parenthetical",
  Transition: "transition",
  Shot: "shot",
  General: "general",
  // Reasonable homes for FD types we don't model separately.
  "Cast List": "general",
  "New Act": "general",
  "End Of Act": "general",
  "Teaser/Act One": "general",
};

const ELEMENT_TO_FDX_TYPE: Record<ElementType, string> = {
  scene_heading: "Scene Heading",
  action: "Action",
  character: "Character",
  dialogue: "Dialogue",
  parenthetical: "Parenthetical",
  transition: "Transition",
  shot: "Shot",
  general: "General",
};

/* ---------------------------------- import ---------------------------------- */

/** fast-xml-parser preserveOrder node: { TagName: children[], ':@': attrs }. */
type XNode = Record<string, unknown>;

function nameOf(node: XNode): string {
  return Object.keys(node).find((k) => k !== ":@") ?? "";
}
function childrenOf(node: XNode): XNode[] {
  const kids = node[nameOf(node)];
  return Array.isArray(kids) ? (kids as XNode[]) : [];
}
function attrsOf(node: XNode): Record<string, string> {
  return (node[":@"] as Record<string, string>) ?? {};
}

/** Concatenated content of every <Text> run directly under `node`. */
function textOf(node: XNode): string {
  let out = "";
  for (const child of childrenOf(node)) {
    if (nameOf(child) === "Text") {
      for (const t of childrenOf(child)) {
        if (nameOf(t) === "#text") out += String((t as XNode)["#text"]);
      }
    }
  }
  return out;
}

/** Text of the paragraphs inside a <ScriptNote>, newline-joined. */
function noteTextOf(scriptNote: XNode): string {
  const parts: string[] = [];
  for (const child of childrenOf(scriptNote)) {
    if (nameOf(child) === "Paragraph") parts.push(textOf(child));
  }
  return parts.join("\n").trim();
}

function findChild(node: XNode, name: string): XNode | null {
  return childrenOf(node).find((c) => nameOf(c) === name) ?? null;
}

interface ImportedParagraph {
  element: ScriptElement;
  notes: string[];
}

function importParagraph(p: XNode): ImportedParagraph | null {
  const attrs = attrsOf(p);
  const fdxType = attrs["@_Type"] ?? "Action";
  const type = FDX_TYPE_TO_ELEMENT[fdxType] ?? "general";
  const element = makeElement(type, textOf(p));
  const num = attrs["@_Number"];
  if (type === "scene_heading" && num != null && String(num) !== "") {
    element.sceneNumber = String(num);
  }
  const notes: string[] = [];
  for (const child of childrenOf(p)) {
    if (nameOf(child) === "ScriptNote") {
      const t = noteTextOf(child);
      if (t) notes.push(t);
    }
  }
  return { element, notes };
}

/** Best-effort title page extraction (title / by-line author / date / contact). */
function importTitlePage(tp: XNode, script: Script): void {
  const content = findChild(tp, "Content");
  if (!content) return;
  const lines: Array<{ text: string; centered: boolean }> = [];
  for (const p of childrenOf(content)) {
    if (nameOf(p) !== "Paragraph") continue;
    const align = attrsOf(p)["@_Alignment"] ?? "";
    lines.push({ text: textOf(p), centered: align === "Center" });
  }
  const nonEmpty = lines.filter((l) => l.text.trim() !== "");
  if (nonEmpty.length === 0) return;
  script.titlePage.title = nonEmpty[0].text.trim();
  const byIdx = nonEmpty.findIndex((l) =>
    /^(written\s+)?by$/i.test(l.text.trim()),
  );
  if (byIdx >= 0 && nonEmpty[byIdx + 1]) {
    script.titlePage.author = nonEmpty[byIdx + 1].text.trim();
    const after = nonEmpty.slice(byIdx + 2);
    const dateLine = after.find((l) => l.centered);
    if (dateLine) script.titlePage.draftDate = dateLine.text.trim();
    const contact = after.filter((l) => !l.centered).map((l) => l.text);
    if (contact.length) script.titlePage.contact = contact.join("\n");
  }
}

/** Parse a .fdx document into a fresh Script. Throws on malformed XML. */
export function importFdx(xml: string): Script {
  const parser = new XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
  });
  const doc = parser.parse(xml) as XNode[];
  const root = doc.find((n) => nameOf(n) === "FinalDraft");
  if (!root)
    throw new Error("Not a Final Draft document (missing <FinalDraft> root)");

  const script = emptyScript();
  script.id = newId();
  const elements: ScriptElement[] = [];
  const notes: ScriptNote[] = [];

  const attach = (imp: ImportedParagraph | null, dual?: "left" | "right") => {
    if (!imp) return;
    if (dual) imp.element.dual = dual;
    elements.push(imp.element);
    for (const text of imp.notes) {
      notes.push({
        id: newId(),
        elementId: imp.element.id,
        author: "Final Draft",
        text,
        createdAt: Date.now(),
      });
    }
  };

  const content = findChild(root, "Content");
  if (content) {
    for (const node of childrenOf(content)) {
      const name = nameOf(node);
      if (name === "Paragraph") {
        attach(importParagraph(node));
      } else if (name === "DualDialogue") {
        // Two cue+speech columns; everything before the second Character
        // cue is the left column.
        let cues = 0;
        for (const inner of childrenOf(node)) {
          if (nameOf(inner) !== "Paragraph") continue;
          const imp = importParagraph(inner);
          if (!imp) continue;
          if (imp.element.type === "character") cues++;
          attach(imp, cues >= 2 ? "right" : "left");
        }
      }
      // Anything else inside Content (page breaks, etc.) is skipped.
    }
  }

  const tp = findChild(root, "TitlePage");
  if (tp) importTitlePage(tp, script);

  script.elements = elements.length ? elements : script.elements;
  script.notes = notes;
  return script;
}

/* ---------------------------------- export ---------------------------------- */

function escText(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function escAttr(s: string): string {
  return escText(s).replace(/"/g, "&quot;");
}

/**
 * FDX paragraphs cannot contain hard line breaks; internal newlines become
 * spaces (the only lossy step in the round trip).
 */
function flatText(s: string): string {
  return s.replace(/\n+/g, " ");
}

function paragraphXml(
  el: ScriptElement,
  script: Script,
  indent: string,
): string {
  const attrs: string[] = [`Type="${ELEMENT_TO_FDX_TYPE[el.type]}"`];
  if (el.type === "scene_heading" && el.sceneNumber) {
    attrs.push(`Number="${escAttr(el.sceneNumber)}"`);
  }
  const noteXml = script.notes
    .filter((n) => n.elementId === el.id && n.text.trim() !== "")
    .map(
      (n) =>
        `${indent}  <ScriptNote Id="${escAttr(n.id)}">\n` +
        `${indent}    <Paragraph Type="General">\n` +
        `${indent}      <Text>${escText(flatText(n.text))}</Text>\n` +
        `${indent}    </Paragraph>\n` +
        `${indent}  </ScriptNote>\n`,
    )
    .join("");
  return (
    `${indent}<Paragraph ${attrs.join(" ")}>\n` +
    noteXml +
    `${indent}  <Text>${escText(flatText(el.text))}</Text>\n` +
    `${indent}</Paragraph>\n`
  );
}

function titlePageXml(script: Script): string {
  const tp = script.titlePage;
  const line = (text: string, centered: boolean) =>
    `      <Paragraph${centered ? ' Alignment="Center"' : ""}>\n` +
    `        <Text>${escText(text)}</Text>\n` +
    `      </Paragraph>\n`;
  let out = "";
  out += line(tp.title || "UNTITLED", true);
  out += line("", true);
  if (tp.author) {
    out += line("written by", true);
    out += line(tp.author, true);
  }
  if (tp.draftDate) {
    out += line("", true);
    out += line(tp.draftDate, true);
  }
  for (const contactLine of (tp.contact || "").split("\n")) {
    if (contactLine.trim() !== "") out += line(contactLine, false);
  }
  return `  <TitlePage>\n    <Content>\n${out}    </Content>\n  </TitlePage>\n`;
}

/** Serialise a Script as a clean, minimal Final Draft .fdx document. */
export function exportFdx(script: Script): string {
  let body = "";
  const els = script.elements;
  let i = 0;
  while (i < els.length) {
    if (els[i].dual) {
      body += "    <DualDialogue>\n";
      while (i < els.length && els[i].dual) {
        body += paragraphXml(els[i], script, "      ");
        i++;
      }
      body += "    </DualDialogue>\n";
    } else {
      body += paragraphXml(els[i], script, "    ");
      i++;
    }
  }
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>\n' +
    '<FinalDraft DocumentType="Script" Template="No" Version="5">\n' +
    "  <Content>\n" +
    body +
    "  </Content>\n" +
    titlePageXml(script) +
    "</FinalDraft>\n"
  );
}
