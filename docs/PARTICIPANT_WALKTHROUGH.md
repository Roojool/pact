# Explain PACT in your own words

This is a review guide for the solo participant (Rujul Talekar), not a substitute
for reading and understanding the implementation. The full AI-assistance
disclosure, verified-checks summary and cost notes are in
[`AI_ASSISTANCE.md`](./AI_ASSISTANCE.md).

## Five things to demonstrate

1. Trace one campaign through its commitment and editing requirement to the
   approved editor. Explain which source establishes eligibility and which
   establishes availability.
2. Explain why 4 hours fits, 8 hours fits and 12 hours does not fit into the
   eligible eight-hour Day-1 window. Then explain why checking total hours alone
   is insufficient when windows differ.
3. Describe how the bounded checker assigns one editor per task and matches its
   hour units to available slots. Identify the model's assumptions, its unknown-data
   behavior, and what `search_limit` means.
4. Show why a proposal's old revision cannot be approved after another edit, and
   what makes an approval replay safe when the first response was lost. Explain
   the difference between saving a plan and delivering a campaign.
5. Start a fresh agent session, recover a decision from FalkorDB and show how a
   changed approval source affects an old rejection.

## Meaningful participant contribution

The participant selected the agency setting, defined the budget and model-use
constraints, chose the visual direction and requested the guided/editable
scenario. During review, personally validate the synthetic business assumptions,
the test counterexamples, the human-approval flow and the actual deployment
behavior. Record further design and debugging decisions in the README or commit
history. Do not claim to have manually authored AI-generated code.

## Quick self-check

- Point to the file and line that proves each of the five items above.
- Run `npm test` and `npm run test:integration` yourself and read the output.
- Re-read `queries/reads.cypher` and `queries/mutations.cypher` and be able to say
  which statements are read-only and which mutate.
- State plainly what is **not** verified (no live model turn; repo/video/deployment
  pending) without overclaiming.

See [`AI_ASSISTANCE.md`](./AI_ASSISTANCE.md) for the full question list.
