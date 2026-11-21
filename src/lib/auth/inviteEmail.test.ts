import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseInviteEmail } from "./inviteEmail";

describe("invite email", () => {
  test("rejects a clearly bad address", () => {
    assert.equal(parseInviteEmail("not-an-email"), null);
    assert.equal(parseInviteEmail("a@b"), null);
    assert.equal(parseInviteEmail("ada@example..com"), null);
  });

  test("accepts a normal work address", () => {
    assert.equal(parseInviteEmail(" Ada@CareerOneStop.in "), "ada@careeronestop.in");
  });
});
