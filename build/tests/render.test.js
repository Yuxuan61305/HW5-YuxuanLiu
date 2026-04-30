/**
 * render.test.ts — smoke tests for the web routes.
 *
 * These tests start an Express server against an in-memory database
 * and check that each route returns valid HTML containing expected content.
 * They should pass before and after your bug fixes.
 */
import Database from "better-sqlite3";
import express from "express";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { registerRoutes } from "../src/web/routes.js";
import { clearAndInsertPlan } from "../src/db/queries.js";
const __dirname = dirname(fileURLToPath(import.meta.url));
let app;
async function renderGet(path) {
    const router = app._router;
    const layer = router.stack.find((entry) => entry.route?.path === path && entry.route?.methods.get);
    if (!layer)
        throw new Error(`No GET route registered for ${path}`);
    return new Promise((resolvePromise, reject) => {
        const req = { method: "GET", path, query: {}, url: path };
        const res = {
            statusCode: 200,
            status(code) {
                this.statusCode = code;
                return this;
            },
            render(view, locals) {
                app.render(view, locals, (err, html) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    resolvePromise({ status: this.statusCode, text: html });
                });
            },
        };
        try {
            layer.route.stack[0].handle(req, res, reject);
        }
        catch (err) {
            reject(err);
        }
    });
}
beforeAll(() => {
    app = express();
    app.set("view engine", "ejs");
    app.set("views", resolve(__dirname, "../src/templates"));
    // Seed a db.sqlite in the working directory for route tests.
    const db = new Database("db.sqlite");
    db.exec(readFileSync(resolve(__dirname, "../src/db/schema.sql"), "utf-8"));
    db.exec(readFileSync(resolve(__dirname, "../src/db/seed.sql"), "utf-8"));
    clearAndInsertPlan(db, [
        { course_id: "cosi29a", semester: 1 },
        { course_id: "cosi131a", semester: 2 },
        { course_id: "cosi103a", semester: 2 },
        { course_id: "cosi125a", semester: 4 },
    ]);
    db.close();
    registerRoutes(app);
});
describe("GET /", () => {
    it("returns 200 and contains 'Course Planner'", async () => {
        const res = await renderGet("/");
        expect(res.status).toBe(200);
        expect(res.text).toContain("Course Planner");
    });
});
describe("GET /courses", () => {
    it("returns 200 and lists course IDs", async () => {
        const res = await renderGet("/courses");
        expect(res.status).toBe(200);
        expect(res.text).toContain("cosi10a");
        expect(res.text).toContain("cosi131a");
    });
    it("shows prerequisite relationships", async () => {
        const res = await renderGet("/courses");
        expect(res.text).toContain("cosi21a"); // appears as prereq of cosi131a
    });
});
describe("GET /plan", () => {
    it("returns 200 and shows semester headings", async () => {
        const res = await renderGet("/plan");
        expect(res.status).toBe(200);
        expect(res.text).toContain("Semester 1");
        expect(res.text).toContain("Semester 2");
    });
    it("includes course IDs in the plan", async () => {
        const res = await renderGet("/plan");
        expect(res.text).toContain("cosi29a");
        expect(res.text).toContain("cosi131a");
    });
});
