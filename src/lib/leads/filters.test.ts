import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseFieldFilters, savedViewPayload } from "./filters";

describe("people list filters", () => {
  test("parses email status, city and country filters", () => {
    const filters = parseFieldFilters([
      "x_email_status|eq|not contacted",
      "x_city|contains|Delhi",
      "x_country|eq|India",
      "do_not_contact|true",
    ]);
    assert.deepEqual(filters, [
      { key: "x_email_status", op: "eq", value: "not contacted" },
      { key: "x_city", op: "contains", value: "Delhi" },
      { key: "x_country", op: "eq", value: "India" },
      { key: "do_not_contact", op: "true" },
    ]);
  });

  test("drops a filter whose key is not an identifier", () => {
    assert.deepEqual(parseFieldFilters(["email;drop|eq|x"]), []);
  });

  test("a saved view keeps its columns, filters and sort", () => {
    const view = savedViewPayload({
      name: "Valid email, not contacted",
      entity: "person",
      columns: ["first_name", "email", "x_email_status", "do_not_contact"],
      filters: [{ key: "x_email_status", op: "eq", value: "not contacted" }],
      sortKey: "x_email_status",
      sortDirection: "asc",
    });
    const restored = savedViewPayload(JSON.parse(JSON.stringify(view)));
    assert.deepEqual(restored, view);
    assert.equal(restored.sortKey, "x_email_status");
    assert.equal(restored.columns.includes("x_city") || restored.columns.includes("x_email_status"), true);
  });
});
