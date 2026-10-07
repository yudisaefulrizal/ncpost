import { it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
it("HTTP bootstrap tidak mengimpor worker; port loser berhenti tanpa bootstrap data", async () => {
  const code = readFileSync("src/server/http.ts", "utf8");
  expect(code).not.toMatch(
    /import(?:[^;\n]*from)?\s*[\x27\x22][^\x27\x22]*worker/,
  );
  const server = createServer();
  await new Promise<void>((r) => server.listen(8072, "127.0.0.1", r));
  try {
    const child = spawn(
      process.execPath,
      ["--import", "tsx", "src/server/http.ts"],
      {
        cwd: process.cwd(),
        env: {
          PATH: process.env.PATH,
          SESSION_SECRET: "test-only-key-port-loser",
        },
        stdio: "pipe",
      },
    );
    let output = "";
    child.stdout.on("data", (b) => (output += b));
    const exit = await new Promise<number | null>((r) => child.on("exit", r));
    expect(exit).toBe(1);
    expect(output).not.toContain("NC Post:");
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}, 10000);
