// How the browser checks read Playwright's report of missing system libraries, and what they ask for instead.
import { assert, assertEquals } from "@std/assert";
import { dependencyProblem, missingDependencies, stanceRootOf } from "../checks/chromium.ts";

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

Deno.test("the stance's root is found from a Windows file URL without doubling the drive", () => {
  assertEquals(stanceRootOf("file:///C:/Users/u/stance/checks/chromium.ts", true), "C:\\Users\\u\\stance");
  assertEquals(stanceRootOf("file:///D:/a%20b/stance/checks/chromium.ts", true), "D:\\a b\\stance");
  assertEquals(stanceRootOf("file://server/share/stance/checks/chromium.ts", true), "\\\\server\\share\\stance");
});

Deno.test("the stance's root is found from a POSIX file URL", () => {
  assertEquals(stanceRootOf("file:///home/u/stance/checks/chromium.ts", false), "/home/u/stance");
  assertEquals(stanceRootOf("file:///home/a%20b/stance/checks/chromium.ts", false), "/home/a b/stance");
});
