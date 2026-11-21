import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { applyImportMapping, suggestImportMapping } from "./importMapping";

describe("people import mapping", () => {
  test("maps city, country and email status onto Lead column keys", () => {
    const headers = ["Email", "City", "Country", "Email status", "s1_body"];
    const mapping = suggestImportMapping(headers);
    const row = applyImportMapping(headers, ["ada@acme.com", "Delhi", "India", "not contacted", "Hello"], Object.fromEntries(Object.entries(mapping).map(([index, key]) => [Number(index), key])));
    assert.equal(row.email, "ada@acme.com");
    assert.equal(row.personCustom.x_city, "Delhi");
    assert.equal(row.personCustom.x_country, "India");
    assert.equal(row.personCustom.x_email_status, "not contacted");
    assert.equal(row.raw.s1Body, "Hello");
  });
});
