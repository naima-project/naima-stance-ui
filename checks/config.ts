// The stance's configuration in a project: stance-ui.json at its root. Every path is relative to the root.

export interface StanceConfig {
  /** The token files the project uses: one mood board, *.tokens.json in the DTCG format. */
  tokens: string;
  /** Optional: a folder of mood boards, one folder each, which must all define the same tokens. */
  moods?: string;
  /** The widget set: generic components, which import nothing but Svelte and each other. */
  widgets: string[];
  /** The app's components: they may also import the store module, and anything as a type. */
  components: string[];
  /** The store module(s) components may import. */
  store: string[];
  /** Packages a component may import besides svelte (an icon set, say). */
  allowImports: string[];
  /** The tsconfig svelte-check reads, or null to skip the type check. */
  tsconfig: string | null;
  /** The colour pairs every theme must make legible: a contrast file (see tokens/contrast.json). */
  contrast: string;
  /** The app's pages, built, which the browser checks (a11y, target-size, reduced-motion) open headless. */
  pages: Page[];
}

/** A page the browser checks open: an HTML file under the root, served over HTTP from the root. */
export interface Page {
  name: string;
  /** The built HTML file, relative to the root. */
  path: string;
  /** A command run from the root before the page is opened, to build it: ["deno", "task", "build"]. */
  build?: string[];
  /** States of the page to check too, each reached by clicking these CSS selectors in order. */
  states?: { name: string; click: string[] }[];
}

export const DEFAULTS: StanceConfig = {
  tokens: "tokens",
  widgets: ["src/lib/ui/components"],
  components: ["src"],
  store: ["src/lib/ui/store/store.svelte.ts"],
  allowImports: [],
  tsconfig: "tsconfig.json",
  contrast: "tokens/contrast.json",
  pages: [],
};

export async function loadConfig(root: string): Promise<StanceConfig> {
  let raw: Partial<StanceConfig> = {};
  try {
    const text = await Deno.readTextFile(`${root}/stance-ui.json`);
    raw = (JSON.parse(text) as { check?: Partial<StanceConfig> }).check ?? {};
  } catch (e) {
    if (!(e instanceof Deno.errors.NotFound)) throw new Error(`stance-ui.json: ${(e as Error).message}`);
  }
  return { ...DEFAULTS, ...raw };
}
