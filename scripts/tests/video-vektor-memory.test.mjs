import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, existsSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { memoryBoundary } from "../video-vektor-limited.mjs";

function kernel(max, swap = "0", group = "0::/user.slice/vector.scope\n") {
  return {
    read: (file) => {
      if (file === "/proc/self/cgroup") return group;
      if (file.endsWith("/memory.max")) return max;
      if (file.endsWith("/memory.swap.max")) return swap;
      throw Error(`Unexpected read: ${file}`);
    },
  };
}
test("accepts an enforced budget including tighter parent allocations", () => {
  assert.equal(
    memoryBoundary(kernel("2000000000\n")),
    "/sys/fs/cgroup/user.slice/vector.scope",
  );
  assert.equal(
    memoryBoundary(kernel("1000000000\n")),
    "/sys/fs/cgroup/user.slice/vector.scope",
  );
});
test("refuses unbounded, excessive, swapped, and legacy cgroups", () => {
  for (const max of ["max", "2000000001", "0", "-1", "garbage"])
    assert.throws(() => memoryBoundary(kernel(max)), /Batas RAM/);
  for (const swap of ["max", "1", "garbage"])
    assert.throws(
      () => memoryBoundary(kernel("2000000000", swap)),
      /Batas RAM/,
    );
  assert.throws(
    () => memoryBoundary(kernel("2000000000", "0", "1:memory:/old")),
    /cgroup v2/,
  );
});
test("running outside a bounded scope cannot start production", (t) => {
  let alreadyBounded = false;
  try {
    memoryBoundary();
    alreadyBounded = true;
  } catch {}
  if (alreadyBounded) {
    t.skip("Test runner already has an acceptable kernel memory boundary");
    return;
  }
  const root = mkdtempSync(path.join(os.tmpdir(), "vector-memory-test-"));
  try {
    const marker = path.join(root, "started");
    const script = path.join(root, "production.mjs");
    writeFileSync(
      script,
      `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(marker)},'unexpected');`,
    );
    assert.throws(() =>
      execFileSync(
        process.execPath,
        [path.resolve("scripts/video-vektor-limited.mjs"), script],
        { stdio: "pipe" },
      ),
    );
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
