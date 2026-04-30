/**
 * solve.ts — CLI entry point for the plan-generation pipeline.
 *
 * Delegates all solver logic to pipeline.ts. Fixing the bugs in pipeline.ts
 * is sufficient to make both this script and the test suite produce correct
 * output.
 *
 * Run with:  npm run solve
 */

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { runSolver } from "./pipeline.js";

const db = new Database(resolve("db.sqlite"));

// Task 6: read a run tag from the command line, e.g. `npm run solve -- --tag=fall2024`
const tag = process.argv.find((a) => a.startsWith("--tag="))?.split("=")[1];
const seed = process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1];
const outputTag = tag ?? new Date().toISOString();
if (outputTag) console.log(`Using run tag: ${outputTag}`);
console.log(`Using random seed: ${seed ?? outputTag}`);
// TODO: generate a default tag if none is provided (e.g., new Date().toISOString())
// TODO: extend the schema, pipeline, and web layer to store and display the tag

console.log("Initializing Z3 solver…");

try {
  await runSolver(db, outputTag, { seed: seed ?? outputTag });
  db.close();
  console.log("Plan written to database. Run `npm start` to view it.");
} catch (err) {
  db.close();
  console.error((err as Error).message);
  process.exit(1);
}
