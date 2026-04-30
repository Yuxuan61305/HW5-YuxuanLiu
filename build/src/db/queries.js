export function getCourses(db) {
    return db
        .prepare("SELECT * FROM courses ORDER BY department, id")
        .all();
}
export function getPrerequisites(db) {
    return db
        .prepare("SELECT course_id, prereq_id FROM prerequisites")
        .all();
}
export function getCourseOfferingRules(db) {
    return db
        .prepare(`SELECT course_id, frequency, source_note
       FROM course_offering_rules
       ORDER BY course_id`)
        .all();
}
export function getPlan(db) {
    return db
        .prepare(`SELECT p.course_id, p.semester, c.name, c.credits, c.department
       FROM plan p
       JOIN courses c ON c.id = p.course_id
       ORDER BY p.semester, p.course_id`)
        .all();
}
export function getPlanByTag(db, runTag) {
    return db
        .prepare(`SELECT p.course_id, p.semester, c.name, c.credits, c.department
       FROM plan p
       JOIN courses c ON c.id = p.course_id
       where p.run_tag = ?
       ORDER BY p.semester, p.course_id`)
        .all(runTag);
}
export function getRuns(db) {
    return db
        .prepare(`SELECT run_tag, MAX(time_stamp) AS time_stamp
       FROM plan
       GROUP BY run_tag
       ORDER BY time_stamp DESC`)
        .all();
}
export function clearAndInsertPlan(db, rows, runTag = "default-run") {
    const clear = db.prepare("DELETE FROM plan");
    const insert = db.prepare("INSERT INTO plan (run_tag, time_stamp, course_id, semester) VALUES (?, ?, ?, ?)");
    const runAll = db.transaction(() => {
        const timeStamp = new Date().toISOString();
        clear.run();
        for (const row of rows) {
            insert.run(runTag, timeStamp, row.course_id, row.semester);
        }
    });
    runAll();
}
export function addPlan(db, runTag, rows, time_stamp) {
    db.prepare(`DELETE FROM plan WHERE run_tag = ?`).run(runTag);
    const insert = db.prepare(`INSERT INTO plan (run_tag, time_stamp, course_id, semester) VALUES (?, ?, ?, ?)`);
    const runAll = db.transaction(() => {
        for (const row of rows) {
            insert.run(runTag, time_stamp, row.course_id, row.semester);
        }
    });
    runAll();
}
