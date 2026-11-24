import { GLiNER1ONNXRuntime } from "@lmoe/gliner-onnx";
import type { ExtractedTokens } from "../types.js";

const MODEL_ID = "onnx-community/gliner_small-v2.1";
const OSINT_LABELS = [
  "person",
  "nickname",
  "pet",
  "organization",
  "location",
  "team",
  "hobby",
  "username",
  "product",
];

const MAX_CHUNK_CHARS = 1200;

let cachedModel: GLiNER1ONNXRuntime | null = null;

async function getModel(onStatus?: (msg: string) => void): Promise<GLiNER1ONNXRuntime> {
  if (cachedModel) return cachedModel;
  onStatus?.(`Loading local NER model (${MODEL_ID})...`);
  cachedModel = await GLiNER1ONNXRuntime.fromPretrained(MODEL_ID);
  return cachedModel;
}

/**
 * Splits long recon dumps into newline/sentence-aware chunks so
 * the encoder never truncates entities deep in the text.
 */
function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.length <= maxChars) return [trimmed];

  const chunks: string[] = [];
  const paragraphs = trimmed.split(/\n+/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n" + para).trim().length <= maxChars) {
      current = current ? `${current}\n${para}` : para;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = "";
    }

    if (para.length <= maxChars) {
      current = para;
    } else {
      // Split long paragraph on sentence boundaries
      const sentences = para.split(/(?<=[.!?])\s+/);
      for (const sentence of sentences) {
        if ((current + " " + sentence).trim().length <= maxChars) {
          current = current ? `${current} ${sentence}` : sentence;
        } else {
          if (current) chunks.push(current);
          current = sentence.length > maxChars ? sentence.slice(0, maxChars) : sentence;
        }
      }
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

export async function extractWithNer(
  text: string,
  onStatus?: (msg: string) => void,
): Promise<Partial<ExtractedTokens>> {
  const chunks = chunkText(text);
  if (chunks.length === 0) return {};

  const model = await getModel(onStatus);
  onStatus?.("Extracting entities...");

  const names: string[] = [];
  const pets: string[] = [];
  const orgs: string[] = [];
  const locations: string[] = [];
  const usernames: string[] = [];
  const keywords: string[] = [];

  for (const chunk of chunks) {
    const entities = await model.extractEntities(chunk, OSINT_LABELS, {
      threshold: 0.35,
    });

    for (const ent of entities) {
      const value = ent.text.trim();
      if (value.length < 2) continue;

      switch (ent.label) {
        case "person":
        case "nickname":
          names.push(value);
          break;
        case "pet":
          pets.push(value);
          break;
        case "organization":
        case "team":
          orgs.push(value);
          break;
        case "location":
          locations.push(value);
          break;
        case "username":
          usernames.push(value);
          break;
        default:
          keywords.push(value);
          break;
      }
    }
  }

  return { names, pets, orgs, locations, usernames, keywords };
}
