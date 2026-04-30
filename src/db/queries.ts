import type Database from "better-sqlite3";

export interface Course {
  id: string;
  name: string;
  credits: number;
  department: string;
}

export interface Prerequisite {
  course_id: string;
  prereq_id: string;
}

export type OfferingFrequency =
  | "every_semester"
  | "every_year"
  | "every_second_year"
  | "every_third_year"
  | "unknown";

export interface CourseOfferingRule {
  course_id: string;
  frequency: OfferingFrequency;
  source_note: string | null;
}

export interface PlanRow {
  course_id: string;
  semester: number;
}

export function getCourses(db: Database.Database): Course[] {
  return db
    .prepare("SELECT * FROM courses ORDER BY department, id")
    .all() as Course[];
}

export function getPrerequisites(db: Database.Database): Prerequisite[] {
  return db
    .prepare("SELECT course_id, prereq_id FROM prerequisites")
    .all() as Prerequisite[];
}

export function getCourseOfferingRules(db: Database.Database): CourseOfferingRule[] {
  return db
    .prepare(
      `SELECT course_id, frequency, source_note
       FROM course_offering_rules
       ORDER BY course_id`,
    )
    .all() as CourseOfferingRule[];
}

export function getPlan(db: Database.Database): PlanRow[] {
  return db
    .prepare(
      `SELECT p.course_id, p.semester, c.name, c.credits, c.department
       FROM plan p
       JOIN courses c ON c.id = p.course_id
       ORDER BY p.semester, p.course_id`,
    )
    .all() as PlanRow[];
}

export function getPlanByTag(db: Database.Database, runTag: string): PlanRow[] {
  return db
    .prepare(
      `SELECT p.course_id, p.semester, c.name, c.credits, c.department
       FROM plan p
       JOIN courses c ON c.id = p.course_id
       where p.run_tag = ?
       ORDER BY p.semester, p.course_id`,
    )
    .all(runTag) as PlanRow[];
}


export function getRuns(db: Database.Database,): { run_tag: string; time_stamp: string }[] {
  return db
    .prepare(
      `SELECT run_tag, MAX(time_stamp) AS time_stamp
       FROM plan
       GROUP BY run_tag
       ORDER BY time_stamp DESC`,
    )
    .all() as { run_tag: string; time_stamp: string }[];
}

export function clearAndInsertPlan(db: Database.Database, rows: PlanRow[], runTag="default-run"): void {
  const clear = db.prepare("DELETE FROM plan");
  const insert = db.prepare(
    "INSERT INTO plan (run_tag, time_stamp, course_id, semester) VALUES (?, ?, ?, ?)",
  );

  const runAll = db.transaction(() => {
    const timeStamp = new Date().toISOString();
    clear.run();
    for (const row of rows) {
      insert.run(runTag, timeStamp, row.course_id, row.semester);
    }
  });

  runAll();
}
export function addPlan(db: Database.Database, runTag: string, rows: PlanRow[], time_stamp: string): void {
   db.prepare(`DELETE FROM plan WHERE run_tag = ?`).run(runTag);
   const insert = db.prepare(`INSERT INTO plan (run_tag, time_stamp, course_id, semester) VALUES (?, ?, ?, ?)`);
   const runAll = db.transaction(() => {
     for (const row of rows) {
       insert.run(runTag, time_stamp, row.course_id, row.semester);
     }
   });

   runAll();

}
