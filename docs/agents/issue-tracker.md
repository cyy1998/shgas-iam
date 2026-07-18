# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`. The tracker is version controlled: completed features stay at their original paths as permanent delivery records.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Approved specs and amendments

Once the maintainer approves the ticket breakdown and the tickets are published, set the feature spec to `Status: approved`. From that point it is the implementation baseline.

- Append small clarifications under `## Amendments` with an ISO date; do not silently rewrite the approved intent.
- If a discovery changes scope, behaviour, or architecture, return to design discussion for explicit approval, then amend the spec and affected tickets together.
- Never move, archive, or delete the feature directory after completion.

## Ticket lifecycle

Implementation tickets use one linear lifecycle:

1. `ready-for-agent` — fully specified and available when every blocker is resolved.
2. `claimed` — owned by the current implementation session; set this before editing implementation files.
3. `resolved` — acceptance criteria, validation, two-axis review, and the reviewed implementation commit have all succeeded; the final squash SHA is backfilled after feature merge.

When resolving a ticket, check its acceptance criteria and append:

```markdown
## Resolution

- Final squash commit: `pending`
- Validation:
  - `<command>` — passed
- Review: Standards and Spec review passed with no unresolved findings.
```

Commit the resolution record immediately after the reviewed implementation commit as tracker-only metadata. This bookkeeping commit does not carry implementation changes and is not a second implementation commit.

After the feature is squash-merged, replace `pending` in every ticket with the final squash commit SHA and commit those updates together as one tracker-only metadata commit on the target branch. The squash commit is the permanent delivery identifier; feature-branch implementation commits need not remain reachable after the metadata is backfilled.

The full lifecycle, branch, validation, review, and authorization policy is defined in `workflow.md`.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed) and include it in version control.

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
