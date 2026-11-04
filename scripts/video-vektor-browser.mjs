import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

export async function prepareBrowser({
  root,
  run,
  exists = existsSync,
  renderer = createRequire(path.join(root, "package.json"))(
    "@remotion/renderer",
  ),
}) {
  const previous = process.cwd();
  try {
    // Remotion stores its versioned browser relative to the package cwd.
    process.chdir(root);
    const browser = await renderer.ensureBrowser({
      browserExecutable: exists("/usr/bin/google-chrome")
        ? "/usr/bin/google-chrome"
        : null,
      logLevel: "info",
    });
    if (!browser.path) throw Error("Browser Video Vektor belum tersedia.");
    await run(browser.path, ["--version"]);
    return browser.path;
  } finally {
    process.chdir(previous);
  }
}
