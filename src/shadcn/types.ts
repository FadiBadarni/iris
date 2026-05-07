export type ShadcnComponent = {
  name: string;
  filePath: string;
  importPath: string;
};

export type ShadcnWarningKind = "no-shadcn" | "multi-shadcn";

export type ShadcnWarning = {
  kind: ShadcnWarningKind;
  message: string;
};

export type ShadcnState = {
  components: Map<string, ShadcnComponent>;
  warnings: ShadcnWarning[];
};
