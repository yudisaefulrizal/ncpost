import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { preparePython } from "../video-vektor-pip.mjs";

test("isolated setup never invokes ensurepip and reuses an available pip", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ncpost-venv-test-")),
    calls = [];
  try {
    await preparePython({
      root,
      run: async (exe, args) => {
        calls.push([exe, args]);
      },
      request: async () => {
        throw Error("Download must not run");
      },
    });
    assert.deepEqual(calls, [
      ["python3", ["-m", "venv", "--without-pip", ".venv"]],
      [path.join(root, ".venv/bin/python"), ["-m", "pip", "--version"]],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
test("a missing pip is bootstrapped only after the wheel checksum passes", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "ncpost-venv-test-")),
    calls = [];
  try {
    await assert.rejects(
      preparePython({
        root,
        run: async (exe, args) => {
          calls.push([exe, args]);
          if (args.includes("pip")) throw Error("No module named pip");
        },
        request: async () => ({
          ok: true,
          arrayBuffer: async () => Buffer.from("corrupt wheel"),
        }),
      }),
      /Checksum bootstrap pip/,
    );
    assert.equal(calls.length, 2, "unverified code must never be loaded");
    assert.equal(
      existsSync(path.join(root, ".cache/video-vektor-setup/pip-25.3.whl")),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
