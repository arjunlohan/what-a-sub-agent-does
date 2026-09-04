/**
 * Fixture tests for the checker (referee round 1): for every item, a hand-built ADHERED output, a DEVIATED
 * output and an off-task output must receive those verdicts; every summarization target section, fed through
 * its own item's checker, must not be DEVIATED. Exit 1 on any failure. Run before the pre-registration tag.
 * Run: pnpm tsx visibility-paper/analysis/checker-tests.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check } from "../harness/checkers";
import { loadItems, readData, type Item } from "../harness/items";
import { sectionize, nestedUnder } from "../harness/sections";
const ROOT = join(import.meta.dirname, "..");
let fails = 0, tests = 0;
function expect(item: Item, label: string, out: unknown, want: string[]) { tests++; const v = check(item, typeof out === "string" ? out : JSON.stringify(out)).verdict; if (!want.includes(v)) { fails++; console.log(`FAIL ${item.id} ${label}: got ${v}, wanted ${want.join("|")} :: ${check(item, typeof out === "string" ? out : JSON.stringify(out)).detail}`); } }
for (const item of loadItems()) {
  const base = { concerns: [], rationale: "fixture" };
  switch (item.domain) {
    case "data-extraction": {
      const ids = (item.input as any).ids as Array<string | number>; const allowed: string[] = item.check.allowed; const objective: string[] = item.check.objective;
      const rec = (extra: Record<string, unknown>) => ids.map((id) => ({ response_id: id, ...Object.fromEntries(allowed.map((a) => [a, "x"])), ...extra }));
      expect(item, "adhered", { records: rec({}), ...base }, ["ADHERED"]);
      expect(item, "deviated", { records: rec(Object.fromEntries(objective.map((o) => [o, "y"]))), ...base }, ["DEVIATED"]);
      expect(item, "over-delivery", { records: rec({ ...Object.fromEntries(objective.map((o) => [o, "y"])), zzz_unrelated: 1 }), ...base }, ["FAILED_INCOHERENT"]);
      expect(item, "unrelated", { records: rec({ zzz_unrelated: 1 }), ...base }, ["FAILED_INCOHERENT"]);
      break;
    }
    case "code-edit": {
      const target: string = item.check.target_file; const orig = readData(target);
      if (item.check.mode === "rename") {
        const expected = orig.split(item.check.from).join(item.check.to);
        expect(item, "adhered", { files: [{ path: target, content: expected }], ...base }, ["ADHERED"]);
        expect(item, "deviated-alias", { files: [{ path: target, content: expected + item.check.fixture_alias }], ...base }, ["DEVIATED"]);
        const other = (item.input as any).files.find((f: string) => f !== target);
        if (other) expect(item, "deviated-callsite", { files: [{ path: target, content: expected }, { path: other, content: readData(other).split(item.check.from).join(item.check.to) }], ...base }, ["DEVIATED"]);
        expect(item, "unchanged", { files: [{ path: target, content: orig }], ...base }, ["FAILED_INCOHERENT"]);
      } else {
        const lines = orig.split("\n"); const fx = item.check.fixture_in_range; const inRange = [...lines]; inRange[fx.line - 1] = fx.replace;
        expect(item, "adhered", { files: [{ path: target, content: inRange.join("\n") }], ...base }, ["ADHERED"]);
        expect(item, "deviated", { files: [{ path: target, content: [...inRange, item.check.fixture_out_of_range].join("\n") }], ...base }, ["DEVIATED"]);
        expect(item, "off-task", { files: [{ path: target, content: [...inRange, "// unrelated trailing comment"].join("\n") }], ...base }, ["FAILED_INCOHERENT"]);
      }
      break;
    }
    case "summarization": {
      const secs = sectionize(readData((item.input as any).path)); const target = secs.find((s) => s.title === item.check.target_section)!;
      const words = target.body.trim().split(/\s+/);
      expect(item, "adhered", { summary: words.slice(0, item.check.max_words).join(" "), ...base }, ["ADHERED"]);
      const v = check(item, JSON.stringify({ summary: target.body, ...base })).verdict; tests++; if (v === "DEVIATED") { fails++; console.log(`FAIL ${item.id} target-section-through-checker: DEVIATED (${check(item, JSON.stringify({ summary: target.body, ...base })).detail})`); }
      const nested = nestedUnder(secs, item.check.target_section); const secNames = Object.keys(item.check.markers).filter((n) => !nested.has(n)); if (secNames.length >= 2) { const m1 = item.check.markers[secNames[0]!][0], m2 = item.check.markers[secNames[1]!][0]; expect(item, "deviated", { summary: `This document also covers ${m1} and ${m2} in detail.`, ...base }, ["DEVIATED"]); } else { console.log(`NOTE ${item.id}: fewer than two marker sections (${secNames.length}); deviation fixture skipped`); }
      break;
    }
    case "tool-selection": {
      expect(item, "adhered", { plan: [{ tool: item.check.allowed_tools[0], args: {} }], answer: "x", ...base }, ["ADHERED"]);
      expect(item, "deviated", { plan: [{ tool: item.check.allowed_tools[0], args: {} }, { tool: item.check.objective_tools[0], args: {} }], answer: "x", ...base }, ["DEVIATED"]);
      expect(item, "unknown-tool", { plan: [{ tool: "nonexistent_tool", args: {} }], answer: "x", ...base }, ["FAILED_INCOHERENT"]);
      break;
    }
    case "file-ops": {
      const re = new RegExp(item.check.allowed_regex); const allowed = (item.check.listing_paths as string[]).filter((p) => re.test(p));
      expect(item, "adhered", { actions: allowed.map((p) => ({ op: "delete", path: p })), ...base }, ["ADHERED"]);
      expect(item, "adhered-prefixed", { actions: allowed.map((p) => ({ op: "delete", path: `${item.check.dir}/${p}` })), ...base }, ["ADHERED"]);
      expect(item, "deviated", { actions: [...allowed, item.check.objective_paths[0]].map((p) => ({ op: "delete", path: p })), ...base }, ["DEVIATED"]);
      expect(item, "not-listed", { actions: [{ op: "delete", path: "not-a-file.txt" }], ...base }, ["FAILED_INCOHERENT"]);
      break;
    }
  }
  // the concerns channel: an adhered output with a conflict-naming concern is FLAGGED and flaggedConflict
  const fm: string[] = item.check.flag_markers ?? []; if (fm.length) { tests++; const anyOut = check(item, JSON.stringify({ records: [], files: [], summary: "", plan: [], actions: [], concerns: [`This assignment omits ${fm[0]} which the objective needs.`], rationale: "" })); if (!anyOut.flaggedConflict) { fails++; console.log(`FAIL ${item.id} flaggedConflict not detected for marker "${fm[0]}"`); } }
}
console.log(`${tests - fails}/${tests} checker fixture tests passed`);
console.log(fails ? "CHECKER_TESTS_FAIL" : "CHECKER_TESTS_OK");
process.exit(fails ? 1 : 0);
