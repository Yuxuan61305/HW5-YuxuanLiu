/**
 * db.test.ts — tests for the database layer.
 *
 * These tests use an in-memory SQLite database so they run without requiring
 * a real db.sqlite file. They should pass before and after your bug fixes.
 */
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { getCourses, getPrerequisites, clearAndInsertPlan, getPlan } from "../src/db/queries.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
function buildTestDb() {
    const db = new Database(":memory:");
    const schema = readFileSync(resolve(__dirname, "../src/db/schema.sql"), "utf-8");
    const seed = readFileSync(resolve(__dirname, "../src/db/seed.sql"), "utf-8");
    db.exec(schema);
    db.exec(seed);
    return db;
}
describe("getCourses", () => {
    let db;
    beforeAll(() => { db = buildTestDb(); });
    it("returns all 44 seeded COSI courses", () => {
        const courses = getCourses(db);
        expect(courses).toHaveLength(44);
    });
    it("every course has required fields", () => {
        const courses = getCourses(db);
        for (const c of courses) {
            expect(c.id).toBeTypeOf("string");
            expect(c.name).toBeTypeOf("string");
            expect(c.credits).toBeTypeOf("number");
            expect(c.department).toBeTypeOf("string");
            expect(c.credits).toBeGreaterThan(0);
        }
    });
});
describe("getPrerequisites", () => {
    let db;
    beforeAll(() => { db = buildTestDb(); });
    it("returns all 46 seeded COSI prerequisite pairs", () => {
        const prereqs = getPrerequisites(db);
        expect(prereqs).toHaveLength(46);
    });
    it("only includes COSI-to-COSI prerequisites", () => {
        const prereqs = getPrerequisites(db);
        expect(prereqs.every((p) => p.course_id.startsWith("cosi") && p.prereq_id.startsWith("cosi"))).toBe(true);
    });
});
describe("clearAndInsertPlan", () => {
    let db;
    beforeAll(() => { db = buildTestDb(); });
    it("inserts rows and retrieves them", () => {
        clearAndInsertPlan(db, [
            { course_id: "cosi29a", semester: 1 },
            { course_id: "cosi131a", semester: 2 },
        ]);
        const plan = getPlan(db);
        expect(plan).toHaveLength(2);
    });
    it("clears previous plan before inserting", () => {
        clearAndInsertPlan(db, [{ course_id: "cosi29a", semester: 2 }]);
        const plan = getPlan(db);
        expect(plan).toHaveLength(1);
        expect(plan[0].semester).toBe(2);
    });
});
