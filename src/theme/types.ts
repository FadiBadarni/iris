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

export type TokenSource = "v3-config" | "v4-theme" | "v4-config-bridge" | "v4-default";

export type TokenEntry = {
  name: string;
  value: string;
  type: TokenType;
  source: TokenSource;
  file: string;
};

export type ParseWarningKind =
  | "config-bridge-failed"
  | "v4-defaults-not-found"
  | "var-unresolved"
  | "circular-var"
  | "plugin-theme-mutation";

export type ParseWarning = {
  kind: ParseWarningKind;
  message: string;
  file?: string;
};

export type ResolvedTheme = {
  version: 3 | 4;
  tokens: Map<string, TokenEntry>;
  byValue: Map<string, TokenEntry[]>;
  sources: string[];
  warnings: ParseWarning[];
};

export type ParseOptions = {
  cwd?: string | undefined;
  noCache?: boolean | undefined;
  entry?: string | undefined;
};
