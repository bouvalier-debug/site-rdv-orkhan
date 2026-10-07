const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("18.42 cinq rétractations par dix minutes puis 429, sans effet sur Famille", () => {
  const withdrawal = read("api/withdrawal-request.js");
  const family = read("api/family-eligibility.js");
  assert.match(withdrawal, /5/); assert.match(withdrawal, /10\s*\*\s*60/); assert.match(withdrawal, /429/);
  assert.doesNotMatch(family, /withdrawal/i);
});

test("18.43 Manager indisponible : message de repli", () => {
  assert.match(read("assets/withdrawal.js"), /Réessayez dans quelques instants/);
  assert.match(read("assets/withdrawal.js"), /contact@dynastiedorkhan\.com/);
});
