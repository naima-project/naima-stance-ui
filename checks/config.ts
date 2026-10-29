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
  /** For the platforms check: the app's folder (where src-tauri is) and its end-to-end script, or null. */
  platforms?: { app: string; e2e: string | null };
}

export const DEFAULTS: StanceConfig = {
  tokens: "tokens",
  widgets: ["src/lib/ui/components"],
  components: ["src"],
  store: ["src/lib/ui/store/store.svelte.ts"],
  allowImports: [],
  tsconfig: "tsconfig.json",
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
