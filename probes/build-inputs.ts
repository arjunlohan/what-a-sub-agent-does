/**
 * Dump real, seeded samples of the two corpora into probes/data for probe
 * authoring. Deterministic: ORDER BY RAND(seed) with an explicit projection
 * (the sIVM paper found MySQL seeded RAND depends on the projection list).
 * Run from the repo root: pnpm tsx visibility-paper/probes/build-inputs.ts
 */
import { writeFileSync } from "node:fs";
import mysql from "mysql2/promise";
const MYSQL_URL = process.env.LORE_MYSQL_URL ?? "mysql://root@localhost:3306/lore";
const db = await mysql.createConnection({ uri: MYSQL_URL });
const [profiles] = await db.query(
  `SELECT response_id, main_branch, age, employment, remote_work, ed_level, years_code_pro, dev_type, org_size, country, converted_comp_yearly, languages, ai_sent, work_exp, industry
   FROM profiles WHERE converted_comp_yearly IS NOT NULL AND country IS NOT NULL AND dev_type IS NOT NULL AND industry IS NOT NULL
   ORDER BY RAND(42) LIMIT ${Number(process.env.PROFILES ?? 60)}`,
);
writeFileSync("visibility-paper/probes/data/profiles.json", JSON.stringify(profiles, null, 1));
const [cols] = await db.query(`SHOW COLUMNS FROM djinni_profiles`);
const names = (cols as Array<{ Field: string }>).map((c) => c.Field);
const [djinni] = await db.query(`SELECT ${names.map((n) => `\`${n}\``).join(", ")} FROM djinni_profiles ORDER BY RAND(42) LIMIT ${Number(process.env.DJINNI ?? 40)}`);
writeFileSync("visibility-paper/probes/data/djinni.json", JSON.stringify(djinni, null, 1));
await db.end();
console.log(JSON.stringify({ profiles: (profiles as unknown[]).length, djinni: (djinni as unknown[]).length, djinniColumns: names }));
