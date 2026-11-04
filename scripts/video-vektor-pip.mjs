import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// Universal wheel from the versioned PyPI release, verified before any code is loaded.
export const PIP_WHEEL = {
  url: "https://files.pythonhosted.org/packages/44/3c/d717024885424591d5376220b5e836c2d5293ce2011523c9de23ff7bf068/pip-25.3-py3-none-any.whl",
  sha256: "9655943313a94722b7774661c21049070f6bbb0a1516bf02f7c8d5d9201514cd",
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
export async function preparePython({ root, run, request = fetch }) {
  // Debian/Ubuntu can provide venv but omit ensurepip; the base interpreter stays untouched.
  await run("python3", ["-m", "venv", "--without-pip", ".venv"]);
  const python = path.join(root, ".venv/bin/python");
  try {
    await run(python, ["-m", "pip", "--version"]);
    return;
  } catch {}
  const wheel = path.join(root, ".cache/video-vektor-setup/pip-25.3.whl");
  if (existsSync(wheel) && digest(readFileSync(wheel)) !== PIP_WHEEL.sha256)
    rmSync(wheel);
  if (!existsSync(wheel)) {
    const response = await request(PIP_WHEEL.url);
    if (!response.ok)
      throw Error(`Unduhan pip gagal (HTTP ${response.status}).`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (digest(bytes) !== PIP_WHEEL.sha256)
      throw Error(
        "Checksum bootstrap pip tidak sesuai; pemasangan dibatalkan.",
      );
    mkdirSync(path.dirname(wheel), { recursive: true });
    const temporary = `${wheel}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, bytes);
      renameSync(temporary, wheel);
    } finally {
      rmSync(temporary, { force: true });
    }
  }
  await run(python, [
    "-c",
    `import pathlib, sys, sysconfig, zipfile
site = pathlib.Path(sysconfig.get_paths()['purelib']).resolve()
assert site.is_relative_to(pathlib.Path(sys.prefix).resolve()), 'Invalid virtualenv site-packages'
with zipfile.ZipFile(sys.argv[1]) as archive:
    assert all(not pathlib.PurePosixPath(n).is_absolute() and '..' not in pathlib.PurePosixPath(n).parts for n in archive.namelist()), 'Invalid wheel path'
    archive.extractall(site)
`,
    wheel,
  ]);
  await run(python, ["-m", "pip", "--version"]);
}
