import type { PromptPhase, Role, SandcastleConfig } from "../config.ts";

export const complete = "<promise>COMPLETE</promise>";

const skill = (name: string, fallback: string) =>
  `Use .agents/skills/${name}/SKILL.md if present. Otherwise, ${fallback}`;

const prompts: Record<PromptPhase, string> = {
  plan: `Choose one Spec from the supplied GitHub task graph. Include every plannable ticket for that Spec,
in dispatch order. Choose a supplied implementer and give a specific reason for each ticket.
Assess whether a single shared, read-only code exploration would help and give its scope.
Set repairDeep if any ticket requires the high-risk repair role.
Return one JSON block of this form:
<plan>
{"spec":40,"explore":{"needed":false,"focus":""},"repairDeep":false,"issues":[{"number":41,"implementer":"standard","reason":"Scope and risk"}]}
</plan>
If no Spec is suitable, return null for spec and an empty issues array. Leave repository and issue state untouched.`,
  explore: `Investigate the supplied Spec and ticket scope at the fixed baseline. Read their actual GitHub bodies,
comments and blockers. Return concise Markdown with relevant files and symbols, call chains, confirmed test
seams and unresolved decisions. Leave files, Git state and issues untouched.`,
  implement: `Read the actual parent Spec, ticket, blockers and comments using the explicit GitHub repository.
The host has claimed the ticket. Confirm branch, worktree and baseline before modifying files.
Preserve any identified recovery work.
${skill("tdd", "write one failing behavior test at the agreed seam, then make it pass before expanding coverage.")}
Implement this ticket, run the complete affected checks, and make focused commits referencing the ticket.
Keep commit hooks on. Merge the latest Spec integration tip into this ticket branch and rerun checks invalidated
by the merge. Hand off actual commands, results, unverified items, clean candidate SHA and next action.
Leave the Spec and invocation branches, GitHub issues and remote branches untouched.`,
  "resolve-conflict": `The host aborted a real merge conflict. Merge the supplied integration SHA into this
ticket branch and preserve both changes' intent. ${skill("resolving-merge-conflicts", "inspect both sides and their requirements before resolving each conflict, then complete the ordinary merge.")}
Rerun affected checks, report candidate SHA and evidence, and leave a clean ticket checkout. Leave the Spec
and invocation branches, issue states and remote branches untouched.`,
  "review-standards": `Review the full difference between the fixed review base and candidate for compliance with
applicable repository engineering standards. ${skill("code-review", "read the repository rules and report each actionable finding with file, location, consequence and evidence.")}
Confirm HEAD matches the supplied review candidate before reading its diff.
Return the Standards report as Markdown. Explicitly say if the axis found no issues. Leave repository and
GitHub state untouched. Carry out this axis yourself.`,
  "review-spec": `Review the fixed review base and candidate against the actual parent Spec, complete ticket
graph, comments, acceptance criteria and confirmed testing decisions. ${skill("code-review", "trace requirements to code and checks, and report each actionable gap with its evidence and consequence.")}
Confirm HEAD matches the supplied review candidate before reading its diff.
Return the Spec report as Markdown. Explicitly say if the axis found no issues. Leave repository and
GitHub state untouched. Carry out this axis yourself.`,
  "repair-and-verify": `This is the single repair and final verification session for the supplied Spec.
Confirm the clean candidate and review base. Read the actual Spec, tickets and acceptance requirements.
Address findings from both supplied reports, record each disposition,
and preserve all integrated tickets. Run all required final checks at the final candidate. Commit focused
fixes with hooks enabled, rerun invalidated checks, and record actual commands, results and checks still pending.
Leave issue states, the invocation branch and remote branches untouched.
${skill("pr", "draft a concise PR description with a summary, verification evidence and merge risks.")}
Only when every required check has passed, findings have been addressed and the final candidate is clean,
include a nonempty draft in <pr-body>...</pr-body> and put the completion marker on the final line.
If incomplete, report the error and safe recovery point and omit the completion marker.`,
};

export function phasePrompt(
  phase: PromptPhase,
  role: Role,
  details: unknown,
  extras: SandcastleConfig["promptExtras"],
): string {
  const extra = extras?.[phase];
  const guidance = typeof extra === "object" ? extra.replace : prompts[phase];
  return [
    role.instructions,
    "Read AGENTS.md and applicable repository instructions if present. Use the repository supplied below for GitHub commands.",
    guidance,
    typeof extra === "string" ? extra : undefined,
    `Workflow context (JSON):\n${JSON.stringify(details, null, 2)}`,
    phase === "plan"
      ? "Return the plan in a <plan> JSON block."
      : `Only report success by ending your response with this standalone line:\n${complete}`,
    phase === "repair-and-verify"
      ? "On success, include a nonempty <pr-body> draft before that final line."
      : undefined,
  ]
    .filter(Boolean)
    .join("\n\n");
}
