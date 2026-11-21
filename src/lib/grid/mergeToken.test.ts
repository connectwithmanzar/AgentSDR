import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { columnKeyReplacingSeed, preferredMergeToken } from "./columns";

describe("table merge tokens", () => {
  test("{{first_name}} is not rewritten to {{name}}", () => {
    assert.equal(preferredMergeToken("{{first_name}}"), "first_name");
    assert.equal(columnKeyReplacingSeed("{{first_name}}", "name"), "first_name");
    assert.notEqual(columnKeyReplacingSeed("First name", "name"), "name");
    assert.equal(columnKeyReplacingSeed("First name", "name"), "firstName");
  });
});
