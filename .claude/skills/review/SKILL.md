---
name: review
description: Run three specialized review agents (code quality, spec conformance, security) in parallel, present findings, and coordinate fixes
allowed-tools: Read, Edit, Write, Bash, Glob, Grep, Agent, AskUserQuestion
argument-hint: [file1 file2 ...] — optional paths to review; defaults to staged changes or branch diff
---

# Multi-Agent Code Review

Run three specialized review agents in parallel, present severity-filtered findings, and coordinate fixes in an iterative loop.

## Phase 1: Detect Scope

Determine what to review, in this priority order:

1. **If arguments were provided** — use those files/directories as scope
2. **If staged changes exist** — run `git diff --cached --name-only` and use those files
3. **Otherwise** — run `git diff main --name-only` and use the branch diff

If no files are found in any of these, tell the user "Nothing to review — no arguments, staged changes, or branch diff found." and stop.

If more than 50 files are in scope, warn the user:
"Large scope: {N} files detected. Consider narrowing with `/review src/specific-dir/`."
Ask if they want to continue or narrow the scope.

Capture both the file list AND the diff:
- For staged: `git diff --cached`
- For branch: `git diff main`
- For arguments: `git diff main -- <files>` (or full file content if no diff exists)

## Phase 2: Dispatch Review Agents

Launch **three agents in parallel** using the Agent tool. Each agent receives the same scope but a different expertise lens.

**CRITICAL:** All three Agent calls MUST be in a single message so they run in parallel.

For each agent, construct the prompt as follows:

### Code Quality Agent prompt:

```
You are a code quality reviewer. Review the following files and diffs.

## Your Expertise
<read and include contents of skills/review/references/code-quality.md>

## Your History (past findings and decisions for this project)
<read and include contents of skills/review/references/history/code-quality-history.md>

## Project Context
<read and include contents of CLAUDE.md>

## Files to Review
<list of files with full content>

## Diffs
<the diff output>

Review these changes and output your findings. Use ONLY the output format specified in your expertise guide. Output NOTHING else — no preamble, no summary, just findings. If you have no findings, output exactly: NO_FINDINGS
```

### Spec Conformance Agent prompt:

```
You are a spec conformance reviewer. Review the following files and diffs against the project specification.

## Your Expertise
<read and include contents of skills/review/references/spec-conformance.md>

## Your History
<read and include contents of skills/review/references/history/spec-conformance-history.md>

## Application Specification
<read and include contents of docs/spec.md — if it doesn't exist, note this in output>

## Project Context
<read and include contents of CLAUDE.md>

## Files to Review
<list of files with full content>

## Diffs
<the diff output>

Review these changes and output your findings. Use ONLY the output format specified in your expertise guide. Output NOTHING else — no preamble, no summary, just findings. If you have no findings, output exactly: NO_FINDINGS
```

### Security Agent prompt:

```
You are a security reviewer. Review the following files and diffs for security vulnerabilities.

## Your Expertise
<read and include contents of skills/review/references/security.md>

## Your History
<read and include contents of skills/review/references/history/security-history.md>

## Project Context
<read and include contents of CLAUDE.md>

## Files to Review
<list of files with full content>

## Diffs
<the diff output>

Review these changes and output your findings. Use ONLY the output format specified in your expertise guide. Output NOTHING else — no preamble, no summary, just findings. If you have no findings, output exactly: NO_FINDINGS
```

## Phase 3: Collect and Present Findings

After all three agents return, parse their outputs. Each finding has:
- FINDING, SEVERITY, CONFIDENCE, FILE, DESCRIPTION, SUGGESTION

**Filter:** Drop any finding with CONFIDENCE: low.

**Group** remaining findings by agent, then by severity within each agent section.

**Present** to user in this format:

```
## Code Quality ({count} findings)

🔴 CRITICAL: {title}
   {file}:{line}
   {description}
   Suggestion: {suggestion}

🟡 WARNING: {title}
   ...

🔵 INFO: {title}
   ...

## Spec Conformance ({count} findings)
...

## Security ({count} findings)
...
```

If all agents returned NO_FINDINGS, tell the user: "All clear — no issues found by any reviewer." and stop.

## Phase 4: Fix or Skip

Ask the user using AskUserQuestion:

"Fix these findings? Options: all (fix everything), select (choose which to fix), skip (done reviewing)"

### If `skip`:
Stop. Review complete.

### If `select`:
Number each finding and ask the user which ones to fix (by number or category name). Only send selected findings to fix agents.

### If `all` or after selection:
Proceed to Phase 5.

## Phase 5: Dispatch Fix Agents

Launch **three fix agents in parallel**, each with `isolation: "worktree"`. Each agent receives only its category's findings.

**CRITICAL:** All three Agent calls MUST be in a single message with `isolation: "worktree"`.

### Fix agent prompt template (same structure for all three, with category-specific findings):

```
You are a fix agent for {category} issues. Apply the following fixes to the codebase.

## Findings to Fix
{list of findings with FILE, DESCRIPTION, SUGGESTION for this category}

## History (follow established patterns)
<contents of skills/review/references/history/{category}-history.md>

## Instructions
1. Read each file mentioned in the findings
2. Apply the suggested fix (or a better fix if the suggestion is suboptimal)
3. Run `pnpm test` after all fixes to verify nothing broke
4. If tests fail, adjust your fix until tests pass
5. Commit your changes with message: "fix({category}): {brief description of fixes}"

Do NOT fix issues from other categories. Only fix what's listed above.

## History file paths
- Code quality: skills/review/references/history/code-quality-history.md
- Spec conformance: skills/review/references/history/spec-conformance-history.md
- Security: skills/review/references/history/security-history.md

## Constraints
- You may ONLY modify files that appear in the FINDING entries above
- You may NOT modify: CLAUDE.md, .env, .env.*, scripts/, docker/, .github/, .claude/, skills/
- If a suggested fix requires modifying a file not in the findings list, skip it and report why
```

If a category has no findings to fix, do NOT dispatch a fix agent for it.

## Phase 6: Coordinate and Merge

After all fix agents complete, their worktrees will have branches with changes.

Launch a **coordinator agent** that:

1. Gets the branch names from each fix agent's worktree result
2. For each branch with changes, attempts to merge it into the current working branch:
   ```bash
   git log --oneline <branch-name> ^HEAD  # inspect what will be merged
   git merge <branch-name> --no-ff --no-edit
   ```
   Use `--no-ff` to always create an auditable merge commit.
3. If a merge conflict occurs:
   - Run `git diff --name-only --diff-filter=U` to find conflicting files
   - Present the conflicts to the user with both sides
   - Ask the user which version to keep, or let them resolve manually
   - After resolution: `git add <resolved-files> && git commit --no-edit`
4. After all merges complete, verify tests pass: `pnpm test`

## Phase 7: Update History

After fixes are confirmed and merged, append entries to each agent's history file.

History file paths (use exact filenames):
- Code quality findings → `skills/review/references/history/code-quality-history.md`
- Spec conformance findings → `skills/review/references/history/spec-conformance-history.md`
- Security findings → `skills/review/references/history/security-history.md`

For each finding that was fixed, append to the relevant history file:

```markdown
## {YYYY-MM-DD}: {finding title}
- **Finding**: {description}
- **Resolution**: {what was done to fix it}
- **Decision**: {any key decision made — e.g., "accepted pattern X as intentional", "standardized on approach Y"}
```

If a finding was skipped (user chose `select` and excluded it), do NOT add it to history.

## Phase 8: Re-Review Loop

After fixes are merged and history updated:

1. Get the list of files modified by fix agents: `git diff HEAD~{N} --name-only` where N is the number of merge commits
2. If files were modified, restart from **Phase 2** with those files as the new scope
   (Phase 1 is skipped because the scope is explicitly the files modified by fix agents, not re-detected from staged/branch diff.)
3. The loop continues until:
   - No findings remain (all agents return NO_FINDINGS)
   - User chooses `skip` in Phase 4
   - User explicitly says they're satisfied

Tell the user which iteration they're on: "Re-review (iteration {N}): checking files modified by fixes..."
