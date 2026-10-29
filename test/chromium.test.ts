// How the browser checks read Playwright's report of missing system libraries, and what they ask for instead.
import { assert, assertEquals } from "@std/assert";
import { dependencyProblem, missingDependencies } from "../checks/chromium.ts";

const box = (lines: string[]) => {
  const w = Math.max(...lines.map((l) => l.length));
  return ["╔" + "═".repeat(w + 2) + "╗", ...lines.map((l) => `║ ${l.padEnd(w)} ║`), "╚" + "═".repeat(w + 2) + "╝"]
    .join("\n");
};

Deno.test("missing packages Playwright maps are read whole, and apt-get installs them", () => {
  const message = "browserType.launch: \n" + box([
    "Host system is missing dependencies to run browsers.",
    "Please install them with the following command:",
    "",
    "    sudo npx playwright install-deps",
    "",
    "Alternatively, use apt:",
    "    sudo apt-get install libnss3\\",
    "        libatk1.0-0t64\\",
    "        libasound2t64",
    "",
    "<3 Playwright Team",
  ]);
  const missing = missingDependencies(message);
  assertEquals(missing, { libraries: [], packages: ["libnss3", "libatk1.0-0t64", "libasound2t64"] });
  const problem = dependencyProblem(missing!);
  assert(problem.includes("libnss3, libatk1.0-0t64, libasound2t64"), problem);
  assert(problem.includes("apt-get install libnss3 libatk1.0-0t64 libasound2t64"), problem);
});

Deno.test("missing libraries with no known package are listed, and install-deps is the command", () => {
  const message = box([
    "Host system is missing dependencies to run browsers.",
    "Missing libraries:",
    "    libgbm.so.1",
    "    libxkbcommon.so.0",
  ]);
  const missing = missingDependencies(message);
  assertEquals(missing, { libraries: ["libgbm.so.1", "libxkbcommon.so.0"], packages: [] });
  const problem = dependencyProblem(missing!);
  assert(problem.includes("libgbm.so.1, libxkbcommon.so.0"), problem);
  assert(/install-deps chromium/.test(problem), problem);
});

Deno.test("any other launch failure is not read as missing libraries", () => {
  assertEquals(missingDependencies("Executable doesn't exist at /x/chrome-headless-shell"), null);
});
