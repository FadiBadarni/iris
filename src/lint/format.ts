import type { IrisLintMessage } from "./types.js";

export type FileResult = {
  filename: string;
  messages: IrisLintMessage[];
};

// ---------------------------------------------------------------------------
// Human format — README mockup shape, file path printed once per file block.
// ---------------------------------------------------------------------------

export function formatHuman(input: FileResult[]): string {
  const lines: string[] = [];
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const { filename, messages } of input) {
    if (messages.length === 0) continue;
    lines.push(filename);
    for (const m of messages) {
      lines.push(humanLine(m));
      if (m.severity === "error") totalErrors += 1;
      else totalWarnings += 1;
    }
  }

  if (lines.length === 0) return "";

  lines.push("");
  lines.push(summaryLine(totalErrors, totalWarnings));
  return `${lines.join("\n")}\n`;
}

function humanLine(m: IrisLintMessage): string {
  const loc = `${m.line}:${m.column}`.padStart(7);
  const sev = m.severity.padEnd(7);
  const body = humanBody(m);
  return `  ${loc}  ${sev} ${body}`;
}

function humanBody(m: IrisLintMessage): string {
  const cls = m.classname;
  if (cls === undefined) return m.message;
  switch (m.suggestion?.kind) {
    case "exact":
      return `${cls} is not a token. did you mean ${m.suggestion.replacement}?`;
    case "near":
      return `${cls} is off-scale. did you mean ${m.suggestion.replacement}? (near match, ${m.suggestion.delta}px off)`;
    case "ambiguous": {
      const opts = m.suggestion.candidates.map((c) => c.replacement).join(", ");
      return `${cls} matches multiple tokens (${opts})`;
    }
    case "none":
    case undefined:
      return defaultBody(m, cls);
  }
}

function defaultBody(m: IrisLintMessage, cls: string): string {
  // No suggestion produced; surface the rule's own message but with the
  // classname pulled forward so terminals don't have to grep for the quote
  // shape that the upstream plugin emits.
  if (m.ruleId === "tailwindcss/no-arbitrary-value") {
    return `${cls} is not a token`;
  }
  if (m.ruleId === "tailwindcss/no-custom-classname") {
    return `${cls} is not a Tailwind class`;
  }
  return m.message;
}

function summaryLine(errors: number, warnings: number): string {
  const e = `${errors} ${errors === 1 ? "error" : "errors"}`;
  const w = `${warnings} ${warnings === 1 ? "warning" : "warnings"}`;
  return `${e}, ${w}`;
}

// ---------------------------------------------------------------------------
// Envelope JSON — for the v0.2 MCP hook and CI-friendly programmatic use.
// ---------------------------------------------------------------------------

type ViolationJson = {
  ruleId: string;
  severity: "error" | "warning";
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
  classname?: string;
  message: string;
  suggestion?: IrisLintMessage["suggestion"];
};

export function formatJson(input: FileResult[]): string {
  let errorCount = 0;
  let warningCount = 0;
  const files = input
    .filter((f) => f.messages.length > 0)
    .map((f) => ({
      path: f.filename,
      violations: f.messages.map((m) => {
        if (m.severity === "error") errorCount += 1;
        else warningCount += 1;
        const v: ViolationJson = {
          ruleId: m.ruleId,
          severity: m.severity,
          line: m.line,
          column: m.column,
          message: m.message,
        };
        if (m.endLine !== undefined) v.endLine = m.endLine;
        if (m.endColumn !== undefined) v.endColumn = m.endColumn;
        if (m.classname !== undefined) v.classname = m.classname;
        if (m.suggestion !== undefined) v.suggestion = m.suggestion;
        return v;
      }),
    }));

  return `${JSON.stringify(
    { version: "0.1", tool: "iris", files, summary: { errorCount, warningCount } },
    null,
    2,
  )}\n`;
}

// ---------------------------------------------------------------------------
// SARIF v2.1.0 — minimal shape for CI / VS Code Problems / GitHub code
// scanning. No source snippets by default (avoids leaking project source
// into CI artifacts).
// ---------------------------------------------------------------------------

export function formatSarif(input: FileResult[]): string {
  const ruleIds = new Set<string>();
  const results: unknown[] = [];

  for (const { filename, messages } of input) {
    for (const m of messages) {
      ruleIds.add(m.ruleId);
      const region: {
        startLine: number;
        startColumn: number;
        endLine?: number;
        endColumn?: number;
      } = {
        startLine: m.line,
        startColumn: m.column,
      };
      if (m.endLine !== undefined) region.endLine = m.endLine;
      if (m.endColumn !== undefined) region.endColumn = m.endColumn;
      results.push({
        ruleId: m.ruleId,
        level: sarifLevel(m.severity),
        message: { text: m.message },
        locations: [
          {
            physicalLocation: {
              artifactLocation: { uri: filename },
              region,
            },
          },
        ],
      });
    }
  }

  const sarif = {
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json",
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: "iris",
            informationUri: "https://github.com/FadiBadarni/iris",
            rules: [...ruleIds].sort().map((id) => ({ id })),
          },
        },
        results,
      },
    ],
  };

  return `${JSON.stringify(sarif, null, 2)}\n`;
}

function sarifLevel(severity: "error" | "warning"): "error" | "warning" {
  return severity;
}
