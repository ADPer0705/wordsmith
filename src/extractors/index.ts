import type { ExtractOptions, ExtractedTokens } from "../types.js";
import { extractDeterministic } from "./deterministic.js";
import { extractWithNer } from "./ner.js";

function dedupeStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of items) {
    const cleaned = raw.trim().replace(/^['"`]+|['"`]+$/g, "");
    if (cleaned.length < 2) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(cleaned);
  }
  return out;
}

/**
 * Extracts structured OSINT tokens from raw text using deterministic
 * date/handle/number parsers and (by default) the local GLiNER ONNX model.
 */
export async function extractTokens(
  text: string,
  options: ExtractOptions = {},
): Promise<ExtractedTokens> {
  const det = extractDeterministic(text);
  const ner =
    options.useModel === false ? {} : await extractWithNer(text, options.onStatus);

  return {
    names: dedupeStrings([...(ner.names ?? []), ...det.names]),
    usernames: dedupeStrings([...det.usernames, ...(ner.usernames ?? [])]),
    pets: dedupeStrings([...(ner.pets ?? []), ...det.pets]),
    orgs: dedupeStrings([...(ner.orgs ?? []), ...det.orgs]),
    locations: dedupeStrings([...(ner.locations ?? []), ...det.locations]),
    keywords: dedupeStrings([...(ner.keywords ?? []), ...det.keywords]),
    dates: det.dates,
    numbers: dedupeStrings(det.numbers),
  };
}
