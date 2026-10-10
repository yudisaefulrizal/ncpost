import { randomUUID } from "node:crypto";
import path from "node:path";
import { ROOT } from "./config";
import { validCredential, writeEnvValue } from "./credentials";
export interface ZernioConnection {
  id: string;
  name: string;
  key: string;
  profileId: string | null;
}
export function zernioConnections(): ZernioConnection[] {
  const saved: ZernioConnection[] = JSON.parse(
    process.env.ZERNIO_CONNECTIONS
      ? Buffer.from(process.env.ZERNIO_CONNECTIONS, "base64").toString("utf8")
      : "[]",
  );
  return [
    ...(process.env.ZERNIO_API_KEY
      ? [
          {
            id: "legacy",
            name: "Zernio utama",
            key: process.env.ZERNIO_API_KEY,
            profileId: process.env.ZERNIO_PROFILE_ID || null,
          },
        ]
      : []),
    ...saved,
  ];
}
export function zernioConnection(id = "legacy") {
  const value = zernioConnections().find((c) => c.id === id);
  if (!value) throw Error("Koneksi Zernio tidak tersedia di Kredensial");
  return value;
}
export function saveZernioConnection(input: {
  id?: string;
  name?: string;
  key?: string;
  profileId?: string | null;
}) {
  const current = input.id ? zernioConnection(input.id) : null;
  const name = (input.name ?? current?.name ?? "").trim();
  const key = input.key || current?.key;
  const profileId =
    input.profileId === undefined
      ? current?.profileId || null
      : input.profileId;
  if (!name || name.length > 100 || !validCredential(key))
    throw Error("Nama dan API key Zernio wajib diisi");
  if (profileId && !/^[a-f0-9]{24}$/i.test(profileId))
    throw Error("ID profil tidak valid");
  if (
    zernioConnections().some(
      (c) => c.id !== current?.id && c.key === key && c.profileId === profileId,
    )
  )
    throw Error("Koneksi dengan key dan profil yang sama sudah tersedia");
  if (current?.id === "legacy") {
    writeEnvValue(path.join(ROOT, ".env"), "ZERNIO_API_KEY", key!);
    process.env.ZERNIO_API_KEY = key!;
    writeEnvValue(path.join(ROOT, ".env"), "ZERNIO_PROFILE_ID", profileId);
    if (profileId) process.env.ZERNIO_PROFILE_ID = profileId;
    else delete process.env.ZERNIO_PROFILE_ID;
    return current.id;
  }
  const id = current?.id || randomUUID();
  const list = zernioConnections().filter(
    (c) => c.id !== "legacy" && c.id !== id,
  );
  list.push({ id, name, key: key!, profileId });
  const encoded = Buffer.from(JSON.stringify(list)).toString("base64");
  writeEnvValue(path.join(ROOT, ".env"), "ZERNIO_CONNECTIONS", encoded);
  process.env.ZERNIO_CONNECTIONS = encoded;
  return id;
}
export function connectionSummaries() {
  return zernioConnections().map(({ key, ...c }) => ({ ...c, set: !!key }));
}
