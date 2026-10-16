# PACT Lab — business setup fork

This is a separate version of PACT. It does not update the original repository's
main branch or its deployed app. It keeps the sunset dashboard and adds a real
business setup flow before the dashboard.

## Try it

1. Open the fork locally and choose **Explore an example draft (no AI call)**.
2. Rename the company, review Neha/Rohan's hours and the three jobs, and record
   whether Rohan is approved for each job. The example initially leaves these
   permissions unknown.
3. Confirm the facts and choose **Create my workspace**. No work is booked by setup.
4. Choose **Check this plan**, review the Comet deadline repair and approve it.
5. Edit Aurora from four to five hours and check again. The earlier approval is
   preserved, but the changed plan needs another repair.

The example draft is hand-authored and labelled. It exercises real HTTP routes,
FalkorDB persistence, checking, approval and editing. It is not an AI demonstration.

**Draft my setup with AI** sends your note to the configured provider only after
you click it. It uses one structured extraction call through the existing durable
budget gate. The old Eve members have fixed analysis prompts, so setup uses the
existing budgeted direct Responses transport; plan analysis can still use Eve.
The request uses strict structured output and rejects incomplete responses; see
the [official OpenAI documentation](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).
AI cannot create a workspace, approve work or invent missing permissions.
Failed extraction leaves the note intact and manual completion available.

## Run locally

Use the same locked Node dependencies as the original project:

```powershell
npm ci
docker run -d --name pact-setup-graph -p 127.0.0.1:17379:6379 falkordb/falkordb:latest
```

Create an ignored `.env.local` with `FALKORDB_URL=redis://127.0.0.1:17379`, a
random `SESSION_SECRET` of at least 32 characters, and `OPENAI_API_KEY=`. Then run
`npm run dev -- --port 3101`. The example/manual flows need no model key.

To enable live extraction, configure a server-side `OPENAI_API_KEY` and explicitly
set `PACT_BUDGET_URL` to the **existing shared persistent budget store**. Retain its
`PACT_BUDGET_GRAPH` and the existing cap/reserve; do not initialise another spending
allowance for the fork. AI fails closed without that configuration. Do not expose
the original production graph or budget port publicly to enable local access.

The fork uses cookie `pact_setup_workspace` and graph prefix `pact-setup-ws-`.
Setup cannot replace a pre-existing company. Initial creation is atomic and
idempotent, including concurrent retries. All unknown values remain unconfirmed;
unknown hours can be filled later and missing client permissions can be recorded
under **Your work** with source records and revision checks.

## Bounds and evidence

- 1–6 editing jobs, 1–4 editors, whole job hours 1–8 or unknown, two planning days
  with one-hour availability slots between 09:00 and 17:00. This is not a general
  business workflow generator or an unlimited calendar.
- An AI citation must be an exact excerpt from the input note. Excerpt validation
  does not prove interpretation is correct: the user must review each field.
- Imported and corrected facts are saved with their original excerpts and
  user-confirmed values. Custom jobs do not receive fictional creators.
- Drafts are stored in this browser's local storage for recovery. Clear the note
  when finished on a shared machine; the draft is removed after successful creation.
- The browser and real-FalkorDB journey are verified without provider calls. The
  extraction contract, malformed output, unavailable credentials and budget
  rejection are tested using injected provider responses. A fresh live extraction
  has **not** been run; no new paid test or recording is part of this fork.

Run `npm test`, then set `FALKORDB_URL` and run the graph/setup integration tests.
With the local app running, `node scripts/check_business_setup.cjs` checks the
onboarding-to-edit journey at desktop and 390px, saving actual screenshots and
`output/business-setup/result.json`. Existing deterministic inspection tooling can
still enter the original sample explicitly.

The published video/deck inherited from PACT show the original app. They do not
demonstrate this new onboarding. The three-minute storyboard above is ready for
a later bounded recording after any permitted live extraction is verified.
