import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { assertCampaignHasLeads, beginTeamCreate, canDeleteTeam, endTeamCreate, enrollRefusal, personDeleteBlock, whatsAppHref } from "./deskRules";

describe("recruiter desk rules", () => {
  test("send and enroll refuse Do Not Contact before suppression", () => {
    assert.equal(enrollRefusal({ doNotContact: true, suppressed: false }), "do_not_contact");
    assert.equal(enrollRefusal({ doNotContact: false, suppressed: true }), "suppressed");
    assert.equal(enrollRefusal({ doNotContact: false, suppressed: false }), null);
  });

  test("a person with no CRM record can be deleted, and a sending enrollment blocks it", () => {
    assert.equal(personDeleteBlock({ sendingCampaigns: [], idleCampaigns: [], hasCrm: false, removeIdleEnrollments: false }), null);
    assert.match(personDeleteBlock({ sendingCampaigns: ["Outbound"], idleCampaigns: [], hasCrm: false, removeIdleEnrollments: false }) ?? "", /sending campaign/);
  });

  test("a campaign cannot start with zero leads", () => {
    assert.throws(() => assertCampaignHasLeads(0), /at least one lead/);
    assert.doesNotThrow(() => assertCampaignHasLeads(1));
  });

  test("the last team can be deleted", () => {
    assert.deepEqual(canDeleteTeam({ isLast: true }), { ok: true });
  });

  test("a second team create for the same name is refused until the first finishes", () => {
    assert.equal(beginTeamCreate("org", "Delivery"), true);
    assert.equal(beginTeamCreate("org", "Delivery"), false);
    endTeamCreate("org", "Delivery");
    assert.equal(beginTeamCreate("org", "Delivery"), true);
    endTeamCreate("org", "Delivery");
  });

  test("WhatsApp click-to-chat needs an E.164 number", () => {
    assert.equal(whatsAppHref(null), null);
    assert.equal(whatsAppHref("9876543210"), null);
    assert.equal(whatsAppHref("+919876543210"), "https://wa.me/919876543210");
  });
});
