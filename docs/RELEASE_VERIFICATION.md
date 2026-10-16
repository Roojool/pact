# Final release verification — 16 October 2026

- [Live PACT app](https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com)
- [Playable demo, captions and deck downloads](https://pact-roojool-20261016.indiasouthcentral.cloudapp.azure.com/demo)
- [Published release v1.0.0](https://github.com/Roojool/pact/releases/tag/v1.0.0)

The Golden Hour interface was checked on actual production at desktop and 390px
mobile widths, including settings, source drawers, the 16-slot timeline, unknown
hours, policy denials, human approval, saved allocations/tasks and stale revisions.
The full UI baseline is `3985edf`. A final provenance correction, `e8fbd44`, replaced
two nonexistent approval-property reads with graph source relationships. Focused
real production checks then returned only valid source IDs: Comet brief and policy;
editor recall also cited the calendar. Source links opened and recall preserved
the plan revision. These final checks made zero model-provider calls.

The editable PowerPoint has eight slides and four native tables. Every exported
PDF slide was visually inspected, including actual production screenshots and the
current India URL. The video is 159.83 seconds, H264/AAC, 1280×720. It decoded without
errors, contains audible-level narration, and passed actual browser playback.
All 43 caption cues loaded; HTTP byte-range streaming, five companion downloads,
desktop layout and 390px mobile layout passed. The six hosted files were verified
against the hashes below before the proxy was updated; graph, web and agent
containers were unchanged by media publication.

The video uses real current-UI rules-mode footage. Its recall scene is explicitly
labeled as a verified post-fix production screenshot. Narration is synthesized
offline; scene boundaries are edited, not a latency benchmark. Earlier live
two-role AI and six-source recall evidence remains historical. No new paid AI test,
user study, project-wide call total or guaranteed real-world delivery is claimed.
All agency data is synthetic; approval creates internal reservations and tasks.

Hosting is in Hyderabad, India South Central, permitted by the Student subscription
policy. The Malaysia VM was deallocated; all 49 source graphs and the exact budget
counters were preserved during migration. The durable $5 application cap stayed
unchanged. The migration checkpoint estimate of $0.855696 is an application-ledger
estimate, not provider billing. Personal participant understanding, walkthrough and
hackathon submission remain human actions.

| Published asset | SHA256 |
| --- | --- |
| PACT_demo.mp4 | `96cbad3a1922587b940ba5855561d46a95629387e646782167ff43a8a68aa329` |
| PACT_demo.srt | `3e07a96a5a2b2c2fa4e4e1aaef2b95d0a7f6578aee974519a1f86d70afd28994` |
| PACT_demo.vtt | `3c05e532abae55a841a288b12ea77f038be05ce6c1f1e8eb9948723accd6ea9b` |
| PACT_demo_narration.md | `2b0ad230ddcaec9723d9e2f9065bdce1f1b44a3783233f8f7063365db160d941` |
| PACT_pitch_final.pptx | `61e25044ea76942067627c95acc8ccda758ec99e704f6342ed083952eff1cf79` |
| PACT_pitch_final.pdf | `be88e130d7257aedf6c57397ee7f21e23422b14189184bafe7de9836130c515b` |
