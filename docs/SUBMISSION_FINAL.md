# PACT — final submission copy

Verified application: commit `27664aa`, deployed on 18 Oct 2026 IST at the existing URL. Public source and social links remain unchanged. The current narrated demo is published on the existing watchpage and as a downloadable MP4; its new YouTube URL must be supplied by the participant after upload. The older submitted YouTube video remains available as historical evidence.

## Team

Rujul Talekar — solo participant.

## Project title

PACT — Check the promise before you make it

## Description

Small teams often accept work that looks manageable individually but becomes impossible when deadlines, staff availability and responsibility rules overlap. PACT checks whether those promises fit together before the team commits.

Start by describing your business and work in plain language. AI proposes an editable setup with team members, tasks, available hours and clearly listed assumptions. Review the inputs, accept the assumptions and confirm the workspace. Manual setup and clearly labelled examples remain available.

FalkorDB connects the work, people, hours, responsibility rules, source documents and decisions. Deterministic checks identify conflicts and verify proposed changes. In our fictional BunStop shop, three tasks need 6 hours but the eligible kitchen lead has only 4 hours on Day 1. PACT keeps fixed preparation and opening checks on Day 1 and proposes moving flexible training to Day 2. The original Morrow Studio example demonstrates a 12-hour/8-hour conflict involving client approvals.

A person approves the repair. PACT saves internal time reservations and follow-up tasks, and later questions recover the decision with its supporting sources. Optional graph-grounded AI explanations coordinate between Account Manager and Producer roles; AI drafting never approves or executes work.

PACT is a bounded two-day staff-and-task planning prototype, not a POS, inventory or live-order system. Unknown information stays unknown. Demonstration business data is synthetic, and AI development assistance is disclosed in the repository.

## Tracks — select all three

- Agents That Act on Connected Data
- Agent Memory and Coordination
- Company Brain

## Repository

https://github.com/Roojool/pact

## Demo video — required YouTube field

Replacement YouTube URL: pending the participant's upload of the accepted new MP4.

Current demo watchpage:
https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo#ai-setup

Accepted MP4 download:
https://github.com/Roojool/pact/releases/download/v1.2.0-ai-setup/PACT_ai_release.mp4

Copy-paste upload title and description: [VIDEO_UPLOAD.md](./VIDEO_UPLOAD.md).
The submission form requires a YouTube URL; the watchpage is supplementary.

Existing submitted video: https://youtu.be/PKR43OuwzXg
This is the historical original-app recording, not footage of AI business setup.

## Live demo or deployment

https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com

## How did you use FalkorDB?

FalkorDB is PACT's primary application database. It stores work commitments, people, working slots, responsibility and approval facts, source documents, proposed repairs, decisions, reservations, tasks and memory.

Cypher traversals connect each job to eligible team members, their available capacity and the sources supporting those facts. A bounded scheduling checker evaluates that graph-derived context to detect shared shortages and verify repairs. Missing information is reported as unknown rather than guessed.

AI setup produces a draft without database mutation tools. After human review and confirmation, the accepted inputs and assumptions are persisted with source records in FalkorDB. A separate human approval records internal time reservations and next steps. Workspace revisions, source versions and idempotency guards protect against stale proposals, replay and competing writes.

The graph also stores durable handoff context for the Account Manager and Producer roles, plus workspace memory for source-backed recall. Citations returned by agent paths are filtered against real source IDs. The graph model, essential Cypher queries, scheduling algorithm, setup instructions and verification evidence are public in the repository.

The fresh release recording verifies actual AI setup followed by deterministic checking, approval and recall. Live two-role analysis and live memory have separate dated historical verification; they were not re-run for this recording.

## Blog / LinkedIn link

Existing submitted profile (unchanged):
https://www.linkedin.com/in/rujul-talekar/

Existing project post (unchanged; a more direct project reference):
https://lnkd.in/p/dnpZSBgW

## What did you like about FalkorDB?

Cypher made it straightforward to express relationships between work, people, approvals and source evidence. Traversals let PACT explain why a person is eligible for a task and which facts support a planning decision.

Keeping operational facts, decisions and memory in the same graph was especially useful. It allowed the planner and agent roles to work from connected context while retaining source provenance. Docker also made local development and integration testing practical.

## What improvements would you like to see in FalkorDB?

More complete examples of graph-backed agents would be helpful, especially examples covering source provenance, durable memory, concurrent updates and recovery from partial failures.

A practical production guide covering backups, schema evolution, connection management, monitoring and deployment on small virtual machines would also help small teams move from a prototype to a dependable application.

## Final human checks

- Upload the accepted replacement MP4 as public or unlisted on YouTube and update the submission's demo URL. A new upload has a new URL; changing an existing video's description does not.
- Check the submitted links while signed out.
- Personally complete docs/PARTICIPANT_WALKTHROUGH.md. Its completion has not been claimed on your behalf.
- Do not describe internal reservations as external execution, or historical media as a fresh AI demonstration.
