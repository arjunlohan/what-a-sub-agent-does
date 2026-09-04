import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export type Domain = "data-extraction" | "code-edit" | "summarization" | "tool-selection" | "file-ops";

export type Item = {
  id: string;
  domain: Domain;
  salience: "blatant" | "subtle";
  /** The literal assignment the worker receives (I). */
  instruction: string;
  /** Where the input material comes from. */
  input:
    | { kind: "profiles"; ids: number[] }
    | { kind: "djinni"; ids: string[] }
    | { kind: "doc"; path: string }
    | { kind: "code"; files: string[] }
    | { kind: "inline"; text: string };
  /** V1: one sentence. */
  objective: string;
  /** V2: the orchestrator's own brief from its principal, verbatim. */
  parent_task: string;
  /** V3: sibling mandates. */
  siblings: string[];
  /** V4: orchestrator ledger lines. */
  ledger: string[];
  /** Domain-specific checker parameters (see checkers.ts). */
  check: Record<string, any>;
};

const ROOT = join(import.meta.dirname, "..");
export const PROBES = join(ROOT, "probes");
export const RUNS = join(ROOT, "runs");

/** ITEMS_DIR selects the item set (default "items", the pilot; "items-suite-a" for Suite A). */
export function loadItems(dirName: string = process.env.ITEMS_DIR ?? "items"): Item[] {
  const dir = join(PROBES, dirName);
  const items: Item[] = [];
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    items.push(...(JSON.parse(readFileSync(join(dir, f), "utf8")) as Item[]));
  }
  const ids = new Set<string>();
  for (const it of items) {
    if (ids.has(it.id)) throw new Error(`duplicate item id ${it.id}`);
    ids.add(it.id);
  }
  return items;
}

let profilesCache: Record<string, unknown>[] | null = null;
let djinniCache: Record<string, unknown>[] | null = null;
export function profiles(): Record<string, unknown>[] {
  return (profilesCache ??= JSON.parse(readFileSync(join(PROBES, "data", "profiles.json"), "utf8")));
}
export function djinni(): Record<string, unknown>[] {
  return (djinniCache ??= JSON.parse(readFileSync(join(PROBES, "data", "djinni.json"), "utf8")));
}
/** The path the worker sees: the stored path without the code/ or code-suite-a/ prefix. */
export const displayName = (rel: string) => rel.replace(/^code(-suite-a)?\//, "");
export function readData(rel: string): string {
  return readFileSync(join(PROBES, "data", rel), "utf8");
}

/** Render the input material exactly as the worker sees it (identical across conditions). */
export function renderInput(item: Item): string {
  const inp = item.input;
  switch (inp.kind) {
    case "profiles": {
      const rows = profiles().filter((r) => inp.ids.includes(Number(r.response_id)));
      if (rows.length !== inp.ids.length) throw new Error(`${item.id}: profile ids missing`);
      return `Input rows (JSON, one object per row):\n${rows.map((r) => JSON.stringify(r)).join("\n")}`;
    }
    case "djinni": {
      const rows = djinni().filter((r) => inp.ids.includes(String(r.id)));
      if (rows.length !== inp.ids.length) throw new Error(`${item.id}: djinni ids missing`);
      return `Input rows (JSON, one object per row):\n${rows.map((r) => JSON.stringify(r)).join("\n")}`;
    }
    case "doc":
      return `Input document (${inp.path}):\n<<<DOCUMENT\n${readData(inp.path)}\nDOCUMENT>>>`;
    case "code":
      return inp.files
        .map((f) => { const d = displayName(f); return `File ${d}:\n<<<FILE ${d}\n${readData(f)}\nFILE>>>`; })
        .join("\n\n");
    case "inline":
      return inp.text;
  }
}
