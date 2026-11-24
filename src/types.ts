export interface ExtractedDate {
  raw: string;
  day: number;
  month: number;
  year: number;
  hasDay: boolean;
  hasMonth: boolean;
}

export interface ExtractedTokens {
  names: string[];
  usernames: string[];
  pets: string[];
  orgs: string[];
  locations: string[];
  keywords: string[];
  dates: ExtractedDate[];
  numbers: string[];
}

export type WordlistProfile = "fast" | "standard" | "deep";

export interface ExtractOptions {
  useModel?: boolean;
  onStatus?: (msg: string) => void;
}

export interface GenerateOptions {
  profile?: WordlistProfile;
  minLen?: number;
  maxLen?: number;
  limit?: number;
  requireUpper?: boolean;
  requireLower?: boolean;
  requireDigit?: boolean;
  requireSymbol?: boolean;
}
