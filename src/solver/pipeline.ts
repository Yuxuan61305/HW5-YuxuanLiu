import type Database from "better-sqlite3";
import { init } from "z3-solver";
import {
  addPlan,
  getCourseOfferingRules,
  getCourses,
  getPrerequisites,
} from "../db/queries.js";
import type { Course, OfferingFrequency, PlanRow } from "../db/queries.js";

const PLANNING_SEMESTERS = 4;
const MAX_CREDITS_PER_SEMESTER = 16;

const COMPLETED_OR_WAIVED_COURSES = new Set(["cosi10a", "cosi12b", "cosi21a"]);
const REQUIRED_FUTURE_CORE = ["cosi29a", "cosi121b", "cosi130a", "cosi131a"];
const REQUIRED_ELECTIVE_COUNT = 6;
const COSI_ORAL_COMMUNICATION_OPTIONS = new Set([
  "cosi125a",
  "cosi126a",
  "cosi142a",
  "cosi159a",
  "cosi166b",
  "cosi167a",
]);

function courseNumber(id: string): number | undefined {
  const match = /^cosi(\d+)/.exec(id.toLowerCase());
  return match ? Number(match[1]) : undefined;
}

function countsTowardCosiMajor(course: Course): boolean {
  const number = courseNumber(course.id);
  return course.department === "COSI" && number !== undefined && number > 10;
}

function allowedSemestersForFrequency(frequency: OfferingFrequency | undefined): number[] {
  const allSemesters = Array.from({ length: PLANNING_SEMESTERS }, (_, i) => i + 1);

  switch (frequency) {
    case "every_semester":
    case "every_year":
    case "unknown":
    case undefined:
      return allSemesters;
    case "every_second_year":
      return allSemesters.filter((semester) => semester <= 2 || semester >= 5);
    case "every_third_year":
      return allSemesters.filter((semester) => semester <= 2);
  }
}

function sumInt(ctx: any, terms: any[]): any {
  return terms.reduce((acc, term) => acc.add(term), ctx.Int.val(0));
}

function selected(ctx: any, semesterVar: any): any {
  return semesterVar.gt(ctx.Int.val(0));
}

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (const char of seed) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: string): () => number {
  let state = hashSeed(seed);
  return () => {
    state = Math.imul(1664525, state) + 1013904223;
    return (state >>> 0) / 4294967296;
  };
}

function shuffleWithSeed<T>(items: T[], seed: string): T[] {
  const random = seededRandom(seed);
  const result = [...items];

  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }

  return result;
}

function isSafeRandomElective(course: Course, prereqs: Array<{ course_id: string; prereq_id: string }>): boolean {
  if (REQUIRED_FUTURE_CORE.includes(course.id)) return false;

  return prereqs
    .filter((prereq) => prereq.course_id === course.id)
    .every(
      (prereq) =>
        COMPLETED_OR_WAIVED_COURSES.has(prereq.prereq_id) ||
        REQUIRED_FUTURE_CORE.includes(prereq.prereq_id),
    );
}

function chooseSeededRequiredElectives(
  courses: Course[],
  prereqs: Array<{ course_id: string; prereq_id: string }>,
  seed: string,
): Course[] {
  const safeElectives = courses.filter((course) => isSafeRandomElective(course, prereqs));
  const oralElectives = safeElectives.filter((course) =>
    COSI_ORAL_COMMUNICATION_OPTIONS.has(course.id),
  );

  if (oralElectives.length === 0) {
    throw new Error("No schedulable COSI oral communication elective was found.");
  }

  const requiredOral = shuffleWithSeed(oralElectives, `${seed}:oral`)[0];
  const selected = [requiredOral];
  const selectedIds = new Set(selected.map((course) => course.id));
  const remainingElectives = shuffleWithSeed(
    safeElectives.filter((course) => !selectedIds.has(course.id)),
    `${seed}:electives`,
  );

  selected.push(...remainingElectives.slice(0, REQUIRED_ELECTIVE_COUNT - selected.length));

  if (selected.length < REQUIRED_ELECTIVE_COUNT) {
    throw new Error(
      `Only found ${selected.length} schedulable electives, but ${REQUIRED_ELECTIVE_COUNT} are required.`,
    );
  }

  return selected;
}

export interface SolverOptions {
  seed?: string;
}

export async function runSolver(
  db: Database.Database,
  runTag = "default-run",
  options: SolverOptions = {},
): Promise<PlanRow[]> {
  // ---------------------------------------------------------------------------
  // Step 1: Read catalog data and choose the planning universe
  // ---------------------------------------------------------------------------

  const allCourses = getCourses(db);
  const prereqs = getPrerequisites(db);
  const offeringRules = getCourseOfferingRules(db);
  const offeringFrequency = new Map(
    offeringRules.map((rule) => [rule.course_id, rule.frequency]),
  );

  const courses = allCourses.filter(
    (course) =>
      countsTowardCosiMajor(course) && !COMPLETED_OR_WAIVED_COURSES.has(course.id),
  );
  const courseIds = new Set(courses.map((course) => course.id));
  const randomSeed = options.seed ?? runTag;
  const randomRequiredElectives = chooseSeededRequiredElectives(courses, prereqs, randomSeed);

  // ---------------------------------------------------------------------------
  // Step 2: Initialize Z3
  // ---------------------------------------------------------------------------

  const { Context } = await init();
  const ctx = new Context("main");

  // One integer variable per schedulable course:
  //   0     means not selected for this plan
  //   1..PLANNING_SEMESTERS means selected and assigned to that future semester
  const semVars = new Map(courses.map((c) => [c.id, ctx.Int.const(`sem_${c.id}`)]));

  // ---------------------------------------------------------------------------
  // Step 3: Apply degree-planning constraints
  // ---------------------------------------------------------------------------

  const solver = new ctx.Solver();

  for (const course of courses) {
    const semester = semVars.get(course.id)!;
    solver.add(semester.ge(ctx.Int.val(0)));
    solver.add(semester.le(ctx.Int.val(PLANNING_SEMESTERS)));

    const allowedSemesters = allowedSemestersForFrequency(offeringFrequency.get(course.id));
    solver.add(
      ctx.Implies(
        selected(ctx, semester),
        ctx.Or(...allowedSemesters.map((s) => semester.eq(ctx.Int.val(s)))),
      ),
    );
  }

  for (const courseId of REQUIRED_FUTURE_CORE) {
    const semester = semVars.get(courseId);
    if (!semester) {
      throw new Error(`Required future core course '${courseId}' was not found.`);
    }
    solver.add(selected(ctx, semester));
  }

  const electiveTerms = courses
    .filter((course) => !REQUIRED_FUTURE_CORE.includes(course.id))
    .map((course) =>
      ctx.If(selected(ctx, semVars.get(course.id)!), ctx.Int.val(1), ctx.Int.val(0)),
    );
  solver.add(sumInt(ctx, electiveTerms).eq(ctx.Int.val(REQUIRED_ELECTIVE_COUNT)));

  for (const course of randomRequiredElectives) {
    solver.add(selected(ctx, semVars.get(course.id)!));
  }

  const oralCommunicationTerms = courses
    .filter(
      (course) =>
        !REQUIRED_FUTURE_CORE.includes(course.id) &&
        COSI_ORAL_COMMUNICATION_OPTIONS.has(course.id),
    )
    .map((course) =>
      ctx.If(selected(ctx, semVars.get(course.id)!), ctx.Int.val(1), ctx.Int.val(0)),
    );
  solver.add(sumInt(ctx, oralCommunicationTerms).ge(ctx.Int.val(1)));

  for (const { course_id, prereq_id } of prereqs) {
    const courseSemester = semVars.get(course_id);
    if (!courseSemester) continue;

    if (COMPLETED_OR_WAIVED_COURSES.has(prereq_id)) continue;

    const prereqSemester = semVars.get(prereq_id);
    if (!prereqSemester || !courseIds.has(prereq_id)) {
      solver.add(courseSemester.eq(ctx.Int.val(0)));
      continue;
    }

    solver.add(
      ctx.Implies(
        selected(ctx, courseSemester),
        ctx.And(selected(ctx, prereqSemester), prereqSemester.lt(courseSemester)),
      ),
    );
  }

  for (let semesterNumber = 1; semesterNumber <= PLANNING_SEMESTERS; semesterNumber += 1) {
    const creditTerms = courses.map((course) =>
      ctx.If(
        semVars.get(course.id)!.eq(ctx.Int.val(semesterNumber)),
        ctx.Int.val(course.credits),
        ctx.Int.val(0),
      ),
    );
    const courseCountTerms = courses.map((course) =>
      ctx.If(
        semVars.get(course.id)!.eq(ctx.Int.val(semesterNumber)),
        ctx.Int.val(1),
        ctx.Int.val(0),
      ),
    );

    solver.add(sumInt(ctx, creditTerms).le(ctx.Int.val(MAX_CREDITS_PER_SEMESTER)));
    solver.add(sumInt(ctx, courseCountTerms).ge(ctx.Int.val(1)));
  }

  // ---------------------------------------------------------------------------
  // Step 4: Solve
  // ---------------------------------------------------------------------------

  console.log(
    `Solving a ${PLANNING_SEMESTERS}-semester CS major plan from ` +
      `${courses.length} candidate courses…`,
  );
  console.log(
    `Seeded elective preferences: ${
      randomRequiredElectives.map((course) => course.id).join(", ") || "none"
    }`,
  );
  const status = await solver.check();
 

  if (status !== "sat") {
    throw new Error(
      `Solver returned '${status}'. No valid plan exists under the current constraints.\n` +
        `Try removing a constraint from activeConstraints in src/solver/constraints.ts.`,
    );
  }

  // ---------------------------------------------------------------------------
  // Step 5: Parse the model
  // ---------------------------------------------------------------------------

  const model = solver.model();

  const planRows: PlanRow[] = courses
    .map((course) => ({
      course_id: course.id,
      semester: Number(model.eval(semVars.get(course.id)!, true).toString()),
    }))
    .filter((row) => row.semester > 0)
    .sort((a, b) => a.semester - b.semester || a.course_id.localeCompare(b.course_id));

  // ---------------------------------------------------------------------------
  // Step 6: Write plan to database
  // ---------------------------------------------------------------------------
  const time_stamp = new Date().toISOString();
  addPlan(db, runTag, planRows, time_stamp);
  return planRows;
}
