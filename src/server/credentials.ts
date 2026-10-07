import { existsSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./config";
export const credentialFields = [
  { name: "NCWA_API_KEY", label: "Key NC-WA", secret: true },
  { name: "ELEVENLABS_API_KEY", label: "Key ElevenLabs", secret: true },
  { name: "ELEVENLABS_VOICE_ID", label: "Voice ID ElevenLabs", secret: false },
] as const;
export type CredentialName = (typeof credentialFields)[number]["name"];
export function validCredential(value: unknown) {
  return (
    typeof value === "string" &&
    value.length >= 4 &&
    value.length <= 256 &&
    /^[\x21-\x7e]+$/.test(value)
  );
}
export function credentialStatus(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    credentialFields.map((f) => [
      f.name,
      { label: f.label, set: !!env[f.name] },
    ]),
  );
}
// Tulis/hapus satu variabel di .env tanpa menyentuh baris lain; null menghapus.
export function writeEnvValue(
  file: string,
  name: string,
  value: string | null,
) {
  const lines = existsSync(file) ? readFileSync(file, "utf8").split("\n") : [];
  while (lines.length && lines[lines.length - 1] === "") lines.pop();
  const re = new RegExp(`^\\s*${name}=`);
  const rest = lines.filter((l) => !re.test(l));
  if (value !== null) rest.push(`${name}=${value}`);
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, rest.join("\n") + "\n", { mode: 0o600 });
  renameSync(tmp, file);
}
export function setCredential(name: string, value: string | null) {
  if (!credentialFields.some((f) => f.name === name))
    throw Error("Kredensial tidak dikenal");
  if (value !== null && !validCredential(value))
    throw Error("Nilai tidak valid: 4–256 karakter ASCII tanpa spasi");
  writeEnvValue(path.join(ROOT, ".env"), name, value);
  if (value === null) delete process.env[name];
  else process.env[name] = value;
}
