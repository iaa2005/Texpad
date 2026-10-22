import {
  snippetCompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
  type CompletionSource,
} from "@codemirror/autocomplete";
import {
  BIB_STYLES,
  DOCUMENT_CLASSES,
  LATEX_COMMANDS,
  LATEX_ENVIRONMENTS,
  LATEX_PACKAGES,
} from "./latexData";
import { basename } from "./path";
import type { CitationInfo, LabelInfo } from "../types";

export interface CompletionData {
  labels: LabelInfo[];
  citations: CitationInfo[];
  customEnvironments: string[];
  customCommands: string[];
  userAutocomplete: string;
  bibFiles: string[];
  graphicFiles: string[];
  localPackages: string[];
}

const emptyData: CompletionData = {
  labels: [],
  citations: [],
  customEnvironments: [],
  customCommands: [],
  userAutocomplete: "",
  bibFiles: [],
  graphicFiles: [],
  localPackages: [],
};

function isInComment(context: CompletionContext): boolean {
  const line = context.state.doc.lineAt(context.pos);
  const prefix = line.text.slice(0, context.pos - line.from);
  let escaped = false;
  for (const ch of prefix) {
    if (ch === "\\") {
      escaped = !escaped;
      continue;
    }
    if (ch === "%" && !escaped) return true;
    escaped = false;
  }
  return false;
}

function uniqueByLabel(options: Completion[]): Completion[] {
  const map = new Map<string, Completion>();
  for (const option of options) map.set(option.label, option);
  return [...map.values()].sort((a, b) =>
    a.label.toLowerCase().localeCompare(b.label.toLowerCase()),
  );
}

let commandCache: Completion[] | null = null;

function commandOptions(): Completion[] {
  if (commandCache) return commandCache;
  const options: Completion[] = [];
  for (const command of LATEX_COMMANDS) {
    const label = `\\${command.name}`;
    const info = command.group ? `${command.group} — ${command.detail}` : command.detail;
    if (command.snippet) {
      options.push(
        snippetCompletion(command.snippet, {
          label,
          detail: command.detail,
          info,
          type: "keyword",
        }),
      );
    } else {
      options.push({ label, detail: command.detail, info, type: "keyword" });
    }
  }
  commandCache = uniqueByLabel(options);
  return commandCache;
}

function userCommandOptions(text: string): Completion[] {
  const options: Completion[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("%")) continue;
    const parts = line.split("|");
    const key = parts[0].trim().replace(/^\*+/, "");
    if (!key || key.includes(":")) continue;
    const description = parts.slice(1).join("|").trim();
    const exampleMatch = description.match(/E\.g\.\s*(.+)$/);
    const example = exampleMatch?.[1]?.trim();
    const detail =
      description.replace(/E\.g\..*$/, "").trim() || "Custom command";
    const label = `\\${key}`;
    if (example && example.startsWith("\\")) {
      let placeholder = 0;
      const template = example.replace(/\{([^{}]*)\}/g, (_match, inner) => {
        placeholder += 1;
        return `{\${${placeholder}:${inner}}}`;
      });
      options.push(
        snippetCompletion(template, {
          label,
          detail,
          info: description,
          type: "keyword",
        }),
      );
    } else {
      options.push({ label, detail, info: description, type: "keyword" });
    }
  }
  return options;
}

function environmentOptions(data: CompletionData): Completion[] {
  const options: Completion[] = LATEX_ENVIRONMENTS.map((env) => ({
    label: env.name,
    detail: env.detail,
    info: `Environment — ${env.detail}`,
    type: "class",
  }));
  for (const env of data.customEnvironments) {
    options.push({
      label: env,
      detail: "Defined in this project",
      info: "Custom environment defined with \\newenvironment",
      type: "class",
    });
  }
  return uniqueByLabel(options);
}

function labelOptions(data: CompletionData): Completion[] {
  return uniqueByLabel(
    data.labels.map((label) => ({
      label: label.name,
      detail: label.context,
      info: `${label.context}\n${basename(label.file)}:${label.line}`,
      type: "variable",
    })),
  );
}

function citationOptions(data: CompletionData): Completion[] {
  return uniqueByLabel(
    data.citations.map((citation) => {
      const meta = [citation.author, citation.year].filter(Boolean).join(" · ");
      return {
        label: citation.key,
        detail: meta || citation.title || "Citation",
        info: [citation.title, meta, citation.file ? basename(citation.file) : ""]
          .filter(Boolean)
          .join("\n"),
        type: "text",
      } satisfies Completion;
    }),
  );
}

function fileOptions(files: string[], detail: string): Completion[] {
  return uniqueByLabel(
    files.map((file) => ({
      label: file,
      detail,
      type: "namespace",
    })),
  );
}

function simpleOptions(items: { name: string; detail: string }[], type: string): Completion[] {
  return uniqueByLabel(
    items.map((item) => ({
      label: item.name,
      detail: item.detail,
      info: item.detail,
      type,
    })),
  );
}

export function makeLatexCompletionSource(
  getData: () => CompletionData,
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    if (isInComment(context)) return null;
    const data = getData() ?? emptyData;
    const pos = context.pos;
    const line = context.state.doc.lineAt(pos);
    const textBefore = context.state.doc.sliceString(Math.max(line.from, pos - 600), pos);

    const argumentMatch = (regex: RegExp) => {
      const match = textBefore.match(regex);
      if (!match) return null;
      return { match, from: pos - (match[1]?.length ?? 0) };
    };

    const refs = argumentMatch(
      /\\(?:ref|eqref|pageref|autoref|cref|Cref|vref|nameref|hyperref)\*?(?:\[[^\]]*\])?\{([^}]*)$/,
    );
    if (refs) {
      return {
        from: refs.from,
        options: labelOptions(data),
        validFor: /^[^}]*$/,
      };
    }

    const cites = argumentMatch(
      /\\(?:cite|citep|citet|citealp|citeauthor|citeyear|parencite|textcite|autocite|footcite|footcitetext|smartcite|supercite|Citep|Citet|Parencite|Textcite|Autocite|nocite)\*?(?:\[[^\]]*\])*\{([^}]*)$/,
    );
    if (cites) {
      return {
        from: cites.from,
        options: citationOptions(data),
        validFor: /^[^}]*$/,
      };
    }

    const envs = argumentMatch(/\\(?:begin|end)\{([^}]*)$/);
    if (envs) {
      return {
        from: envs.from,
        options: environmentOptions(data),
        validFor: /^[^}]*$/,
      };
    }

    const packages = argumentMatch(/\\usepackage(?:\[[^\]]*\])?\{([^}]*)$/);
    if (packages) {
      return {
        from: packages.from,
        options: simpleOptions(
          [
            ...LATEX_PACKAGES,
            ...data.localPackages.map((name) => ({
              name,
              detail: "Local package",
            })),
          ],
          "namespace",
        ),
        validFor: /^[^}]*$/,
      };
    }

    const classes = argumentMatch(/\\documentclass(?:\[[^\]]*\])?\{([^}]*)$/);
    if (classes) {
      return {
        from: classes.from,
        options: simpleOptions(DOCUMENT_CLASSES, "class"),
        validFor: /^[^}]*$/,
      };
    }

    const styles = argumentMatch(/\\bibliographystyle\{([^}]*)$/);
    if (styles) {
      return {
        from: styles.from,
        options: simpleOptions(BIB_STYLES, "text"),
        validFor: /^[^}]*$/,
      };
    }

    const bibs = argumentMatch(/\\bibliography\{([^,}]*)$/);
    if (bibs) {
      return {
        from: bibs.from,
        options: fileOptions(data.bibFiles, "BibTeX database"),
        validFor: /^[^,}]*$/,
      };
    }

    const graphics = argumentMatch(
      /\\includegraphics\*?(?:\[[^\]]*\])?\{([^}]*)$/,
    );
    if (graphics) {
      return {
        from: graphics.from,
        options: fileOptions(data.graphicFiles, "Image"),
        validFor: /^[^}]*$/,
      };
    }

    const word = context.matchBefore(/\\[a-zA-Z@]*/);
    if (!word) return null;
    if (word.from === word.to && !context.explicit) return null;
    const custom = data.customCommands.map((name) => ({
      label: `\\${name}`,
      detail: "Custom command",
      info: "Defined with \\newcommand or \\DeclareMathOperator",
      type: "keyword",
    }));
    return {
      from: word.from,
      options: uniqueByLabel([
        ...commandOptions(),
        ...custom,
        ...userCommandOptions(data.userAutocomplete),
      ]),
      validFor: /^\\[a-zA-Z@]*$/,
    };
  };
}
