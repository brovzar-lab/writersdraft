import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { importFdx, exportFdx } from "./fdx";
import { emptyScript, makeElement, newId } from "../stores/scriptStore";
import type { Script, ScriptElement } from "../types";

const shortFdx = readFileSync(
  new URL("./__fixtures__/short.fdx", import.meta.url),
  "utf8",
);
const dualFdx = readFileSync(
  new URL("./__fixtures__/dual.fdx", import.meta.url),
  "utf8",
);

/** The structural identity of a script for equivalence assertions. */
function shape(s: Script) {
  return {
    elements: s.elements.map((e: ScriptElement) => ({
      type: e.type,
      text: e.text,
      sceneNumber: e.sceneNumber ?? null,
      dual: e.dual ?? null,
    })),
    titlePage: s.titlePage,
    notes: s.notes.map((n) => ({
      text: n.text,
      // Notes must stay attached to the same structural element.
      elementIndex: s.elements.findIndex((e) => e.id === n.elementId),
    })),
  };
}

describe("FDX import", () => {
  it("imports the short fixture with correct types and exact text", () => {
    const s = importFdx(shortFdx);
    expect(s.elements.map((e) => e.type)).toEqual([
      "scene_heading",
      "action",
      "character",
      "parenthetical",
      "dialogue",
      "action",
      "character",
      "dialogue",
      "transition",
      "scene_heading",
      "action",
    ]);
    expect(s.elements[0].text).toBe("INT. DINER - NIGHT");
    // XML entities decode.
    expect(s.elements[1].text).toContain("EAT & RUN.");
    expect(s.elements[3].text).toBe("(without looking up)");
    expect(s.elements[8].text).toBe("CUT TO:");
  });

  it("imports the title page (title, author, draft date, contact)", () => {
    const s = importFdx(shortFdx);
    expect(s.titlePage.title).toBe("FOUR MINUTES");
    expect(s.titlePage.author).toBe("Billy Rovzar");
    expect(s.titlePage.draftDate).toBe("First Draft - July 2026");
    expect(s.titlePage.contact).toBe("billy@example.com");
  });

  it("ignores ElementSettings/SmartType/SceneProperties without leaking text", () => {
    const s = importFdx(shortFdx);
    const all = s.elements.map((e) => e.text).join("\n");
    expect(all).not.toContain("Courier Final Draft");
    expect(all).not.toContain("(V.O.)");
  });

  it("imports scene numbers, including letter-suffixed ones", () => {
    const s = importFdx(dualFdx);
    const headings = s.elements.filter((e) => e.type === "scene_heading");
    expect(headings.map((h) => h.sceneNumber)).toEqual(["1", "2", "2A"]);
  });

  it("imports dual dialogue with left/right column marks", () => {
    const s = importFdx(dualFdx);
    const dual = s.elements.filter((e) => e.dual);
    expect(dual.map((e) => [e.type, e.dual])).toEqual([
      ["character", "left"],
      ["dialogue", "left"],
      ["character", "right"],
      ["parenthetical", "right"],
      ["dialogue", "right"],
    ]);
    expect(dual[0].text).toBe("RIVERA");
    expect(dual[2].text).toBe("CHO");
    // Elements around the dual block are ordinary.
    expect(
      s.elements.filter((e) => !e.dual).every((e) => e.dual === undefined),
    ).toBe(true);
  });

  it("imports script notes attached to the right element", () => {
    const s = importFdx(dualFdx);
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].text).toBe(
      "Check with production: how many consoles fit on the set?",
    );
    const owner = s.elements.find((e) => e.id === s.notes[0].elementId)!;
    expect(owner.type).toBe("action");
    expect(owner.text).toContain("Banks of consoles");
    // The note text must not leak into the script body.
    expect(owner.text).not.toContain("production");
  });

  it("maps unknown paragraph types to general and rejects non-FDX XML", () => {
    const s = importFdx(
      '<?xml version="1.0"?><FinalDraft DocumentType="Script"><Content>' +
        '<Paragraph Type="Singing"><Text>La la la</Text></Paragraph>' +
        "</Content></FinalDraft>",
    );
    expect(s.elements[0]).toMatchObject({ type: "general", text: "La la la" });
    expect(() => importFdx('<?xml version="1.0"?><NotFdx/>')).toThrow(
      /Final Draft/,
    );
  });
});

describe("FDX export", () => {
  function sampleScript(): Script {
    const s = emptyScript();
    s.titlePage = {
      title: "THE HEIST",
      author: "Billy Rovzar",
      contact: "agent@example.com\n555-0100",
      draftDate: "Blue Draft",
    };
    s.elements = [
      makeElement("scene_heading", "INT. VAULT - DAY"),
      makeElement("action", "Lasers & mirrors <everywhere>."),
      makeElement("character", "MOSS"),
      makeElement("dialogue", "Nobody move."),
      makeElement("transition", "CUT TO:"),
    ];
    s.elements[0].sceneNumber = "7";
    s.notes = [
      {
        id: newId(),
        elementId: s.elements[1].id,
        author: "Me",
        text: "Too on the nose?",
        createdAt: 1,
      },
    ];
    return s;
  }

  it("emits well-formed XML with correct paragraph types", () => {
    const xml = exportFdx(sampleScript());
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain(
      '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    );
    expect(xml).toContain(
      '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    );
    expect(xml).toContain('<Paragraph Type="Scene Heading" Number="7">');
    expect(xml).toContain('<Paragraph Type="Transition">');
    expect(xml).toContain("<TitlePage>");
  });

  it("escapes XML special characters in text and attributes", () => {
    const xml = exportFdx(sampleScript());
    expect(xml).toContain("Lasers &amp; mirrors &lt;everywhere&gt;.");
    expect(xml).not.toMatch(/<everywhere>/);
    const parsed = new XMLParser().parse(xml);
    expect(JSON.stringify(parsed)).toContain("Lasers & mirrors <everywhere>.");
  });

  it("wraps contiguous dual-marked elements in one DualDialogue container", () => {
    const s = emptyScript();
    s.elements = [
      makeElement("action", "They speak at once."),
      { ...makeElement("character", "A"), dual: "left" as const },
      { ...makeElement("dialogue", "One!"), dual: "left" as const },
      { ...makeElement("character", "B"), dual: "right" as const },
      { ...makeElement("dialogue", "Two!"), dual: "right" as const },
      makeElement("action", "Silence."),
    ];
    const xml = exportFdx(s);
    const opens = xml.match(/<DualDialogue>/g) ?? [];
    expect(opens).toHaveLength(1);
    // The dual block sits between the two action paragraphs.
    expect(xml.indexOf("<DualDialogue>")).toBeGreaterThan(
      xml.indexOf("They speak at once."),
    );
    expect(xml.indexOf("</DualDialogue>")).toBeLessThan(
      xml.indexOf("Silence."),
    );
  });

  it("exports script notes inside their owning paragraph", () => {
    const xml = exportFdx(sampleScript());
    const para = xml.slice(
      xml.indexOf('Type="Action"'),
      xml.indexOf('Type="Character"'),
    );
    expect(para).toContain("<ScriptNote");
    expect(para).toContain("Too on the nose?");
  });

  it("flattens internal newlines (FDX paragraphs cannot hard-break)", () => {
    const s = emptyScript();
    s.elements = [makeElement("action", "line one\nline two")];
    expect(exportFdx(s)).toContain("<Text>line one line two</Text>");
  });
});

describe("FDX round trip", () => {
  it("short fixture: import → export → re-import is structurally identical", () => {
    const first = importFdx(shortFdx);
    const second = importFdx(exportFdx(first));
    expect(shape(second)).toEqual(shape(first));
  });

  it("dual-dialogue fixture: full structural equivalence incl. scene numbers, dual, notes", () => {
    const first = importFdx(dualFdx);
    const second = importFdx(exportFdx(first));
    expect(shape(second)).toEqual(shape(first));
  });

  it("exported XML from a round trip validates and keeps paragraph count", () => {
    const first = importFdx(dualFdx);
    const xml = exportFdx(first);
    expect(XMLValidator.validate(xml)).toBe(true);
    const paragraphOpens = xml.match(/<Paragraph Type="/g) ?? [];
    // Every element plus one note paragraph plus title page paragraphs? No —
    // title-page paragraphs carry no Type attribute in our export.
    expect(paragraphOpens.length).toBe(
      first.elements.length + first.notes.length,
    );
  });
});
