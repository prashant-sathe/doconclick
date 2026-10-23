// Shared by the suites that start their OWN dev server with a mock Cashfree
// (test:walk-in, test:dues, test:payments, test:nurse-fee-coupons).
//
//  - MOCK_PORT env (default 3100) is the preferred dev-server port; if it is
//    busy (e.g. the owner's `next dev -p 3100`) a free port is used instead.
//  - Next locks <distDir>/dev, so a second dev server on the same project dir
//    refuses to start ("Another next dev server is already running"). The child
//    therefore always gets its own distDir via NEXT_DIST_DIR (read by
//    next.config.ts) under .next/ (git-ignored), so the owner's server is
//    never touched.
//  - Next rewrites tsconfig.json "include" for a custom distDir; the original
//    text is restored when the test process exits.
//  - The mock-Cashfree port is also picked free (fixed 4010-4012 clashed when
//    suites ran in parallel).
import fs from "fs";
import path from "path";
import net from "net";
import { spawn, type ChildProcess } from "child_process";

function listenOn(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const s = net.createServer();
    s.once("error", () => resolve(null));
    s.listen(port, () => {
      const p = (s.address() as net.AddressInfo).port;
      s.close(() => resolve(p));
    });
  });
}

/** `preferred` if free, otherwise any free port. */
export async function pickPort(preferred: number): Promise<number> {
  return (await listenOn(preferred)) ?? (await listenOn(0))!;
}

export async function startDevServer(opts: { env: Record<string, string>; label: string }): Promise<{ child: ChildProcess; port: number; base: string }> {
  const tsconfig = path.join(process.cwd(), "tsconfig.json");
  const original = fs.readFileSync(tsconfig, "utf8");
  process.once("exit", () => { try { if (fs.readFileSync(tsconfig, "utf8") !== original) fs.writeFileSync(tsconfig, original); } catch {} });
  const wanted = Number(process.env.MOCK_PORT) || 3100;
  const port = await pickPort(wanted);
  const env: NodeJS.ProcessEnv = { ...process.env, ...opts.env, NEXT_DIST_DIR: `.next/test-${opts.label}` };
  for (const k of Object.keys(env)) if (k.startsWith("AWS_")) delete env[k];
  console.log(`[${opts.label}] dev server on port ${port}${port !== wanted ? ` (${wanted} was busy)` : ""}, distDir ${env.NEXT_DIST_DIR}`);
  const child = spawn("npx", ["next", "dev", "-p", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`dev server didn't start:\n${log}`)), 90000);
    const onData = (d: Buffer) => {
      log += d.toString();
      if (/another instance|EADDRINUSE|already running/i.test(log)) { clearTimeout(timer); reject(new Error(`dev server failed:\n${log}`)); }
      else if (/Ready in/.test(log)) { clearTimeout(timer); resolve(); }
    };
    child.stdout!.on("data", onData);
    child.stderr!.on("data", onData);
    child.on("exit", (code) => { clearTimeout(timer); reject(new Error(`dev server exited (${code}):\n${log}`)); });
  });
  return { child, port, base: `http://localhost:${port}` };
}
