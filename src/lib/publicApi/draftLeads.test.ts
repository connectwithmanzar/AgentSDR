import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decideDraftImport, draftMergeFields, parseDraftLeadsBody } from "./draftLeads";

const copy = { s1_subject: "Hello", s1_body: "First", s2_body: "Second" };

function decide(overrides: Partial<Parameters<typeof decideDraftImport>[0]> = {}) {
  return decideDraftImport({
    campaignStatus: "draft",
    allowActive: false,
    doNotContact: false,
    suppressed: false,
    existingLead: false,
    hasIdentity: true,
    mergeFields: copy,
    ...overrides,
  });
}

describe("GTM draft import", () => {
  test("holds a new lead and does not describe a send or a start", () => {
    const decision = decide();
    assert.equal(decision.action, "hold");
    if (decision.action !== "hold") return;
    assert.equal(decision.mode, "create");
    assert.equal(decision.mergeFields.s1_subject, "Hello");
    assert.equal(JSON.stringify(decision).includes("send"), false);
  });

  test("a second push updates the held copy instead of creating another lead", () => {
    const decision = decide({ existingLead: true });
    assert.deepEqual(decision, { action: "hold", mode: "update", mergeFields: copy });
  });

  test("Do Not Contact and suppressed people are not enrolled", () => {
    assert.equal(decide({ doNotContact: true }).action, "reject");
    assert.equal(decide({ suppressed: true }).action, "reject");
  });

  test("an actively sending campaign is refused unless the flag is set", () => {
    assert.equal(decide({ campaignStatus: "active" }).action, "reject");
    const allowed = decide({ campaignStatus: "active", allowActive: true });
    assert.equal(allowed.action, "hold");
  });

  test("step copy lands on s1_subject and sN_body", () => {
    assert.deepEqual(
      draftMergeFields({ steps: [{ subject: "Hello", body: "First" }, { subject: "", body: "Second" }] }),
      { s1_subject: "Hello", s1_body: "First", s2_subject: "", s2_body: "Second" },
    );
  });

  test("parseDraftLeadsBody keeps allowActiveCampaign off by default", () => {
    const parsed = parseDraftLeadsBody({
      leads: [{ email: "ada@example.com", steps: [{ subject: "Hi", body: "There" }] }],
    });
    assert.equal(parsed.allowActiveCampaign, false);
    assert.equal(parsed.leads[0].email, "ada@example.com");
  });
});
