export interface InstagramAccount {
  id: string;
  username: string;
}
export interface InstagramConnection {
  state: string;
  reason?: string;
  accounts?: InstagramAccount[];
}
export function selectInstagramAccount(
  id: string | null,
  connection: InstagramConnection,
): InstagramAccount {
  if (connection.state !== "connected")
    throw Error(
      "Akun Instagram NC-WA belum terhubung: " + (connection.reason ?? ""),
    );
  const accounts = connection.accounts ?? [];
  if (id) {
    const account = accounts.find((a) => a.id === id);
    if (!account)
      throw Error(
        "Akun Instagram tujuan buku ini tidak tersedia di NC-WA. Pilih ulang di Pengaturan Konten.",
      );
    return account;
  }
  if (accounts.length === 1) return accounts[0];
  if (!accounts.length)
    throw Error("Belum ada akun Instagram yang tersedia di NC-WA");
  throw Error(
    "Ada beberapa akun Instagram. Pilih akun tujuan buku di Pengaturan Konten.",
  );
}
