// Launching the Windows app in the desktop session, from a session that has no desktop.
//
// A session over ssh has no desktop, and WebView2 cannot open a window there. A scheduled task created with /IT runs
// in the desktop session of the user who is signed in, so the platforms check creates one that starts the app, runs
// it once, and deletes it after. The task runs a small PowerShell script: it passes the end-to-end script to the app
// in STANCE_UI_E2E, read from a file so that no quoting can change it, starts the app with its output in two files,
// and writes the app's process id to a third so that the check can end it. The check reads the output files as they
// grow (checks/follow.ts).

import { join } from "node:path";

/** The files of one launch, in the check's output folder. */
export interface SessionLaunch {
  name: string;
  script: string;
  e2e: string | null;
  stdout: string;
  stderr: string;
  pid: string;
}

export function sessionLaunch(
  out: string,
  withScript: boolean,
  name = `stance-ui-${crypto.randomUUID().slice(0, 8)}`,
): SessionLaunch {
  return {
    name,
    script: join(out, "windows-task.ps1"),
    e2e: withScript ? join(out, "windows-e2e.js") : null,
    stdout: join(out, "windows-app.out.log"),
    stderr: join(out, "windows-app.err.log"),
    pid: join(out, "windows-app.pid"),
  };
}

/** A PowerShell string literal: single quotes, each single quote inside doubled. */
const quote = (s: string) => `'${s.replaceAll("'", "''")}'`;

/** The PowerShell script the task runs. */
export function taskScript(l: SessionLaunch, bin: string, cwd: string): string {
  return [
    "$ErrorActionPreference = 'Stop'",
    ...(l.e2e ? [`$env:STANCE_UI_E2E = Get-Content -Raw -LiteralPath ${quote(l.e2e)}`] : []),
    `$p = Start-Process -FilePath ${quote(bin)} -WorkingDirectory ${quote(cwd)} -RedirectStandardOutput ${
      quote(l.stdout)
    } -RedirectStandardError ${quote(l.stderr)} -PassThru`,
    `Set-Content -LiteralPath ${quote(l.pid)} -Value $p.Id`,
    "$p.WaitForExit()",
    "",
  ].join("\r\n");
}

/** The schtasks commands: create the task in the desktop session (/IT), run it, end it, delete it. */
export function taskCommands(l: SessionLaunch): Record<"create" | "run" | "end" | "remove", string[]> {
  const action = `powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "${l.script}"`;
  return {
    // /SC ONCE needs a start time; the task is started by /Run, never by its schedule.
    create: ["/Create", "/TN", l.name, "/TR", action, "/SC", "ONCE", "/ST", "23:59", "/IT", "/F"],
    run: ["/Run", "/TN", l.name],
    end: ["/End", "/TN", l.name],
    remove: ["/Delete", "/TN", l.name, "/F"],
  };
}

/** Whether someone is signed in to the desktop, from quser's output; null when quser could not say. */
export function desktopSignedIn(quser: { ok: boolean; out: string }): boolean | null {
  if (!quser.out.trim()) return null;
  return quser.out.split(/\r?\n/).slice(1).some((l) => /\bActive\b/i.test(l));
}

const run = async (cmd: string, args: string[]) => {
  try {
    const o = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
    return { ok: o.success, out: new TextDecoder().decode(o.stdout) };
  } catch {
    return { ok: false, out: "" };
  }
};

/** Writes the launch's files and creates and runs the task; false when the task could not be made or run. */
export async function startInSession(l: SessionLaunch, bin: string, cwd: string, script: string | null) {
  for (const f of [l.stdout, l.stderr, l.pid]) await Deno.remove(f).catch(() => {});
  if (l.e2e && script !== null) await Deno.writeTextFile(l.e2e, script);
  await Deno.writeTextFile(l.script, taskScript(l, bin, cwd));
  const c = taskCommands(l);
  return (await run("schtasks", c.create)).ok && (await run("schtasks", c.run)).ok;
}

/** Ends the app and the task, and deletes the task. */
export async function stopInSession(l: SessionLaunch): Promise<void> {
  const pid = (await Deno.readTextFile(l.pid).catch(() => "")).trim();
  if (/^\d+$/.test(pid)) await run("taskkill", ["/PID", pid, "/T", "/F"]);
  const c = taskCommands(l);
  await run("schtasks", c.end);
  await run("schtasks", c.remove);
}

/** Whether someone is signed in to this machine's desktop; null when it cannot be told. */
export const signedIn = async () => desktopSignedIn(await run("quser", []));
