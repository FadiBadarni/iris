export type TokenType =
  | "color"
  | "spacing"
  | "fontSize"
  | "fontFamily"
  | "fontWeight"
  | "borderRadius"
  | "lineHeight"
  | "letterSpacing"
  | "boxShadow"
  | "screen"
  | "other";

export type TokenSource = "v3-config" | "v4-theme" | "v4-config-bridge";

export type TokenEntry = {
  name: string;
  value: string;
  type: TokenType;
  source: TokenSource;
  file: string;
};

export type ResolvedTheme = {
  version: 3 | 4;
  tokens: Map<string, TokenEntry>;
  byValue: Map<string, TokenEntry[]>;
  sources: string[];
};

export type ParseOptions = {
  cwd?: string | undefined;
  noCache?: boolean | undefined;
};
