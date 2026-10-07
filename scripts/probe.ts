import { runCli } from "../src/server/providers";
console.log(
  (
    await runCli(
      process.env.CODEX_EXECUTABLE || "codex",
      ["login", "status"],
      "",
      process.cwd(),
      10000,
      true,
    )
  ).trim(),
);
console.log(
  "Teks live: diverifikasi parent; gambar PNG CLI diverifikasi parent (lihat docs/PARENT-PROVIDER-CHECK.md). Tidak ada live TTS/publikasi.",
);
