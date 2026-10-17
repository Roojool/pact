# PACT — AI business setup

Business setup is the first screen of this PACT release: describe your business →
review an editable setup → create a real company workspace → check/repair/approve.
The **Morrow Studio sample workspace stays reachable** from setup. The release is
published in the original public repository and deployed to the existing domain
(<https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com>). Production
desktop/mobile journeys and one real AI setup request passed on 18 Oct 2026 IST;
see [`verification/ai-release.json`](./verification/ai-release.json). It is a staff
and task planner, not a till, stock system or live customer-order manager.

## Two ways to set up

- **AI:** write a short prompt such as “I run a small burger shop in Pune. Set up
  my team and next two days.” AI proposes a business profile, team roles, tasks,
  time estimates, working hours and responsibility rules. Real details in the note
  take priority. Missing names use role placeholders; proposed defaults are listed
  as assumptions. Review/edit everything and explicitly accept the assumptions
  before creating the workspace. Setup itself never books work.
- **Manual:** choose **Fill it in myself** and enter the same fields. Unknown time
  estimates and responsibilities remain unknown. Both paths feed the same real
  checker, source records and human approval flow.

Short-prompt generation uses one strict structured-output Responses request,
with no tools or database writes. It uses the existing durable shared budget gate.
The old Eve members have fixed analysis prompts, so setup uses the budgeted direct
transport; plan explanations may still use Eve. Incomplete output, invalid quotes,
unlabelled defaults, unavailable credentials or exhausted budget fail closed.
There is no automatic provider retry or fake generated fallback.

## Try both businesses without an AI call

**Agency example:** Sunroom Studio, Neha and Rohan, three client jobs. Check the
plan, move the flexible Comet job, approve it and edit a duration to invalidate
that check. Unconfirmed responsibilities can be recorded later with sources.

**Burger-shop example:** BunStop is a fictional independent burger shop. Its
original red/gold burger mark does not use a real chain’s logo. Sana has four
eligible hours on Day 1, but ingredient prep, opening checks and team training need
six. Only training may move to Day 2. PACT offers that repair and refuses to assign
the counter worker to tasks they are recorded as not allowed to handle. Approval
saves actual staff-hour reservations and next steps. Prep and opening checks stay
on Day 1. This example does not model stock quantities, food-safety certification,
task sequencing or restaurant service times.

Both examples are explicitly hand-authored, not AI results. Custom workspace data
persists in FalkorDB and stays isolated between browser sessions. Existing work
cannot be overwritten by setup. Creation and approval have idempotent retries and
revision/source guards. Drafts survive browser reloads through local storage;
creation clears that draft. Clear inputs on shared machines.

## Run locally

```powershell
npm ci
docker run -d --name pact-setup-graph -p 127.0.0.1:17379:6379 falkordb/falkordb:latest
```

Create an ignored `.env.local` with `FALKORDB_URL=redis://127.0.0.1:17379`, a random
`SESSION_SECRET` of at least 32 characters and `OPENAI_API_KEY=`. Run
`npm run dev -- --port 3101`. Manual setup/examples need no provider key.

AI setup additionally needs a server-side key and `PACT_BUDGET_URL` pointing to
**the existing shared persistent budget store**. Retain its graph, cap and reserve;
never initialise a fresh allowance for this app or expose production DB/budget
ports. Without this configuration the AI button is disabled. No credentials are
copied from the original app.

## Bounds and verification

1–6 tasks, 1–4 team members, whole task durations 1–8 hours or unknown, two planning
days with one-hour slots from 09:00 to 17:00. Every task is handled by one eligible
team member. This is a bounded planning prototype, not unrestricted business
automation. Suggested qualifications are never treated as verified credentials.
Exact source excerpts are validated; interpretation still requires user review.

`npm test` checks domain/provider contracts with injected responses. Run graph and
setup integration tests against local FalkorDB. With the local app running,
`node scripts/check_business_setup.cjs` checks agency setup/recovery/isolation,
`node scripts/check_burger_business.cjs` checks food-shop setup, real checking,
repair/approval/memory/edit, six mobile views and server/client assumption gates,
and `node scripts/check_reset_dialog.cjs` checks the start-over dialog at desktop
and mobile widths (set `PACT_BASE_URL` to point any of them at another running
instance, e.g. the production URL; they default to `http://127.0.0.1:3101`).
Private screenshots/results are under `output/business-setup/` and
`output/reset-dialog/`.

One real short-prompt setup request was verified on 2026-10-16: two team roles,
three tasks and explicit reviewable assumptions. Its ledger estimate was $0.024456;
the existing $5 cap remains unchanged (spent $0.880152, reserved $0 at that
checkpoint, not a provider billing statement). Credentials remain server-side.
The local test uses a source-IP-restricted SSH tunnel to the existing India
production ledger; the workspace database stays separate on port 17379. If the
tunnel or VM is unavailable, generation must fail closed.

The contract also uses injected responses; manual and labelled examples use the
actual browser, API and FalkorDB. The burger demo is recorded from that local example,
not an AI-generated result. That historical recording remains published. The
current main site now offers business setup, verified separately with one real
production AI setup request and deterministic planning/approval/recall.

**Start over** returns to new business setup, instead of implicitly
loading the original sample. The dialog is centered, traps focus, restores focus
on cancel and stays open if the reset fails.
