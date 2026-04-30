import type { Arith, Bool, Context } from "z3-solver";
import type { Course, Prerequisite } from "../db/queries.js";

export interface ConstraintData {
  courses: Course[];
  prereqs: Prerequisite[];
}

/**
 * A ConstraintFn is generic over the Z3 context name (N).
 * TypeScript infers N at each call site from the concrete context passed in,
 * so everything stays consistent without needing manual type annotations in
 * constraint functions.
 *
 * Each function in constraints.ts follows this signature. Toggle constraints
 * on or off by editing the `activeConstraints` array.
 */
export type ConstraintFn = <N extends string>(
  ctx: Context<N>,
  vars: Map<string, Arith<N>>,
  data: ConstraintData,
) => Bool<N>[];
