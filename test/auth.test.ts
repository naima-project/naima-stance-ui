import { assert, assertEquals } from "@std/assert";
import type { Auth as AuthClass, AuthPort, AuthReply } from "../src/lib/auth/auth.svelte.ts";
import { compileModule } from "svelte/compiler";
import typescript from "typescript";

const root = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

/** The sign-in machine, its types stripped by TypeScript and its runes compiled by Svelte, as a bundler would. */
async function load(): Promise<typeof AuthClass> {
  const ts = await Deno.readTextFile(`${root}/src/lib/auth/auth.svelte.ts`);
  const plain = typescript.transpileModule(ts, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.ESNext },
  }).outputText;
  const js = compileModule(plain, { generate: "client", filename: "auth.svelte.js" }).js.code;
  const dir = await Deno.makeTempDir({ dir: root });
  await Deno.writeTextFile(`${dir}/auth.js`, js);
  const { Auth } = (await import(`${dir}/auth.js`)) as { Auth: typeof AuthClass };
  await Deno.remove(dir, { recursive: true });
  return Auth;
}

const reply = (r: AuthReply) => Promise.resolve(r);

Deno.test("signing in with a password, then a one-time code, keeps the username and never the password", async () => {
  const Auth = await load();
  const asked: string[] = [];
  const port: AuthPort = {
    password: (u, p) => (asked.push(`password ${u} ${p}`), reply({ result: "code" })),
    code: (c) => (asked.push(`code ${c}`),
      reply(
        c === "123456" ? { result: "signed-in" } : {
          result: "refused",
          error: "That code is not the one we sent.",
          field: "code",
        },
      )),
  };
  const auth = new Auth(port);
  assertEquals(auth.view.passkey, false);
  assert(!auth.allowed({ type: "passkey" }) && !auth.allowed({ type: "code" }));
  assert(await auth.password("  ada ", "correct horse"));
  assertEquals([auth.view.step, auth.view.username], ["code", "ada"]);
  assert(!auth.allowed({ type: "password" }));
  assert(await auth.code("654 321"));
  assertEquals([auth.view.step, auth.view.error, auth.view.field], [
    "code",
    "That code is not the one we sent.",
    "code",
  ]);
  assert(await auth.code("123 456"));
  assertEquals(auth.view.step, "signed-in");
  assertEquals(asked, ["password ada correct horse", "code 654321", "code 123456"]);
  assert(!JSON.stringify({ ...auth.view }).includes("correct horse"));
});

Deno.test("an empty field is refused in words tied to it, and a failing service is said too", async () => {
  const Auth = await load();
  let calls = 0;
  const auth = new Auth({
    password: () => (calls++, Promise.reject(new Error("offline"))),
    code: () => reply({ result: "signed-in" }),
  });
  assertEquals(await auth.password("", "x"), false);
  assertEquals([auth.view.field, auth.view.error], ["username", "Enter your username."]);
  assertEquals(await auth.password("ada", ""), false);
  assertEquals([auth.view.field, auth.view.error], ["password", "Enter your password."]);
  assertEquals(calls, 0);
  assert(await auth.password("ada", "x"));
  assertEquals(auth.view.step, "credentials");
  assertEquals(auth.view.field, null);
  assert(auth.view.error?.includes("did not answer"));
});

Deno.test("a passkey is offered only when the port has one, and back leaves the code step", async () => {
  const Auth = await load();
  const auth = new Auth({
    password: () => reply({ result: "code" }),
    passkey: () => reply({ result: "signed-in" }),
    code: () => reply({ result: "signed-in" }),
  });
  assert(auth.view.passkey && auth.allowed({ type: "passkey" }));
  await auth.password("ada", "x");
  assert(!auth.allowed({ type: "passkey" }));
  assert(auth.back());
  assertEquals(auth.view.step, "credentials");
  assert(await auth.passkey());
  assertEquals(auth.view.step, "signed-in");
  assertEquals(await auth.password("ada", "x"), false);
});
