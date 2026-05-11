/**
 * AI-refinement loops:
 *
 *   - Self-Refine (Madaan et al. 2023): iterative self-critique
 *   - ReAct (Yao et al. 2023):           Thought → Action → Observation
 *   - Reflexion (Shinn et al. 2023):     episodic memory of past failures
 *
 * Each pattern is a pure orchestrator — it calls back into an
 * `InferenceBackend` (or any function that returns a string).
 */

export type Generator = (prompt: string) => Promise<string>;

// ── Self-Refine ────────────────────────────────────────────────────────

export interface SelfRefineOpts {
  /** Max critique-revise rounds (default 3). */
  rounds?: number;
  /** Optional stop predicate — when true, stop refining. */
  stopWhen?: (output: string, critique: string) => boolean;
}

export async function selfRefine(
  initial: string,
  generate: Generator,
  opts: SelfRefineOpts = {},
): Promise<{ output: string; rounds: number }> {
  const rounds = opts.rounds ?? 3;
  let output = initial;
  for (let r = 0; r < rounds; r++) {
    const critique = await generate(`Critique the following draft. Be specific.\n\n${output}\n\nCritique:`);
    if (opts.stopWhen?.(output, critique)) return { output, rounds: r };
    const revised = await generate(
      `Revise the draft using the critique. Output only the revised version.\n\nDraft:\n${output}\n\nCritique:\n${critique}\n\nRevised:`,
    );
    output = revised.trim();
  }
  return { output, rounds };
}

// ── ReAct ──────────────────────────────────────────────────────────────

export interface ReactStep {
  thought: string;
  action: string;
  observation: string;
}

export interface ReactOpts {
  maxSteps?: number;
  /** Action runner — caller maps action strings to side effects. */
  runAction: (action: string) => Promise<string>;
  /** True when goal reached. */
  done: (steps: ReactStep[]) => boolean;
}

export async function react(
  goal: string,
  generate: Generator,
  opts: ReactOpts,
): Promise<{ steps: ReactStep[]; final: string }> {
  const max = opts.maxSteps ?? 8;
  const steps: ReactStep[] = [];
  for (let i = 0; i < max; i++) {
    const trace = steps
      .map((s, j) => `Thought ${j + 1}: ${s.thought}\nAction ${j + 1}: ${s.action}\nObservation ${j + 1}: ${s.observation}`)
      .join("\n");
    const next = await generate(
      `You are solving: ${goal}\n${trace}\n\nWhat is the next Thought / Action?`,
    );
    const thoughtMatch = next.match(/Thought[^:]*:\s*(.+?)(?:Action|$)/s);
    const actionMatch = next.match(/Action[^:]*:\s*(.+?)(?:Observation|$)/s);
    const thought = thoughtMatch?.[1]?.trim() ?? next.trim();
    const action = actionMatch?.[1]?.trim() ?? "FINISH";
    if (action === "FINISH") {
      return { steps, final: thought };
    }
    const observation = await opts.runAction(action);
    steps.push({ thought, action, observation });
    if (opts.done(steps)) break;
  }
  const final = await generate(
    `Goal: ${goal}\n\nTrace:\n${steps.map((s) => `T: ${s.thought}\nA: ${s.action}\nO: ${s.observation}`).join("\n")}\n\nFinal answer:`,
  );
  return { steps, final: final.trim() };
}

// ── Reflexion ─────────────────────────────────────────────────────────

export interface ReflexionOpts {
  /** Max attempts before giving up. */
  maxAttempts?: number;
  /** Evaluator: returns true if the output is acceptable. */
  evaluate: (output: string) => Promise<boolean>;
}

export async function reflexion(
  task: string,
  generate: Generator,
  opts: ReflexionOpts,
): Promise<{ output: string; attempts: number; reflections: string[] }> {
  const max = opts.maxAttempts ?? 3;
  const reflections: string[] = [];
  let output = await generate(task);
  if (await opts.evaluate(output)) return { output, attempts: 1, reflections };
  for (let i = 1; i < max; i++) {
    const reflection = await generate(
      `Reflect on why the following attempt failed and what to do differently.\n\nTask: ${task}\nAttempt: ${output}\n\nReflection:`,
    );
    reflections.push(reflection.trim());
    output = await generate(
      `Task: ${task}\nPast reflections:\n${reflections.map((r, j) => `${j + 1}. ${r}`).join("\n")}\n\nNew attempt:`,
    );
    if (await opts.evaluate(output)) return { output, attempts: i + 1, reflections };
  }
  return { output, attempts: max, reflections };
}
