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

// A working Chrome executable alone does not prove server-side WebGL works.
export async function verifyCpuWebGl({
  root,
  executable,
  renderer = createRequire(path.join(root, "package.json"))(
    "@remotion/renderer",
  ),
}) {
  const browser = await renderer.openBrowser("chrome", {
    browserExecutable: executable,
    chromiumOptions: { gl: "swangle" },
    logLevel: "error",
  });
  try {
    const page = await browser.newPage({
      context: () => null,
      logLevel: "error",
      indent: false,
      pageIndex: 0,
      onBrowserLog: null,
      onLog: () => {},
    });
    const result = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 1920;
      canvas.height = 1080;
      const gl = canvas.getContext("webgl2");
      if (!gl) return false;
      gl.clearColor(0.25, 0.5, 0.75, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      const pixel = new Uint8Array(4);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return (
        Math.abs(pixel[0] - 64) <= 1 &&
        Math.abs(pixel[1] - 128) <= 1 &&
        Math.abs(pixel[2] - 191) <= 1 &&
        pixel[3] === 255
      );
    });
    if (!result)
      throw Error("WebGL2 CPU swangle tidak dapat menggambar pada 1920×1080.");
    console.log("WebGL2 CPU swangle berhasil menggambar pada 1920×1080.");
  } finally {
    await browser.close({ silent: true });
  }
}
