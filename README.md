# `@adper/wordsmith`

Zero-config contextual password wordlist generator CLI for security professionals.

Powered by a local ONNX zero-shot NER model (`onnx-community/gliner_small-v2.1` via `@lmoe/gliner-onnx`), deterministic date/handle/email parsers (`chrono-node`), and a probability-ranked mutation engine. No API keys, no cloud calls, no configuration required.

## Install

```bash
npm install -g @adper/wordsmith
```

Or run directly with `npx`:

```bash
npx @adper/wordsmith -t "John 'Maverick' Doe. Born 12 Aug 1990. Pet dog Buster. Works at CyberCorp." -o wordlist.txt
```

## Usage

```bash
# Inline text
wordsmith -t "John 'Maverick' Doe. Born 12 Aug 1990. Dog Buster." -o wordlist.txt

# From a file (via -i or positional argument) with password policy filters
wordsmith -i dossier.txt -p fast --min-len 8 --require-upper --require-digit --require-symbol
wordsmith dossier.txt -p standard -o wordlist.txt

# Piped from stdin
cat bio.txt | wordsmith --limit 5000 > wordlist.txt

# Inspect extracted OSINT tokens as JSON
wordsmith -i dossier.txt --tokens-only

# Deterministic parsers only (skip loading the ONNX NER model)
wordsmith -i dossier.txt --no-model
```

### Options

| Flag | Description |
| --- | --- |
| `-i, --input <file>` | Read recon text from a file (or pass `<file>` positionally) |
| `-t, --text <string>` | Provide recon text inline |
| `-o, --output <file>` | Write output to a file (defaults to stdout) |
| `-p, --profile <mode>` | Depth profile: `fast`, `standard` (default), or `deep` |
| `--min-len <n>` | Minimum password length |
| `--max-len <n>` | Maximum password length |
| `--limit <n>` | Maximum number of generated candidates |
| `--require-upper` | Require at least one uppercase character |
| `--require-lower` | Require at least one lowercase character |
| `--require-digit` | Require at least one digit |
| `--require-symbol` | Require at least one symbol |
| `--tokens-only` | Output extracted tokens as JSON instead of a wordlist |
| `--no-model` | Skip local ONNX NER model (deterministic parsers only) |
| `-q, --quiet` | Suppress status and summary messages on stderr |
| `-h, --help` | Show help message |
| `-v, --version` | Show version |

### Profiles

Candidates are emitted in probability-ranked tiers (not sorted alphabetically), so the highest-signal guesses always appear at the top of the list.

| Profile | Included Tiers | Best For |
| --- | --- | --- |
| `fast` | Tiers 1–2: base tokens, exact dates/numbers, top suffixes, policy `Title@Year` patterns, selective 1-char leet, pairwise combos, acronyms | Rate-limited / online login auditing |
| `standard` | Tiers 1–3 (default): adds full leet, common prefixes, extended suffixes, month-name/formatted dates, doubled & reversed tokens | General targeted cracking |
| `deep` | Tiers 1–4: adds triple combinations, broad year sweep (`1960–present+1`), symbol wrappers, keyboard walks | Offline hash cracking |

## How It Works

1. **Zero-Shot OSINT Extraction:** Combines `chrono-node` date parsing and email/handle/nickname regexes with a fixed local GLiNER ONNX model (`onnx-community/gliner_small-v2.1`) to extract people, nicknames, pets, organizations, locations, teams, hobbies, products, and usernames.
2. **Probability-Ranked Tiered Mutation:** Candidates are generated in descending likelihood tiers rather than alphabetical order, with optional password-policy filtering (`--min-len`, `--max-len`, `--require-*`) and `--limit` early stopping.

### Model & Offline Caching

On first run (unless `--no-model` is passed), `onnx-community/gliner_small-v2.1` is downloaded from Hugging Face Hub and cached locally under `~/.cache/huggingface/hub`. All subsequent runs execute completely offline on CPU via `onnxruntime-node`.

## Programmatic API

`@adper/wordsmith` also exports its extractor and generator functions for TypeScript / Node.js ESM projects:

```ts
import { extractTokens, generateWordlist } from "@adper/wordsmith";

const tokens = await extractTokens(
  "John 'Maverick' Doe. Born 12 Aug 1990. Pet dog Buster. Works at CyberCorp.",
);

const wordlist = generateWordlist(tokens, {
  profile: "fast",
  minLen: 8,
  requireUpper: true,
  requireDigit: true,
  limit: 500,
});
```

## Development

```bash
npm install
npm run build
npm test
```

## Disclaimer

This tool is intended strictly for authorized security testing, penetration testing, and password strength auditing.

## License

MIT © Anay Pandya
