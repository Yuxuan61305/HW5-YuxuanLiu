/**
 * invariants.test.ts — end-to-end schedule invariant tests.
 *
 * These tests run the real solver pipeline against an in-memory database and
 * verify that the resulting plan satisfies correctness properties. Because the
 * pipeline is imported directly from src/solver/pipeline.ts, fixing a bug
 * there is sufficient to make the corresponding test pass.
 *
 * Task 4: add your invariant check to this file.
 *
 * Expected failures on the starter code (before bug fixes):
 *   - "all semesters are in range [1, 4]"      → Bug 3 (−1 parse offset)
 *   - "every prerequisite is respected"         → Bug 2 (le vs lt); then Bug 1 once Bug 2 is fixed
 *   - "no course shares a semester with prereq" → Bug 2 (le vs lt)
 *
 * Fix order: Task 3 → Task 2 → Task 1. Each fix removes one layer of failures.
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { getCourses } from "../src/db/queries.js";
import { runSolver } from "../src/solver/pipeline.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
const PLANNING_SEMESTERS = 4;
function buildTestDb() {
    const db = new Database(":memory:");
    db.exec(readFileSync(resolve(__dirname, "../src/db/schema.sql"), "utf-8"));
    db.exec(readFileSync(resolve(__dirname, "../src/db/seed.sql"), "utf-8"));
    return db;
}
// Query ALL prerequisites directly — no department filter. This is the ground
// truth the invariant checks run against, which is intentionally broader than
// what the buggy pipeline queries. That gap is how Bug 1 gets caught: the
// solver may produce a plan that satisfies the prerequisites it knew about
// (same-department only) while violating ones it didn't (cross-department).
function getAllPrereqs(db) {
    return db
        .prepare("SELECT course_id, prereq_id FROM prerequisites")
        .all();
}
function allowedSemestersForFrequency(frequency) {
    const allSemesters = Array.from({ length: PLANNING_SEMESTERS }, (_, i) => i + 1);
    switch (frequency) {
        case "every_second_year":
            return allSemesters.filter((semester) => semester <= 2 || semester >= 5);
        case "every_third_year":
            return allSemesters.filter((semester) => semester <= 2);
        default:
            return allSemesters;
    }
}
let plan;
let db;
const completedOrWaived = new Set(["cosi10a", "cosi12b", "cosi21a"]);
beforeAll(async () => {
    db = buildTestDb();
    plan = await runSolver(db);
}, 60_000);
describe("schedule invariants", () => {
    it("selects the seven future courses needed for the default BA plan", () => {
        expect(plan).toHaveLength(7);
        const ids = plan.map((r) => r.course_id);
        expect(new Set(ids).size).toBe(ids.length);
    });
    it("does not reschedule the completed first-year courses", () => {
        const ids = new Set(plan.map((r) => r.course_id));
        for (const completedId of completedOrWaived) {
            expect(ids.has(completedId), `${completedId} should already be satisfied`).toBe(false);
        }
    });
    it("includes the remaining BA core courses", () => {
        const ids = new Set(plan.map((r) => r.course_id));
        expect(ids.has("cosi29a")).toBe(true);
        expect(ids.has("cosi131a")).toBe(true);
    });
    it("includes a COSI oral communication option", () => {
        const ids = new Set(plan.map((r) => r.course_id));
        const ocOptions = ["cosi125a", "cosi126a", "cosi142a", "cosi159a", "cosi166b", "cosi167a"];
        expect(ocOptions.some((id) => ids.has(id))).toBe(true);
    });
    it("all semesters are in the valid range [1, 4]", () => {
        for (const row of plan) {
            expect(row.semester, `${row.course_id} has semester ${row.semester}`).toBeGreaterThanOrEqual(1);
            expect(row.semester, `${row.course_id} has semester ${row.semester}`).toBeLessThanOrEqual(PLANNING_SEMESTERS);
        }
    });
    it("uses all four semesters in the two-year plan", () => {
        const usedSemesters = new Set(plan.map((row) => row.semester));
        for (let semester = 1; semester <= PLANNING_SEMESTERS; semester += 1) {
            expect(usedSemesters.has(semester), `Semester ${semester} should have a COSI course`).toBe(true);
        }
    });
    it("every prerequisite is respected (prereq in strictly earlier semester)", () => {
        const allPrereqs = getAllPrereqs(db);
        const semOf = new Map(plan.map((r) => [r.course_id, r.semester]));
        for (const { course_id, prereq_id } of allPrereqs) {
            const courseSem = semOf.get(course_id);
            const prereqSem = semOf.get(prereq_id);
            if (courseSem === undefined)
                continue;
            if (prereqSem === undefined) {
                expect(completedOrWaived.has(prereq_id), `${prereq_id} must be planned or completed`).toBe(true);
                continue;
            }
            expect(courseSem, `${course_id} (sem ${courseSem}) should come after ${prereq_id} (sem ${prereqSem})`).toBeGreaterThan(prereqSem);
        }
    });
    it("no course shares a semester with its prerequisite", () => {
        const allPrereqs = getAllPrereqs(db);
        const semOf = new Map(plan.map((r) => [r.course_id, r.semester]));
        for (const { course_id, prereq_id } of allPrereqs) {
            const courseSem = semOf.get(course_id);
            const prereqSem = semOf.get(prereq_id);
            if (courseSem === undefined || prereqSem === undefined)
                continue;
            expect(courseSem, `${course_id} and ${prereq_id} must not be in the same semester`).not.toBe(prereqSem);
        }
    });
    it("no semester exceeds 16 total credits", () => {
        const courses = getCourses(db);
        const creditMap = new Map(courses.map((c) => [c.id, c.credits]));
        const semTotals = new Map();
        for (const row of plan) {
            const credits = creditMap.get(row.course_id) ?? 0;
            semTotals.set(row.semester, (semTotals.get(row.semester) ?? 0) + credits);
        }
        for (const [sem, total] of semTotals) {
            expect(total, `Semester ${sem} has ${total} credits`).toBeLessThanOrEqual(16);
        }
    });
    it("respects catalog offering frequency projections", () => {
        const rows = db
            .prepare("SELECT course_id, frequency FROM course_offering_rules")
            .all();
        const frequencyOf = new Map(rows.map((row) => [row.course_id, row.frequency]));
        for (const row of plan) {
            const frequency = frequencyOf.get(row.course_id) ?? "unknown";
            expect(allowedSemestersForFrequency(frequency), `${row.course_id} is ${frequency} but was scheduled in semester ${row.semester}`).toContain(row.semester);
        }
    });
});
describe("seeded elective preferences", () => {
    it("uses different seeds to produce different valid plans", async () => {
        const dbA = buildTestDb();
        const dbB = buildTestDb();
        const planA = await runSolver(dbA, "seed-alpha", { seed: "alpha" });
        const planB = await runSolver(dbB, "seed-beta", { seed: "beta" });
        const keyA = planA.map((row) => `${row.semester}:${row.course_id}`).join("|");
        const keyB = planB.map((row) => `${row.semester}:${row.course_id}`).join("|");
        expect(keyA).not.toBe(keyB);
    });
});
