[![Review Assignment Due Date](https://classroom.github.com/assets/deadline-readme-button-22041afd0340ce965d47ae6ef1cefeee28c7c493a6346c4f15d667ab976d596c.svg)](https://classroom.github.com/a/SaN3oi2L)
# HW2 Version 2.0 : Constraint-Aware Course Planner

**COSI 106B – Automation in Software Development**

## Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm** (bundled with Node.js)

No other system dependencies are required. The Z3 solver is included as an npm package (`z3-solver`) and runs via WebAssembly — it works on macOS, Linux, and Windows without any binary installation.

---

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Create the database schema
npm run db:init

# 3. Populate with sample courses and prerequisites
npm run db:seed

# 4. Run the constraint solver (produces a plan)
npm run solve
# Optional: name the run and choose a deterministic seed
npm run solve -- --tag=fall2026 --seed=demo

# 5. Start the web server
npm start
# → http://localhost:3000
```

---

## Run Tags and Seeds

`npm run solve` accepts optional `--tag` and `--seed` arguments after npm's `--` separator:

```bash
npm run solve -- --tag=fall2026
npm run solve -- --tag=fall2026 --seed=demo
```

- `--tag` names the generated plan run. The tag is stored with the plan and appears in the web app's plan selector.
- `--seed` controls the deterministic course-selection randomness. Reusing the same seed produces the same elective choices; using a different seed can produce a different valid plan.
- If no tag is provided, the solver uses the current timestamp as the run tag. If no seed is provided, the solver uses the run tag as the seed.

The database seed command is separate:

```bash
npm run db:seed
```

It reloads the sample courses, prerequisites, and offering rules from `src/db/seed.sql`, and it clears any existing generated plans.

---

## Build Commands

| Command | Description |
|---|---|
| `npm run db:init` | Create the SQLite schema |
| `npm run db:seed` | Seed courses, prerequisites, and offering rules |
| `npm run solve` | Run Z3, write plan to database |
| `npm run solve -- --tag=fall2026 --seed=demo` | Run Z3 with an explicit plan tag and deterministic seed |
| `npm start` | Start the web server on port 3000 |

---

## Resources

- [z3-solver npm package](https://github.com/Z3Prover/z3/blob/master/src/api/js/PUBLISHED_README.md)
- [better-sqlite3 documentation](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md)
- [EJS templating](https://ejs.co)
- [Vitest documentation](https://vitest.dev)
