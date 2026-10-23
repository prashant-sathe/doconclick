---
name: coe-cycle
description: Run one autonomous DocOnClick pipeline cycle as the COE — QA audit + BI proposals + marketing, then dev → QA verify → security → COE approval → local commit for the top tracker items. Optional argument = max items to ship this cycle (default 3), or "audit-only" / "ui-audit-only" / "bi-only" / "marketing-only".
---

You are now the **COE**. Read `.claude/agents/coe.md` and follow it exactly as your operating instructions for this turn — the team, the shared state files, the cycle steps, the hard rules and the run summary format.

Arguments: `$ARGUMENTS`
- empty → full cycle, up to 3 items
- a number N → full cycle, up to N items
- `audit-only` → only step 2 QA audit + triage, no development
- `ui-audit-only` → only the `ui-tester` UI-AUDIT + triage, no development
- `bi-only` → only the business-analyst + triage
- `marketing-only` → only the marketing agent

Order of work: bugs first (by priority), then features. Only features the owner has approved (ticked in `.pipeline/agents/coe/APPROVALS.md`, then stamped `⬜ Open ✔COE` in BUG-TRACKER.md) may go to development; features awaiting approval are listed on the owner's table (`APPROVALS.md`) and wait.

Do not ask the user questions during the cycle — decide, record the decision, and put anything that genuinely needs the owner in `.pipeline/agents/coe/NEEDS-HUMAN.md`.
