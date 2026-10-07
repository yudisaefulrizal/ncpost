import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  scryptSync,
} from "node:crypto";
export function exactKey(input: string, key: string) {
  if (!key || !input) return false;
  const a = Buffer.from(input),
    b = Buffer.from(key);
  return a.length === b.length && timingSafeEqual(a, b);
}
// Format hash: scrypt$<salt base64url>$<hash base64url>.
export function hashPassword(password: string) {
  const salt = randomBytes(16);
  return `scrypt$${salt.toString("base64url")}$${scryptSync(password, salt, 64).toString("base64url")}`;
}
export function verifyPassword(password: string, stored: string) {
  const [algo, salt, hash] = stored.split("$");
  if (algo !== "scrypt" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
export interface SessionUser {
  uid: number;
  email: string;
}
export function sessionToken(
  user: SessionUser,
  secret: string,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify({
      uid: user.uid,
      email: user.email,
      exp: now + 8 * 3600 * 1000,
      nonce: randomBytes(24).toString("hex"),
    }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function validSession(
  token: string,
  secret: string,
  now = Date.now(),
): SessionUser | null {
  if (!secret) return null;
  try {
    const [p, s] = token.split(".");
    const mac = createHmac("sha256", secret).update(p).digest("base64url");
    if (!exactKey(s, mac) || token.split(".").length !== 2) return null;
    const data = JSON.parse(Buffer.from(p, "base64url").toString());
    return Number.isFinite(data.exp) &&
      data.exp > now &&
      data.exp <= now + 8 * 3600 * 1000 &&
      Number.isInteger(data.uid) &&
      typeof data.email === "string"
      ? { uid: data.uid, email: data.email }
      : null;
  } catch {
    return null;
  }
}
export function allowedOrigin(origin: string | null) {
  return ["http://127.0.0.1:8072", "https://ncpost.nuscode.id"].includes(
    origin ?? "",
  );
}
export class RateLimiter {
  private map = new Map<string, { count: number; end: number }>();
  constructor(
    private max = 8,
    private window = 60000,
  ) {}
  take(key: string, now = Date.now()) {
    for (const [k, v] of this.map) if (v.end <= now) this.map.delete(k);
    let v = this.map.get(key);
    if (!v) {
      if (this.map.size > 10000) return false;
      v = { count: 0, end: now + this.window };
      this.map.set(key, v);
    }
    return ++v.count <= this.max;
  }
}
