// The theme machine's outputs in a browser: the choice is shown by data-theme on the root element, which the
// token build's CSS reads, and remembered in localStorage for the next visit. With "system" the attribute
// is removed and the page follows prefers-color-scheme.
import { THEME_CHOICES, type ThemeChoice, type ThemeOutputs } from "./theme.svelte.ts";

/** The choice remembered from the last visit, or "system". */
export function savedTheme(key = "theme"): ThemeChoice {
  try {
    const v = localStorage.getItem(key) as ThemeChoice | null;
    return v && THEME_CHOICES.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

/** Outputs that show the choice on the document and remember it under `key`. */
export function documentTheme(key = "theme", root: HTMLElement = document.documentElement): ThemeOutputs {
  return {
    apply(choice) {
      if (choice === "system") delete root.dataset.theme;
      else root.dataset.theme = choice;
      try {
        if (choice === "system") localStorage.removeItem(key);
        else localStorage.setItem(key, choice);
      } catch {
        // Storage may be unavailable (a private window); the choice still holds for this visit.
      }
    },
  };
}
