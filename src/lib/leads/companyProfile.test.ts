import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { nextCompanyProfile, previewCompanyMerges } from "./companyProfile";

const careerOneStop = {
  name: "Career One Stop",
  linkedinUrl: "https://www.linkedin.com/company/career-one-stop",
  custom: { x_industry: "Recruitment" },
  raw: { s1_body: "kept" },
};

describe("company domain match", () => {
  test("does not rename or rewrite profile fields without overwrite", () => {
    const decision = nextCompanyProfile(
      careerOneStop,
      { name: "CareerOneStop India", linkedinUrl: "https://www.linkedin.com/company/other", custom: { x_industry: "Staffing" }, raw: { s2_body: "new" } },
      false,
    );
    assert.equal(decision.nameWouldChange, true);
    assert.equal(decision.profile.name, "Career One Stop");
    assert.equal(decision.profile.linkedinUrl, careerOneStop.linkedinUrl);
    assert.equal(decision.profile.custom.x_industry, "Recruitment");
    assert.equal(decision.profile.raw.s1_body, "kept");
    assert.equal(decision.profile.raw.s2_body, "new");
  });

  test("overwrite is opt-in and then applies the incoming name", () => {
    const decision = nextCompanyProfile(careerOneStop, { name: "CareerOneStop India" }, true);
    assert.equal(decision.profile.name, "CareerOneStop India");
    assert.equal(decision.write, true);
  });

  test("a blank incoming name does not clear the stored name even with overwrite", () => {
    const decision = nextCompanyProfile(careerOneStop, { name: "  " }, true);
    assert.equal(decision.profile.name, "Career One Stop");
  });

  test("preview says which companies would be reused and which names would change", () => {
    const preview = previewCompanyMerges(
      new Map([["careeronestop.in", { name: "Career One Stop" }]]),
      [
        { domain: "careeronestop.in", name: "Someone Else" },
        { domain: "newco.example", name: "New Co" },
      ],
    );
    assert.deepEqual(preview, [
      {
        domain: "careeronestop.in",
        action: "reuse",
        currentName: "Career One Stop",
        incomingName: "Someone Else",
        nameWouldChange: true,
      },
      {
        domain: "newco.example",
        action: "create",
        currentName: null,
        incomingName: "New Co",
        nameWouldChange: false,
      },
    ]);
  });
});
