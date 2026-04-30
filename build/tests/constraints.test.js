/**
 * constraints.test.ts — unit tests for individual constraint functions.
 *
 * These tests exercise each constraint in isolation using a tiny synthetic
 * problem, so they run quickly and pinpoint exactly which constraint is broken.
 *
 * The prerequisiteOrder test will FAIL until Bug 2 is fixed in constraints.ts.
 */
import { init } from "z3-solver";
import { beforeAll, describe, expect, it } from "vitest";
import { prerequisiteOrder, semesterBounds, semesterCreditLimit, } from "../src/solver/constraints.js";
// z3-solver's Context type is complex and parameterized; 'any' is intentional here.
let ctx;
beforeAll(async () => {
    const { Context } = await init();
    ctx = new Context("main");
});
function makeVars(ids) {
    return new Map(ids.map((id) => [id, ctx.Int.const(`sem_${id}`)]));
}
describe("semesterBounds", () => {
    it("rejects a semester value of 0", async () => {
        const vars = makeVars(["a"]);
        const solver = new ctx.Solver();
        for (const a of semesterBounds(ctx, vars, { courses: [{ id: "a", credits: 4, name: "A", department: "X" }], prereqs: [] })) {
            solver.add(a);
        }
        solver.add(vars.get("a").eq(ctx.Int.val(0)));
        expect(await solver.check()).toBe("unsat");
    });
    it("rejects a semester value of 7", async () => {
        const vars = makeVars(["a"]);
        const solver = new ctx.Solver();
        for (const a of semesterBounds(ctx, vars, { courses: [{ id: "a", credits: 4, name: "A", department: "X" }], prereqs: [] })) {
            solver.add(a);
        }
        solver.add(vars.get("a").eq(ctx.Int.val(7)));
        expect(await solver.check()).toBe("unsat");
    });
});
describe("prerequisiteOrder", () => {
    /**
     * With the correct constraint (.lt), placing a course and its prerequisite
     * in the same semester is UNSAT. With the bug (.le), it is SAT.
     *
     * This test FAILS until Bug 2 is fixed.
     */
    it("prevents a course and its prerequisite from sharing a semester", async () => {
        const vars = makeVars(["prereq", "course"]);
        const data = {
            courses: [
                { id: "prereq", credits: 3, name: "Prereq", department: "X" },
                { id: "course", credits: 3, name: "Course", department: "X" },
            ],
            prereqs: [{ course_id: "course", prereq_id: "prereq" }],
        };
        const solver = new ctx.Solver();
        for (const a of prerequisiteOrder(ctx, vars, data)) {
            solver.add(a);
        }
        // Force both into semester 1 — should be impossible with a strict constraint.
        solver.add(vars.get("prereq").eq(ctx.Int.val(1)));
        solver.add(vars.get("course").eq(ctx.Int.val(1)));
        // FAILS with bug (.le allows equality): returns 'sat' instead of 'unsat'.
        expect(await solver.check()).toBe("unsat");
    });
    it("allows the prerequisite in an earlier semester", async () => {
        const vars = makeVars(["prereq", "course"]);
        const data = {
            courses: [
                { id: "prereq", credits: 3, name: "Prereq", department: "X" },
                { id: "course", credits: 3, name: "Course", department: "X" },
            ],
            prereqs: [{ course_id: "course", prereq_id: "prereq" }],
        };
        const solver = new ctx.Solver();
        for (const a of prerequisiteOrder(ctx, vars, data)) {
            solver.add(a);
        }
        solver.add(vars.get("prereq").eq(ctx.Int.val(1)));
        solver.add(vars.get("course").eq(ctx.Int.val(2)));
        expect(await solver.check()).toBe("sat");
    });
});
describe("semesterCreditLimit", () => {
    it("rejects a semester with more than 16 credits", async () => {
        // Five 4-credit courses all in semester 1 = 20 credits -> should be unsat.
        const ids = ["a", "b", "c", "d", "e"];
        const vars = makeVars(ids);
        const courses = ids.map((id) => ({ id, credits: 4, name: id, department: "X" }));
        const data = { courses, prereqs: [] };
        const solver = new ctx.Solver();
        for (const a of semesterCreditLimit(ctx, vars, data)) {
            solver.add(a);
        }
        for (const id of ids) {
            solver.add(vars.get(id).eq(ctx.Int.val(1)));
        }
        expect(await solver.check()).toBe("unsat");
    });
});
