import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import {
  expandTokenVariants,
  extractDeterministic,
  generateWordlist,
} from "../index.js";

test("extractDeterministic parses dates, emails, handles, nicknames, and numbers", () => {
  const sample =
    "John 'Maverick' Doe. Born 12 Aug 1990. Contact john.doe90@cybercorp.io or @maverick_99, github.com/adper0705.";
  const res = extractDeterministic(sample);

  assert.ok(res.names.includes("Maverick"));
  assert.ok(res.usernames.includes("john.doe90"));
  assert.ok(res.usernames.includes("maverick_99"));
  assert.ok(res.usernames.includes("adper0705"));
  assert.ok(res.usernames.includes("adper"));
  assert.ok(res.orgs.includes("cybercorp"));
  assert.ok(res.numbers.includes("0705"));
  assert.ok(res.numbers.includes("1990"));
  assert.ok(res.dates.some((d) => d.year === 1990 && d.month === 8 && d.day === 12));
});

test("expandTokenVariants splits multi-word phrases and generates initials", () => {
  const variants = expandTokenVariants("John Doe");
  assert.ok(variants.includes("JohnDoe"));
  assert.ok(variants.includes("John"));
  assert.ok(variants.includes("Doe"));
  assert.ok(variants.includes("JDoe"));
  assert.ok(variants.includes("JohnD"));
  assert.ok(variants.includes("JD"));
});

test("generateWordlist ranks high-signal candidates before deep mutations", () => {
  const tokens = {
    names: ["John Doe", "Maverick"],
    usernames: ["jdoe"],
    pets: ["Buster"],
    orgs: ["CyberCorp"],
    locations: [],
    keywords: ["Arsenal"],
    dates: [{ raw: "12 Aug 1990", day: 12, month: 8, year: 1990, hasDay: true, hasMonth: true }],
    numbers: ["1990"],
  };

  const fast = generateWordlist(tokens, { profile: "fast" });
  const standard = generateWordlist(tokens, { profile: "standard" });
  const deep = generateWordlist(tokens, { profile: "deep" });

  assert.ok(fast.length < standard.length);
  assert.ok(standard.length < deep.length);

  // High-signal candidates should appear well before keyboard walks
  const busterIdx = standard.indexOf("buster1990");
  const maverickIdx = standard.indexOf("maverick");
  const policyIdx = standard.indexOf("Buster@1990");
  assert.ok(maverickIdx >= 0 && maverickIdx < 50);
  assert.ok(busterIdx >= 0);
  assert.ok(policyIdx >= 0);
  assert.equal(standard.includes("qwerty"), false);
  assert.equal(deep.includes("qwerty"), true);
});

test("generateWordlist enforces length, policy filters, and limit", () => {
  const tokens = {
    names: ["Maverick"],
    usernames: [],
    pets: ["Buster"],
    orgs: [],
    locations: [],
    keywords: [],
    dates: [{ raw: "12 Aug 1990", day: 12, month: 8, year: 1990, hasDay: true, hasMonth: true }],
    numbers: [],
  };

  const filtered = generateWordlist(tokens, {
    profile: "standard",
    minLen: 8,
    maxLen: 16,
    requireUpper: true,
    requireLower: true,
    requireDigit: true,
    requireSymbol: true,
    limit: 25,
  });

  assert.ok(filtered.length > 0 && filtered.length <= 25);
  for (const w of filtered) {
    assert.ok(w.length >= 8 && w.length <= 16);
    assert.match(w, /[A-Z]/);
    assert.match(w, /[a-z]/);
    assert.match(w, /\d/);
    assert.match(w, /[^a-zA-Z0-9]/);
  }
});

test("CLI executes with --no-model and --tokens-only", () => {
  const cliPath = resolve("dist/cli.js");
  const out = execFileSync(
    process.execPath,
    [cliPath, "-t", "Born 12 Aug 1990, handle @adper0705", "--no-model", "--tokens-only", "-q"],
    { encoding: "utf8" },
  );
  const parsed = JSON.parse(out);
  assert.ok(parsed.usernames.includes("adper0705"));
  assert.ok(parsed.dates.some((d: { year: number }) => d.year === 1990));
});
