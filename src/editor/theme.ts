import { EditorView } from "@codemirror/view";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";

const lightHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#2f8a57" },
  { tag: tags.tagName, color: "#b45309" },
  { tag: tags.atom, color: "#0b7285" },
  { tag: tags.keyword, color: "#1c7ed6" },
  { tag: tags.string, color: "#0f766e" },
  { tag: tags.number, color: "#1d4ed8" },
  { tag: tags.bracket, color: "#b91c1c" },
  { tag: tags.variableName, color: "#1d1d1f" },
  { tag: tags.typeName, color: "#1d1d1f" },
  { tag: tags.standard(tags.variableName), color: "#0b7285" },
  { tag: tags.invalid, color: "#dc2626", textDecoration: "underline wavy" },
]);

const darkHighlight = HighlightStyle.define([
  { tag: tags.comment, color: "#5fbf77" },
  { tag: tags.tagName, color: "#e5a663" },
  { tag: tags.atom, color: "#7ad0e8" },
  { tag: tags.keyword, color: "#7ad0e8" },
  { tag: tags.string, color: "#7dd3c0" },
  { tag: tags.number, color: "#82aaff" },
  { tag: tags.bracket, color: "#f28b82" },
  { tag: tags.variableName, color: "#d7d9de" },
  { tag: tags.typeName, color: "#d7d9de" },
  { tag: tags.standard(tags.variableName), color: "#7ad0e8" },
  { tag: tags.invalid, color: "#ff8a80", textDecoration: "underline wavy" },
]);

const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#ffffff",
      color: "#1d1d1f",
      height: "100%",
    },
    ".cm-scroller": {
      overflow: "auto",
      lineHeight: "1.65",
    },
    ".cm-content": {
      padding: "14px 0 40vh",
      caretColor: "#2563eb",
    },
    ".cm-line": {
      padding: "0 22px 0 8px",
    },
    ".cm-gutters": {
      backgroundColor: "#ffffff",
      color: "#9a9aa0",
      border: "none",
      paddingLeft: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
      minWidth: "26px",
      fontSize: "0.72em",
      lineHeight: "2.35",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(47, 111, 237, 0.055)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#1d1d1f",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "#cfe3ff !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#2563eb",
      borderLeftWidth: "2px",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "#dbeafe",
      outline: "1px solid #93c5fd",
    },
    ".cm-searchMatch": {
      backgroundColor: "#fde68a",
      outline: "1px solid #f59e0b",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#fbbf24",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#e0ecff",
    },
    ".cm-panels": {
      backgroundColor: "#f5f5f7",
      color: "#1d1d1f",
      border: "none",
      borderBottom: "1px solid #e3e3e7",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #e3e3e7",
      borderBottom: "none",
    },
    ".cm-textfield": {
      backgroundColor: "#ffffff",
      border: "1px solid #d4d4d9",
      borderRadius: "6px",
      padding: "4px 8px",
      outline: "none",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "#ffffff",
      border: "1px solid #d4d4d9",
      borderRadius: "6px",
      padding: "4px 10px",
    },
    ".cm-tooltip": {
      backgroundColor: "#ffffff",
      border: "1px solid #d9d9de",
      borderRadius: "9px",
      boxShadow: "0 12px 34px rgba(20, 24, 40, 0.16)",
      overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "inherit",
      maxHeight: "260px",
      padding: "5px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "4px 8px",
      borderRadius: "5px",
      lineHeight: "1.45",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#2f6fed",
      color: "#ffffff",
    },
    ".cm-completionDetail": {
      fontStyle: "normal",
      opacity: "0.62",
      marginLeft: "10px",
      fontSize: "0.9em",
    },
    ".cm-completionIcon": {
      opacity: "0.75",
      paddingRight: "6px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionDetail":
      {
        opacity: "0.8",
      },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected] .cm-completionIcon":
      {
        opacity: "1",
      },
    ".cm-lintRange-error": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%23e5484d'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-lintRange-warning": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%23d97706'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-lintRange-info": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%2322a06e'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-lint-marker-error": { content: "none" },
    ".cm-latex-envcommand": {
      color: "#1c7ed6",
      fontWeight: "500",
    },
    ".cm-latex-sectioncommand": {
      color: "#b45309",
      fontWeight: "500",
    },
    ".cm-latex-refcommand": {
      color: "#0e7490",
    },
  },
  { dark: false },
);

const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "#232428",
      color: "#d7d9de",
      height: "100%",
    },
    ".cm-scroller": {
      overflow: "auto",
      lineHeight: "1.65",
    },
    ".cm-content": {
      padding: "14px 0 40vh",
      caretColor: "#7eaaff",
    },
    ".cm-line": {
      padding: "0 22px 0 8px",
    },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "#77777d",
      border: "none",
      paddingLeft: "6px",
    },
    ".cm-lineNumbers .cm-gutterElement": {
      padding: "0 8px 0 4px",
      minWidth: "26px",
      fontSize: "0.72em",
      lineHeight: "2.35",
    },
    ".cm-activeLine": {
      backgroundColor: "rgba(255, 255, 255, 0.045)",
    },
    ".cm-activeLineGutter": {
      backgroundColor: "transparent",
      color: "#e6e6e8",
    },
    "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionLayer .cm-selectionBackground": {
      backgroundColor: "#2f466e !important",
    },
    ".cm-cursor, .cm-dropCursor": {
      borderLeftColor: "#7eaaff",
      borderLeftWidth: "2px",
    },
    ".cm-matchingBracket, &.cm-focused .cm-matchingBracket": {
      backgroundColor: "#31415f",
      outline: "1px solid #4d6fa3",
    },
    ".cm-searchMatch": {
      backgroundColor: "#6b5b1f",
      outline: "1px solid #b58a1f",
    },
    ".cm-searchMatch.cm-searchMatch-selected": {
      backgroundColor: "#8a7426",
    },
    ".cm-selectionMatch": {
      backgroundColor: "#2c3850",
    },
    ".cm-panels": {
      backgroundColor: "#1e1f22",
      color: "#d7d9de",
      border: "none",
      borderBottom: "1px solid #35373d",
    },
    ".cm-panels.cm-panels-bottom": {
      borderTop: "1px solid #35373d",
      borderBottom: "none",
    },
    ".cm-textfield": {
      backgroundColor: "#26282d",
      border: "1px solid #3a3d45",
      borderRadius: "6px",
      padding: "4px 8px",
      color: "#e3e4e8",
      outline: "none",
    },
    ".cm-button": {
      backgroundImage: "none",
      backgroundColor: "#2b2d33",
      border: "1px solid #41444c",
      borderRadius: "6px",
      padding: "4px 10px",
      color: "#e3e4e8",
    },
    ".cm-tooltip": {
      backgroundColor: "#2a2c32",
      border: "1px solid #3d4048",
      borderRadius: "9px",
      boxShadow: "0 14px 40px rgba(0, 0, 0, 0.45)",
      overflow: "hidden",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul": {
      fontFamily: "inherit",
      maxHeight: "260px",
      padding: "5px",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
      padding: "4px 8px",
      borderRadius: "5px",
      lineHeight: "1.45",
    },
    ".cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]": {
      backgroundColor: "#2f6fed",
      color: "#ffffff",
    },
    ".cm-completionDetail": {
      fontStyle: "normal",
      opacity: "0.62",
      marginLeft: "10px",
      fontSize: "0.9em",
    },
    ".cm-completionIcon": {
      opacity: "0.75",
      paddingRight: "6px",
    },
    ".cm-lintRange-error": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%23ff6b6b'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-lintRange-warning": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%23f0b34a'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-lintRange-info": {
      backgroundImage:
        "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='6' height='3'%3E%3Cpath d='M0 3 L2 0 L4 3 Z' fill='%235ccf9a'/%3E%3C/svg%3E\")",
      backgroundRepeat: "repeat-x",
      backgroundPosition: "bottom",
      paddingBottom: "2px",
    },
    ".cm-latex-envcommand": {
      color: "#7ad0e8",
      fontWeight: "500",
    },
    ".cm-latex-sectioncommand": {
      color: "#e5a663",
      fontWeight: "500",
    },
    ".cm-latex-refcommand": {
      color: "#67d0d8",
    },
  },
  { dark: true },
);

export interface EditorThemeBundle {
  theme: Extension;
  highlight: Extension;
}

export function editorTheme(dark: boolean): EditorThemeBundle {
  return dark
    ? { theme: darkTheme, highlight: syntaxHighlighting(darkHighlight) }
    : { theme: lightTheme, highlight: syntaxHighlighting(lightHighlight) };
}
