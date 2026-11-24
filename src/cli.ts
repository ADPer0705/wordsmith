#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parseArgs } from "node:util";
import { extractTokens } from "./extractors/index.js";
import { generateWordlist } from "./generator/wordlist.js";
import type { WordlistProfile } from "./types.js";

const require = createRequire(import.meta.url);
const pkg = require("../package.json") as { version: string };

const HELP_TEXT = `
wordsmith v${pkg.version} — Zero-config contextual wordlist generator (local GLiNER ONNX)

USAGE:
  wordsmith [options] [file]
  cat recon.txt | wordsmith [options]

OPTIONS:
  -i, --input <file>       Read recon text from a file
  -t, --text <string>      Provide recon text inline
  -o, --output <file>      Write output to file (default: stdout)
  -p, --profile <mode>     Depth profile: fast | standard | deep (default: standard)
      --min-len <n>        Minimum password length
      --max-len <n>        Maximum password length
      --limit <n>          Maximum number of generated candidates
      --require-upper      Require at least one uppercase letter
      --require-lower      Require at least one lowercase letter
      --require-digit      Require at least one digit
      --require-symbol     Require at least one symbol
      --tokens-only        Output extracted tokens as JSON instead of wordlist
      --no-model           Skip local ONNX NER model (deterministic parsers only)
  -q, --quiet              Suppress status and summary output on stderr
  -h, --help               Show this help message
  -v, --version            Show version

EXAMPLES:
  wordsmith -t "John 'Maverick' Doe. Born 12 Aug 1990. Dog Buster. Works at CyberCorp." -o wordlist.txt
  wordsmith -i dossier.txt -p fast --min-len 8 --require-upper --require-digit --require-symbol
  cat bio.txt | wordsmith --tokens-only
`.trim();

function parsePositiveInt(val: string | undefined, flag: string): number | undefined {
  if (val === undefined) return undefined;
  const parsed = Number.parseInt(val, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`Invalid value for ${flag}: "${val}" (expected positive integer)`);
  }
  return parsed;
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      input: { type: "string", short: "i" },
      text: { type: "string", short: "t" },
      output: { type: "string", short: "o" },
      profile: { type: "string", short: "p", default: "standard" },
      "min-len": { type: "string" },
      "max-len": { type: "string" },
      limit: { type: "string" },
      "require-upper": { type: "boolean", default: false },
      "require-lower": { type: "boolean", default: false },
      "require-digit": { type: "boolean", default: false },
      "require-symbol": { type: "boolean", default: false },
      "tokens-only": { type: "boolean", default: false },
      "no-model": { type: "boolean", default: false },
      quiet: { type: "boolean", short: "q", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.help) {
    console.log(HELP_TEXT);
    return;
  }

  if (values.version) {
    console.log(pkg.version);
    return;
  }

  const profile = values.profile as WordlistProfile;
  if (!["fast", "standard", "deep"].includes(profile)) {
    throw new Error(`Invalid --profile "${values.profile}". Use: fast, standard, or deep.`);
  }

  const minLen = parsePositiveInt(values["min-len"], "--min-len");
  const maxLen = parsePositiveInt(values["max-len"], "--max-len");
  const limit = parsePositiveInt(values.limit, "--limit");

  if (minLen !== undefined && maxLen !== undefined && minLen > maxLen) {
    throw new Error(`--min-len (${minLen}) cannot exceed --max-len (${maxLen})`);
  }

  let inputText = "";
  const inputFile = values.input ?? positionals[0];
  if (values.text) {
    inputText = values.text;
  } else if (inputFile) {
    inputText = readFileSync(inputFile, "utf8");
  } else {
    inputText = await readStdin();
  }

  if (!inputText.trim()) {
    console.error("Error: No input text provided. Pass -t, -i, a file path, or pipe via stdin.\n");
    console.error("Run `wordsmith --help` for usage.");
    process.exitCode = 1;
    return;
  }

  const log = (msg: string) => {
    if (!values.quiet) process.stderr.write(`[wordsmith] ${msg}\n`);
  };

  const tokens = await extractTokens(inputText, {
    useModel: !values["no-model"],
    onStatus: log,
  });

  if (values["tokens-only"]) {
    const json = JSON.stringify(tokens, null, 2) + "\n";
    if (values.output) {
      writeFileSync(values.output, json, "utf8");
      log(`Wrote extracted tokens to ${values.output}`);
    } else {
      process.stdout.write(json);
    }
    return;
  }

  const wordlist = generateWordlist(tokens, {
    profile,
    minLen,
    maxLen,
    limit,
    requireUpper: values["require-upper"],
    requireLower: values["require-lower"],
    requireDigit: values["require-digit"],
    requireSymbol: values["require-symbol"],
  });

  const payload = wordlist.join("\n") + (wordlist.length > 0 ? "\n" : "");
  if (values.output) {
    writeFileSync(values.output, payload, "utf8");
    log(`Generated ${wordlist.length.toLocaleString()} candidates (${profile}) -> ${values.output}`);
  } else {
    process.stdout.write(payload);
    log(`Generated ${wordlist.length.toLocaleString()} candidates (${profile})`);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[wordsmith] Error: ${msg}`);
  process.exit(1);
});
