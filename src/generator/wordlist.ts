import { expandTokenVariants } from "../extractors/deterministic.js";
import type { ExtractedDate, ExtractedTokens, GenerateOptions } from "../types.js";

const TOP_SUFFIXES = ["1", "12", "123", "1234", "!", "@123", "123!", "01", "99", "007", "#1"];
const EXTENDED_SUFFIXES = [
  "12345", "123456", "321", "69", "420", "666", "777", "888", "999", "786",
  "!@#", "pass", "admin", "qwerty", "2020", "2021", "2022", "2023",
];
const POLICY_SYMBOLS = ["@", "!", "#", "$", "_"];
const COMMON_PREFIXES = [
  "the", "my", "its", "mr", "dr", "real", "iam", "big", "dark", "0", "1", "@", "_",
];
const PAIR_SEPARATORS = ["", "_", ".", "-", "@"];
const KEYBOARD_WALKS = [
  "qwerty", "qwertyuiop", "asdfgh", "zxcvbn", "1qaz2wsx", "qazwsx", "1q2w3e4r", "q1w2e3r4",
];

const MONTHS_SHORT = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];
const MONTHS_FULL = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const LEET_FULL: Record<string, string> = {
  a: "4", e: "3", i: "1", o: "0", s: "5", t: "7", g: "9", b: "8", l: "1", z: "2",
};
const LEET_PARTIAL: Record<string, string> = {
  a: "@", e: "3", i: "!", o: "0", s: "$",
};

function titleCase(word: string): string {
  if (!word) return "";
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function camelCase(a: string, b: string): string {
  return a.toLowerCase() + titleCase(b);
}

function fullLeet(word: string): string {
  return word
    .toLowerCase()
    .split("")
    .map((c) => LEET_FULL[c] ?? c)
    .join("");
}

function selectiveLeet(word: string): string[] {
  const lower = word.toLowerCase();
  const out = new Set<string>();
  // Single-character substitutions (most realistic human habit)
  for (let i = 0; i < lower.length; i++) {
    const sub = LEET_PARTIAL[lower[i]];
    if (sub) {
      out.add(lower.slice(0, i) + sub + lower.slice(i + 1));
    }
    const numSub = LEET_FULL[lower[i]];
    if (numSub && numSub !== sub) {
      out.add(lower.slice(0, i) + numSub + lower.slice(i + 1));
    }
  }
  // Full partial leet
  const allPartial = lower
    .split("")
    .map((c) => LEET_PARTIAL[c] ?? c)
    .join("");
  out.add(allPartial);
  out.delete(lower);
  return [...out];
}

function compactDateVariants(d: ExtractedDate): string[] {
  const yyyy = String(d.year);
  const yy = yyyy.slice(-2);
  if (!d.hasMonth && !d.hasDay) {
    return [yyyy, yy];
  }
  const mm = String(d.month).padStart(2, "0");
  const m = String(d.month);
  if (!d.hasDay) {
    return [yyyy, yy, `${mm}${yyyy}`, `${mm}${yy}`, `${yyyy}${mm}`];
  }
  const dd = String(d.day).padStart(2, "0");
  const day = String(d.day);
  return [
    `${dd}${mm}${yy}`,
    `${dd}${mm}${yyyy}`,
    `${mm}${dd}${yy}`,
    `${mm}${dd}${yyyy}`,
    `${yyyy}${mm}${dd}`,
    `${yy}${mm}${dd}`,
    `${dd}${mm}`,
    `${mm}${dd}`,
    `${day}${m}${yy}`,
    yyyy,
    yy,
  ];
}

function extendedDateVariants(d: ExtractedDate): string[] {
  const yyyy = String(d.year);
  const yy = yyyy.slice(-2);
  const out: string[] = [];
  if (d.hasMonth) {
    const monShort = MONTHS_SHORT[d.month - 1];
    const monFull = MONTHS_FULL[d.month - 1];
    if (monShort) {
      out.push(`${monShort}${yy}`, `${monShort}${yyyy}`, `${titleCase(monShort)}${yyyy}`);
    }
    if (monFull) {
      out.push(`${monFull}${yy}`, `${monFull}${yyyy}`, `${titleCase(monFull)}${yyyy}`);
    }
  }
  if (d.hasMonth && d.hasDay) {
    const dd = String(d.day).padStart(2, "0");
    const mm = String(d.month).padStart(2, "0");
    out.push(
      `${dd}-${mm}-${yyyy}`,
      `${yyyy}-${mm}-${dd}`,
      `${mm}/${dd}/${yyyy}`,
      `${dd}.${mm}.${yyyy}`,
    );
  }
  return out;
}

function passesPolicy(candidate: string, options: GenerateOptions): boolean {
  const minLen = options.minLen ?? 1;
  const maxLen = options.maxLen ?? 128;
  if (candidate.length < minLen || candidate.length > maxLen) return false;
  if (options.requireUpper && !/[A-Z]/.test(candidate)) return false;
  if (options.requireLower && !/[a-z]/.test(candidate)) return false;
  if (options.requireDigit && !/\d/.test(candidate)) return false;
  if (options.requireSymbol && !/[^a-zA-Z0-9]/.test(candidate)) return false;
  return true;
}

/**
 * Generates a probability-ranked wordlist ordered from highest-likelihood
 * human password patterns (Tier 1) down to broad exhaustive mutations (Tier 4).
 */
export function generateWordlist(
  tokens: ExtractedTokens,
  options: GenerateOptions = {},
): string[] {
  const profile = options.profile ?? "standard";
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  const list = new Set<string>();

  const add = (candidate: string): boolean => {
    if (list.size >= limit) return false;
    if (!candidate || !passesPolicy(candidate, options)) return true;
    list.add(candidate);
    return list.size < limit;
  };

  // Ordered priority of raw phrases: names & usernames & pets first, then orgs/locations/keywords
  const rawPhrases = [
    ...tokens.names,
    ...tokens.usernames,
    ...tokens.pets,
    ...tokens.orgs,
    ...tokens.locations,
    ...tokens.keywords,
  ];

  const primaryTokens: string[] = [];
  const seenPrimary = new Set<string>();
  const acronyms: string[] = [];

  for (const phrase of rawPhrases) {
    const expanded = expandTokenVariants(phrase);
    for (const v of expanded) {
      const lower = v.toLowerCase();
      if (lower.length < 2 || seenPrimary.has(lower)) continue;
      seenPrimary.add(lower);
      primaryTokens.push(lower);
      // Track short acronyms separately as well
      if (lower.length <= 4 && phrase.trim().includes(" ")) {
        acronyms.push(lower);
      }
    }
  }

  const currentYear = new Date().getFullYear();
  const recentYears = [
    String(currentYear),
    String(currentYear - 1),
    String(currentYear - 2),
    String(currentYear + 1),
  ];

  const targetYearsSet = new Set<string>();
  for (const d of tokens.dates) {
    targetYearsSet.add(String(d.year));
    targetYearsSet.add(String(d.year).slice(-2));
  }
  for (const n of tokens.numbers) {
    if (/^(19|20)\d{2}$/.test(n)) {
      targetYearsSet.add(n);
      targetYearsSet.add(n.slice(-2));
    }
  }
  for (const y of recentYears) {
    targetYearsSet.add(y);
  }
  const targetYears = [...targetYearsSet];

  const dateVariants = [...new Set(tokens.dates.flatMap(compactDateVariants))];
  const targetNumbers = [...new Set(tokens.numbers)];
  const topSuffixes = [...new Set([...TOP_SUFFIXES, ...targetYears])];

  // ── TIER 1: Highest-probability personal base & direct date/number/suffixes ──
  for (const w of primaryTokens) {
    if (!add(w)) return [...list];
    if (!add(titleCase(w))) return [...list];
    if (!add(w.toUpperCase())) return [...list];
  }

  for (const w of primaryTokens) {
    const t = titleCase(w);
    for (const dv of [...dateVariants, ...targetNumbers]) {
      for (const sep of ["", "@", "_", ".", "-"]) {
        if (!add(`${w}${sep}${dv}`)) return [...list];
        if (!add(`${t}${sep}${dv}`)) return [...list];
      }
      if (!add(`${w}${dv}!`)) return [...list];
      if (!add(`${t}${dv}!`)) return [...list];
    }
  }

  for (const w of primaryTokens) {
    const t = titleCase(w);
    for (const sf of topSuffixes) {
      if (!add(`${w}${sf}`)) return [...list];
      if (!add(`${t}${sf}`)) return [...list];
    }
  }

  for (const dv of dateVariants) {
    if (!add(dv)) return [...list];
    if (!add(`${dv}!`)) return [...list];
  }

  // ── TIER 2: Policy-compliant patterns, selective leet, pairwise combos ──────
  const topTokens = primaryTokens.slice(0, 14);

  for (const w of topTokens) {
    const t = titleCase(w);
    for (const sym of POLICY_SYMBOLS) {
      for (const y of targetYears) {
        if (!add(`${t}${sym}${y}`)) return [...list];
        if (!add(`${w}${sym}${y}`)) return [...list];
      }
      if (!add(`${t}${sym}123`)) return [...list];
      if (!add(`${w}${sym}123`)) return [...list];
    }
    for (const y of targetYears) {
      if (!add(`${t}${y}!`)) return [...list];
    }
  }

  for (const w of topTokens.slice(0, 10)) {
    for (const lv of selectiveLeet(w)) {
      if (!add(lv)) return [...list];
      if (!add(titleCase(lv))) return [...list];
      for (const sf of [...TOP_SUFFIXES.slice(0, 6), ...targetYears.slice(0, 4)]) {
        if (!add(`${lv}${sf}`)) return [...list];
        if (!add(`${titleCase(lv)}${sf}`)) return [...list];
      }
    }
  }

  const pairTokens = primaryTokens.slice(0, 12);
  for (let i = 0; i < pairTokens.length; i++) {
    for (let j = 0; j < pairTokens.length; j++) {
      if (i === j) continue;
      const a = pairTokens[i];
      const b = pairTokens[j];
      if (!add(camelCase(a, b))) return [...list];
      for (const sep of PAIR_SEPARATORS) {
        const combos = [
          `${a}${sep}${b}`,
          `${titleCase(a)}${sep}${titleCase(b)}`,
          `${titleCase(a)}${sep}${b}`,
        ];
        for (const c of combos) {
          if (!add(c)) return [...list];
          for (const sf of ["1", "123", "!", ...targetYears.slice(0, 3)]) {
            if (!add(`${c}${sf}`)) return [...list];
          }
        }
      }
    }
  }

  for (const ac of acronyms) {
    for (const y of [...targetYears, ...targetNumbers, ...TOP_SUFFIXES.slice(0, 5)]) {
      if (!add(`${ac}${y}`)) return [...list];
      if (!add(`${ac.toUpperCase()}${y}`)) return [...list];
    }
  }

  if (profile === "fast") {
    return [...list];
  }

  // ── TIER 3: Standard profile (full leet, prefixes, extended dates/suffixes) ──
  for (const w of topTokens) {
    const fl = fullLeet(w);
    const flt = titleCase(fl);
    if (!add(fl)) return [...list];
    if (!add(flt)) return [...list];
    for (const sf of [...TOP_SUFFIXES.slice(0, 6), ...targetYears.slice(0, 4)]) {
      if (!add(`${fl}${sf}`)) return [...list];
      if (!add(`${flt}${sf}`)) return [...list];
    }
  }

  for (const w of topTokens.slice(0, 10)) {
    const t = titleCase(w);
    for (const pf of COMMON_PREFIXES) {
      if (!add(`${pf}${w}`)) return [...list];
      if (!add(`${pf}${t}`)) return [...list];
    }
  }

  for (const w of topTokens.slice(0, 10)) {
    const t = titleCase(w);
    for (const sf of EXTENDED_SUFFIXES) {
      if (!add(`${w}${sf}`)) return [...list];
      if (!add(`${t}${sf}`)) return [...list];
    }
  }

  const extDates = [...new Set(tokens.dates.flatMap(extendedDateVariants))];
  for (const ed of extDates) {
    if (!add(ed)) return [...list];
    for (const w of topTokens.slice(0, 6)) {
      if (!add(`${w}${ed}`)) return [...list];
      if (!add(`${titleCase(w)}${ed}`)) return [...list];
    }
  }

  for (const w of topTokens.slice(0, 10)) {
    const doubled = `${w}${w}`;
    const rev = w.split("").reverse().join("");
    for (const base of [doubled, `${titleCase(w)}${titleCase(w)}`, rev]) {
      if (!add(base)) return [...list];
      for (const sf of ["1", "123", "!"]) {
        if (!add(`${base}${sf}`)) return [...list];
      }
    }
  }

  if (profile === "standard") {
    return [...list];
  }

  // ── TIER 4: Deep profile (triples, broad year sweep, wrappers, keyboard walks) ──
  const tripleTokens = primaryTokens.slice(0, 6);
  for (let i = 0; i < tripleTokens.length; i++) {
    for (let j = 0; j < tripleTokens.length; j++) {
      if (i === j) continue;
      for (let k = 0; k < tripleTokens.length; k++) {
        if (k === i || k === j) continue;
        if (!add(`${tripleTokens[i]}${tripleTokens[j]}${tripleTokens[k]}`)) return [...list];
        if (!add(`${tripleTokens[i]}_${tripleTokens[j]}_${tripleTokens[k]}`)) return [...list];
      }
    }
  }

  for (const w of primaryTokens.slice(0, 8)) {
    const t = titleCase(w);
    for (let yr = 1960; yr <= currentYear + 1; yr++) {
      const y = String(yr);
      if (!add(`${w}${y}`)) return [...list];
      if (!add(`${t}${y}`)) return [...list];
      if (!add(`${w}_${y}`)) return [...list];
    }
    for (const wrapped of [`*${w}*`, `_${w}_`, `-${w}-`]) {
      if (!add(wrapped)) return [...list];
    }
  }

  for (const kw of KEYBOARD_WALKS) {
    if (!add(kw)) return [...list];
    for (const sf of TOP_SUFFIXES.slice(0, 8)) {
      if (!add(`${kw}${sf}`)) return [...list];
    }
  }

  return [...list];
}
