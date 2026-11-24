import * as chrono from "chrono-node";
import type { ExtractedDate, ExtractedTokens } from "../types.js";

const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "born", "by", "company", "corp",
  "dog", "cat", "pet", "favorite", "for", "from", "has", "have", "he", "her",
  "his", "in", "inc", "is", "it", "its", "lives", "llc", "ltd", "mr", "mrs",
  "ms", "my", "name", "of", "on", "or", "our", "she", "team", "that", "the",
  "their", "they", "this", "to", "was", "were", "with", "work", "works",
]);

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail", "yahoo", "outlook", "hotmail", "icloud", "proton", "protonmail",
  "live", "msn", "aol", "mail", "yandex", "zoho", "gmx",
]);

function splitTrailingDigits(handle: string): { base: string; digits: string | null } {
  const match = handle.match(/^([a-zA-Z][a-zA-Z0-9._-]*?)(\d{2,8})$/);
  if (!match) {
    return { base: handle, digits: null };
  }
  return { base: match[1], digits: match[2] };
}

/**
 * Expands a multi-word phrase (e.g., "John Doe", "Cyber Corp") into
 * single meaningful words, concatenated compound, acronym/initials,
 * and first-initial/last-name patterns.
 */
export function expandTokenVariants(phrase: string): string[] {
  const cleaned = phrase
    .replace(/['"`]/g, "")
    .replace(/[^\p{L}\p{N}\s._-]/gu, " ")
    .trim();

  if (!cleaned) return [];

  const parts = cleaned
    .split(/[\s._-]+/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2 && !STOPWORDS.has(p.toLowerCase()));

  const variants = new Set<string>();

  if (parts.length === 1) {
    variants.add(parts[0]);
    return [...variants];
  }

  if (parts.length > 1) {
    // Full compound first (e.g. johndoe)
    variants.add(parts.join(""));

    // Individual words
    for (const part of parts) {
      variants.add(part);
    }

    // 2-word name heuristics: jdoe, johnd
    if (parts.length === 2) {
      variants.add(parts[0][0] + parts[1]);
      variants.add(parts[0] + parts[1][0]);
    }

    // Acronym / initials (e.g. jd, nfsu)
    const acronym = parts.map((p) => p[0]).join("");
    if (acronym.length >= 2) {
      variants.add(acronym);
    }
  }

  return [...variants];
}

/**
 * Deterministic OSINT token extractor using chrono-node for dates and
 * regex parsers for emails, social handles, quoted aliases, and numbers.
 */
export function extractDeterministic(text: string): ExtractedTokens {
  const names: string[] = [];
  const usernames: string[] = [];
  const orgs: string[] = [];
  const keywords: string[] = [];
  const numbers: string[] = [];
  const dates: ExtractedDate[] = [];
  const seenDates = new Set<string>();

  // 1. Dates via chrono-node
  const parsedDates = chrono.parse(text);
  for (const res of parsedDates) {
    const comp = res.start;
    const year = comp.get("year");
    const month = comp.get("month");
    const day = comp.get("day");
    if (year == null) continue;

    const hasMonth = comp.isCertain("month");
    const hasDay = comp.isCertain("day");
    const key = `${year}-${hasMonth ? month : 0}-${hasDay ? day : 0}`;
    if (seenDates.has(key)) continue;
    seenDates.add(key);

    dates.push({
      raw: res.text.trim(),
      day: day ?? 1,
      month: month ?? 1,
      year,
      hasDay,
      hasMonth,
    });
  }

  // 2. Emails: user.name@company.com
  const emailRe = /\b([a-zA-Z0-9._+-]{2,})@([a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+)\b/g;
  for (const match of text.matchAll(emailRe)) {
    const local = match[1];
    const domain = match[2].split(".")[0];
    usernames.push(local);
    for (const sub of local.split(/[._+-]/)) {
      if (sub.length >= 2) usernames.push(sub);
    }
    const { base, digits } = splitTrailingDigits(local);
    if (base !== local && base.length >= 2) usernames.push(base);
    if (digits) numbers.push(digits);

    if (domain && domain.length >= 2 && !GENERIC_EMAIL_DOMAINS.has(domain.toLowerCase())) {
      orgs.push(domain);
    }
  }

  // 3. Social URLs & @handles
  const urlHandleRe =
    /(?:github\.com|linkedin\.com\/in|x\.com|twitter\.com|instagram\.com|t\.me)\/([a-zA-Z0-9_.-]{2,39})/gi;
  for (const match of text.matchAll(urlHandleRe)) {
    const handle = match[1].replace(/[/.]+$/, "");
    usernames.push(handle);
    const { base, digits } = splitTrailingDigits(handle);
    if (base !== handle && base.length >= 2) usernames.push(base);
    if (digits) numbers.push(digits);
  }

  const atHandleRe = /(?:^|[\s(,])@([a-zA-Z0-9_.-]{2,32})\b/g;
  for (const match of text.matchAll(atHandleRe)) {
    const handle = match[1];
    usernames.push(handle);
    const { base, digits } = splitTrailingDigits(handle);
    if (base !== handle && base.length >= 2) usernames.push(base);
    if (digits) numbers.push(digits);
  }

  // 4. Quoted aliases / nicknames: 'Maverick' or "Maverick"
  const quotedRe = /['"]([A-Za-z0-9][A-Za-z0-9 _-]{1,24})['"]/g;
  for (const match of text.matchAll(quotedRe)) {
    const alias = match[1].trim();
    if (alias.length >= 2) {
      names.push(alias);
    }
  }

  // 5. Standalone numbers (2-8 digits, including years 1940-2035)
  const numRe = /\b(\d{2,8})\b/g;
  const seenNums = new Set<string>(numbers);
  for (const match of text.matchAll(numRe)) {
    const num = match[1];
    if (!seenNums.has(num)) {
      seenNums.add(num);
      numbers.push(num);
    }
  }

  return {
    names,
    usernames,
    pets: [],
    orgs,
    locations: [],
    keywords,
    dates,
    numbers,
  };
}
