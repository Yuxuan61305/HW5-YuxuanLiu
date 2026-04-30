import Database from "better-sqlite3";
import { resolve } from "node:path";
import { getCourses, getRuns, getPlanByTag } from "../db/queries.js";
function openDb() {
    return new Database(resolve("db.sqlite"), { readonly: true });
}
export function registerRoutes(app) {
    app.get("/", (_req, res) => {
        res.render("index", { title: "Course Planner" });
    });
    app.get("/courses", (_req, res) => {
        const db = openDb();
        const courses = getCourses(db);
        // Build a prereq map: course_id → list of prereq course objects
        const prereqRows = db
            .prepare(`SELECT p.course_id, c.id, c.name
         FROM prerequisites p
         JOIN courses c ON c.id = p.prereq_id
         ORDER BY p.course_id`)
            .all();
        const prereqMap = new Map();
        for (const row of prereqRows) {
            const list = prereqMap.get(row.course_id) ?? [];
            list.push({ id: row.id, name: row.name });
            prereqMap.set(row.course_id, list);
        }
        const coursesWithPrereqs = courses.map((c) => ({
            ...c,
            prereqs: prereqMap.get(c.id) ?? [],
        }));
        db.close();
        res.render("courses", { title: "Course Catalog", courses: coursesWithPrereqs });
    });
    app.get("/plan", (req, res) => {
        const db = openDb();
        const runs = getRuns(db);
        let selectedTag = req.query.tag;
        if (!selectedTag && runs.length > 0) {
            selectedTag = runs[0].run_tag;
        }
        const planRows = selectedTag ? getPlanByTag(db, selectedTag) : [];
        console.log("Selected tag:", selectedTag);
        if (planRows.length === 0) {
            db.close();
            res.render("plan", { title: "Generated Plan", semesters: [], empty: true, runs, selectedTag, });
            return;
        }
        // Fetch prerequisite data for each course
        const prereqRows = db
            .prepare(`SELECT course_id, prereq_id
         FROM prerequisites
         ORDER BY course_id`)
            .all();
        const prereqMap = new Map();
        for (const row of prereqRows) {
            const list = prereqMap.get(row.course_id) ?? [];
            list.push(row.prereq_id);
            prereqMap.set(row.course_id, list);
        }
        db.close();
        // Group courses by semester for display
        const semesterMap = new Map();
        for (const row of planRows) {
            const list = semesterMap.get(row.semester) ?? [];
            list.push(row);
            semesterMap.set(row.semester, list);
        }
        const semesters = Array.from(semesterMap.entries())
            .sort(([a], [b]) => a - b)
            .map(([num, courses]) => ({
            number: num,
            courses: courses.map((c) => ({
                ...c,
                prereqs: prereqMap.get(c.course_id) ?? [],
            })),
            totalCredits: courses.reduce((sum, c) => sum + c.credits, 0),
        }));
        // Task 7 Option B: check the plan for constraint violations here.
        // Build a `warnings` array of strings describing any issues found,
        // then include it in the res.render() call below.
        res.render("plan", { title: "Generated Plan", semesters, empty: false, runs, selectedTag, });
    });
    // Task 5: analytics dashboard — queries are written; add the template and nav link.
    app.get("/stats", (_req, res) => {
        const db = openDb();
        const latestRunTag = getRuns(db)[0]?.run_tag;
        if (!latestRunTag) {
            db.close();
            res.render("stats", {
                title: "Plan Statistics",
                creditsPerSemester: [],
                coursesPerDept: [],
                busiestSemester: undefined,
                avgCreditsPerSemester: 0,
            });
            return;
        }
        const creditsPerSemester = db
            .prepare(`SELECT p.semester, SUM(c.credits) AS total_credits
         FROM plan p
         JOIN courses c ON c.id = p.course_id
         where p.run_tag = ?
         GROUP BY p.semester
         ORDER BY p.semester`)
            .all(latestRunTag);
        const coursesPerDept = db
            .prepare(`SELECT c.department, COUNT(*) AS course_count, SUM(c.credits) AS total_credits
         FROM plan p
         JOIN courses c ON c.id = p.course_id
         where p.run_tag = ?
         GROUP BY c.department
         ORDER BY c.department`)
            .all(latestRunTag);
        const busiestSemester = db
            .prepare(`SELECT p.semester, SUM(c.credits) AS total_credits
         FROM plan p
         JOIN courses c ON c.id = p.course_id
         where p.run_tag = ?
         GROUP BY p.semester
         ORDER BY total_credits DESC
         LIMIT 1`)
            .get(latestRunTag);
        const avgResult = db
            .prepare(`SELECT AVG(sem_total) AS avg_credits
         FROM (
           SELECT SUM(c.credits) AS sem_total
           FROM plan p
           JOIN courses c ON c.id = p.course_id
           where p.run_tag = ?
           GROUP BY p.semester
         )`)
            .get(latestRunTag);
        db.close();
        res.render("stats", {
            title: "Plan Statistics",
            creditsPerSemester,
            coursesPerDept,
            busiestSemester,
            avgCreditsPerSemester: avgResult?.avg_credits ?? 0,
        });
    });
    // Task 7 Option C: fill in this route to power the prerequisite graph.
    app.get("/graph", (_req, res) => {
        const db = openDb();
        // Query the prerequisites and courses tables here, then pass data to graph.ejs
        db.close();
        res.render("graph", { title: "Prerequisite Graph" });
    });
}
