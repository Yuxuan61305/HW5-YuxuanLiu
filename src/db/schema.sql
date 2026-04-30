DROP TABLE IF EXISTS plan;
DROP TABLE IF EXISTS course_offering_rules;
DROP TABLE IF EXISTS prerequisites;
DROP TABLE IF EXISTS courses;

CREATE TABLE IF NOT EXISTS courses (
  id         TEXT    PRIMARY KEY,
  name       TEXT    NOT NULL,
  credits    INTEGER NOT NULL,
  department TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS prerequisites (
  course_id TEXT NOT NULL REFERENCES courses(id),
  prereq_id TEXT NOT NULL REFERENCES courses(id),
  PRIMARY KEY (course_id, prereq_id)
);

CREATE TABLE IF NOT EXISTS course_offering_rules (
  course_id TEXT PRIMARY KEY REFERENCES courses(id),
  frequency TEXT NOT NULL CHECK (
    frequency IN (
      'every_semester',
      'every_year',
      'every_second_year',
      'every_third_year',
      'unknown'
    )
  ),
  source_note TEXT
);

CREATE TABLE IF NOT EXISTS plan (
  run_tag   TEXT   NOT NULL,
  time_stamp TEXT  NOT NULL,
  course_id TEXT   REFERENCES courses(id),
  semester  INTEGER NOT NULL CHECK (semester BETWEEN 1 AND 4),
  PRIMARY KEY (run_tag, course_id)
);
