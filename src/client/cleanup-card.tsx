import React, { useState } from "react";
import { api } from "./api";

const size = (bytes: number) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(1)} GB`
    : `${Math.max(1, Math.round(bytes / 1e6))} MB`;

// Hapus video dan gambar siap posting konten yang sudah terbit di semua
// sosmed yang dituju. Artikel, audio, dan gambar ilustrasi tetap.
export function CleanupCard({
  onError,
}: {
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const clean = async () => {
    setBusy(true);
    setMessage("");
    try {
      const plan = await api("/cleanup");
      if (!plan.files) {
        setMessage("Tidak ada yang perlu dibersihkan.");
        return;
      }
      if (
        !window.confirm(
          `${plan.items} konten yang sudah terbit: ${plan.files} berkas (${size(plan.bytes)}) akan dihapus. Lanjutkan?`,
        )
      )
        return;
      const done = await api("/cleanup", "POST");
      setMessage(
        `${done.files} berkas dihapus, ${size(done.bytes)} dibebaskan.`,
      );
    } catch (e) {
      if (onError) onError((e as Error).message);
      else setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      className="card pad row-gap"
      style={{ justifyContent: "space-between" }}
    >
      <div>
        <strong>Bersihkan penyimpanan</strong>
        <small className="muted block">
          Video dan gambar siap posting yang sudah terbit di semua sosmed
          dihapus otomatis tiap selesai posting. Artikel, audio, dan gambar
          ilustrasi tidak dihapus.
        </small>
        {message && <small role="status">{message}</small>}
      </div>
      <button className="btn btn-sec" disabled={busy} onClick={clean}>
        {busy ? "Memeriksa…" : "Bersihkan yang sudah terbit"}
      </button>
    </section>
  );
}
