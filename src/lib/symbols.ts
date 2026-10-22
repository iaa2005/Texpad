/**
 * The symbol catalogue used by the √x panel: Texpad's grouped symbol table,
 * plus latexted-style recent and pinned symbols that persist per user.
 * A "|" in a command marks where the selection or caret goes.
 */

export type SymbolEntry = [glyph: string, command: string];

export interface SymbolGroup {
  title: string;
  items: SymbolEntry[];
}

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    title: "Greek letters",
    items: [
      ["α", "\\alpha"], ["β", "\\beta"], ["γ", "\\gamma"], ["δ", "\\delta"],
      ["ε", "\\epsilon"], ["ϵ", "\\varepsilon"], ["ζ", "\\zeta"], ["η", "\\eta"],
      ["θ", "\\theta"], ["ϑ", "\\vartheta"], ["ι", "\\iota"], ["κ", "\\kappa"],
      ["λ", "\\lambda"], ["μ", "\\mu"], ["ν", "\\nu"], ["ξ", "\\xi"],
      ["π", "\\pi"], ["ϖ", "\\varpi"], ["ρ", "\\rho"], ["ϱ", "\\varrho"],
      ["σ", "\\sigma"], ["ς", "\\varsigma"], ["τ", "\\tau"], ["υ", "\\upsilon"],
      ["φ", "\\phi"], ["ϕ", "\\varphi"], ["χ", "\\chi"], ["ψ", "\\psi"],
      ["ω", "\\omega"], ["Γ", "\\Gamma"], ["Δ", "\\Delta"], ["Θ", "\\Theta"],
      ["Λ", "\\Lambda"], ["Ξ", "\\Xi"], ["Π", "\\Pi"], ["Σ", "\\Sigma"],
      ["Υ", "\\Upsilon"], ["Φ", "\\Phi"], ["Ψ", "\\Psi"], ["Ω", "\\Omega"],
    ],
  },
  {
    title: "Binary Relations",
    items: [
      ["≤", "\\leq"], ["≥", "\\geq"], ["≠", "\\neq"], ["≈", "\\approx"],
      ["≡", "\\equiv"], ["∼", "\\sim"], ["≃", "\\simeq"], ["≅", "\\cong"],
      ["∝", "\\propto"], ["≪", "\\ll"], ["≫", "\\gg"], ["≺", "\\prec"],
      ["≻", "\\succ"], ["∈", "\\in"], ["∉", "\\notin"], ["∋", "\\ni"],
      ["⊂", "\\subset"], ["⊆", "\\subseteq"], ["⊃", "\\supset"], ["⊇", "\\supseteq"],
      ["⊥", "\\perp"], ["∥", "\\parallel"], ["∣", "\\mid"], ["⊢", "\\vdash"],
      ["⊨", "\\models"], ["≐", "\\doteq"], ["⋈", "\\bowtie"], ["⌣", "\\smile"],
    ],
  },
  {
    title: "Binary Operators",
    items: [
      ["×", "\\times"], ["·", "\\cdot"], ["±", "\\pm"], ["∓", "\\mp"],
      ["÷", "\\div"], ["∗", "\\ast"], ["⋆", "\\star"], ["∘", "\\circ"],
      ["∙", "\\bullet"], ["∪", "\\cup"], ["∩", "\\cap"], ["⊎", "\\uplus"],
      ["∧", "\\wedge"], ["∨", "\\vee"], ["∖", "\\setminus"], ["⊕", "\\oplus"],
      ["⊖", "\\ominus"], ["⊗", "\\otimes"], ["⊘", "\\oslash"], ["⊙", "\\odot"],
      ["†", "\\dagger"], ["‡", "\\ddagger"], ["⨿", "\\amalg"], ["≀", "\\wr"],
    ],
  },
  {
    title: "BIG Operators",
    items: [
      ["∑", "\\sum_{|}^{}"], ["∏", "\\prod_{|}^{}"], ["∐", "\\coprod_{|}^{}"],
      ["∫", "\\int_{|}^{}"], ["∬", "\\iint_{|}"], ["∭", "\\iiint_{|}"],
      ["∮", "\\oint_{|}"], ["⋃", "\\bigcup_{|}"], ["⋂", "\\bigcap_{|}"],
      ["⨁", "\\bigoplus_{|}"], ["⨂", "\\bigotimes_{|}"], ["⋁", "\\bigvee_{|}"],
      ["⋀", "\\bigwedge_{|}"], ["lim", "\\lim_{|}"],
    ],
  },
  {
    title: "Arrows",
    items: [
      ["→", "\\rightarrow"], ["←", "\\leftarrow"], ["↔", "\\leftrightarrow"],
      ["⇒", "\\Rightarrow"], ["⇐", "\\Leftarrow"], ["⇔", "\\Leftrightarrow"],
      ["⟶", "\\longrightarrow"], ["⟹", "\\Longrightarrow"], ["↦", "\\mapsto"],
      ["↪", "\\hookrightarrow"], ["↑", "\\uparrow"], ["↓", "\\downarrow"],
      ["↕", "\\updownarrow"], ["⇑", "\\Uparrow"], ["⇓", "\\Downarrow"],
      ["↗", "\\nearrow"], ["↘", "\\searrow"], ["↙", "\\swarrow"], ["↖", "\\nwarrow"],
      ["⇀", "\\rightharpoonup"], ["⇌", "\\rightleftharpoons"], ["⇝", "\\leadsto"],
    ],
  },
  {
    title: "Delimiters",
    items: [
      ["(", "("], ["[", "["], ["{", "\\{"], ["⟨", "\\langle"], ["⟩", "\\rangle"],
      ["|", "|"], ["‖", "\\|"], ["⌈", "\\lceil"], ["⌉", "\\rceil"],
      ["⌊", "\\lfloor"], ["⌋", "\\rfloor"],
    ],
  },
  {
    title: "Large delimiters",
    items: [
      ["(", "\\left( | \\right)"], ["[", "\\left[ | \\right]"],
      ["{", "\\left\\{ | \\right\\}"], ["⟨", "\\left\\langle | \\right\\rangle"],
      ["|", "\\left| | \\right|"], ["‖", "\\left\\| | \\right\\|"],
    ],
  },
  {
    title: "Misc Maths",
    items: [
      ["∞", "\\infty"], ["∂", "\\partial"], ["∇", "\\nabla"], ["∀", "\\forall"],
      ["∃", "\\exists"], ["∄", "\\nexists"], ["¬", "\\neg"], ["ℏ", "\\hbar"],
      ["ℓ", "\\ell"], ["℘", "\\wp"], ["ℜ", "\\Re"], ["ℑ", "\\Im"],
      ["ℵ", "\\aleph"], ["∅", "\\emptyset"], ["∠", "\\angle"], ["△", "\\triangle"],
      ["′", "\\prime"], ["♯", "\\sharp"], ["♭", "\\flat"], ["⊤", "\\top"],
      ["…", "\\ldots"], ["⋯", "\\cdots"], ["⋮", "\\vdots"], ["⋱", "\\ddots"],
      ["√", "\\sqrt{|}"], ["ⁿ√", "\\sqrt[n]{|}"], ["a/b", "\\frac{|}{}"],
      ["x̂", "\\hat{|}"], ["x̄", "\\bar{|}"], ["x⃗", "\\vec{|}"], ["ẋ", "\\dot{|}"],
      ["x̃", "\\tilde{|}"],
    ],
  },
  {
    title: "AMS Sets",
    items: [
      ["ℝ", "\\mathbb{R}"], ["ℕ", "\\mathbb{N}"], ["ℤ", "\\mathbb{Z}"],
      ["ℚ", "\\mathbb{Q}"], ["ℂ", "\\mathbb{C}"], ["𝒜", "\\mathcal{A}"],
      ["ℒ", "\\mathcal{L}"], ["𝔤", "\\mathfrak{g}"], ["∴", "\\therefore"],
      ["∵", "\\because"], ["≲", "\\lesssim"], ["≳", "\\gtrsim"],
      ["⊊", "\\subsetneq"], ["∡", "\\measuredangle"], ["□", "\\square"],
      ["■", "\\blacksquare"],
    ],
  },
  {
    title: "Text mode symbols",
    items: [
      ["§", "\\S"], ["¶", "\\P"], ["©", "\\copyright"], ["†", "\\dag"],
      ["‡", "\\ddag"], ["£", "\\pounds"], ["€", "\\texteuro"], ["№", "\\textnumero"],
      ["–", "--"], ["—", "---"], ["«", "<<"], ["»", ">>"],
      ["“", "``"], ["”", "''"], ["°", "\\textdegree"], ["~", "~"],
    ],
  },
];

/** Short command name shown under a glyph: `\sum_{|}^{}` → `\sum`. */
export function symbolLabel(command: string): string {
  return (
    command.split(/(?<=[{ ])\|/)[0].replace(/(_\{|(?<=[A-Za-z])\{)?\s*$/, "") || command
  );
}

export const ALL_SYMBOLS: SymbolEntry[] = (() => {
  const seen = new Set<string>();
  const list: SymbolEntry[] = [];
  for (const group of SYMBOL_GROUPS) {
    for (const entry of group.items) {
      if (seen.has(entry[1])) continue;
      seen.add(entry[1]);
      list.push(entry);
    }
  }
  return list;
})();

export function findSymbol(command: string): SymbolEntry | undefined {
  return ALL_SYMBOLS.find(([, value]) => value === command);
}

const RECENT_KEY = "texpad.symbols.recent.v1";
const PINNED_KEY = "texpad.symbols.pinned.v1";
const RECENT_LIMIT = 18;
export const PINNED_LIMIT = 9;

function readList(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeList(key: string, list: string[]) {
  try {
    localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Storage can be unavailable; the panel still works without it.
  }
}

export function recentSymbols(): string[] {
  return readList(RECENT_KEY);
}

export function rememberSymbol(command: string) {
  const list = recentSymbols().filter((item) => item !== command);
  list.unshift(command);
  writeList(RECENT_KEY, list.slice(0, RECENT_LIMIT));
}

export function pinnedSymbols(): string[] {
  return readList(PINNED_KEY);
}

/** Pins or unpins a symbol; pinned symbols get Alt+1…Alt+9. */
export function togglePinnedSymbol(command: string): string[] {
  const list = pinnedSymbols();
  const next = list.includes(command)
    ? list.filter((item) => item !== command)
    : [...list, command].slice(0, PINNED_LIMIT);
  writeList(PINNED_KEY, next);
  return next;
}

/** Matches by command name, glyph, or group title, case-insensitively. */
export function searchSymbols(query: string): SymbolEntry[] {
  const needle = query.trim().toLowerCase().replace(/^\\/, "");
  if (!needle) return [];
  const results: SymbolEntry[] = [];
  const seen = new Set<string>();
  for (const group of SYMBOL_GROUPS) {
    const groupHit = group.title.toLowerCase().includes(needle);
    for (const entry of group.items) {
      const [glyph, command] = entry;
      if (seen.has(command)) continue;
      if (
        groupHit ||
        glyph === query.trim() ||
        symbolLabel(command).toLowerCase().replace(/^\\/, "").includes(needle)
      ) {
        seen.add(command);
        results.push(entry);
      }
    }
  }
  return results;
}
