import React from "react";
export type ImageAttachments = {
  reference_images?: string | string[] | null;
  reference_image?: string | null;
  logo_image?: string | null;
};
export function imageAttachments(value: ImageAttachments): string[] {
  if (value.reference_images !== undefined && value.reference_images !== null) {
    return typeof value.reference_images === "string"
      ? JSON.parse(value.reference_images)
      : value.reference_images;
  }
  return [
    ...new Set([value.reference_image, value.logo_image].filter(Boolean)),
  ] as string[];
}
export async function uploadLabImage(file: File) {
  if (file.size > 10 * 1024 * 1024) throw Error("Gambar maksimal 10 MB");
  const response = await fetch(
    `/api/lab/images?name=${encodeURIComponent(file.name.slice(0, 190))}`,
    {
      method: "POST",
      headers: { "Content-Type": file.type },
      body: file,
    },
  );
  const data = await response.json();
  if (!response.ok) throw Error(data.error || "Unggah gambar gagal");
  return data.id as string;
}
export function ImageUploads({
  images,
  busy,
  onChange,
  onUpload,
}: {
  images: string[];
  busy: boolean;
  onChange: (images: string[]) => void;
  onUpload: (files: File[]) => void;
}) {
  return (
    <div className="stack">
      <label className="field">
        Unggah gambar
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const files = Array.from(e.target.files || []);
            e.target.value = "";
            if (files.length) onUpload(files);
          }}
        />
      </label>
      {images.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
          {images.map((id, index) => (
            <div className="stack" key={id}>
              <img
                src={`/api/lab/images/${id}`}
                alt={`Lampiran ${index + 1}`}
                style={{
                  width: 140,
                  height: 120,
                  objectFit: "contain",
                  background: "#eee",
                }}
              />
              <button
                type="button"
                className="btn btn-sec btn-sm"
                aria-label={`Hapus lampiran ${index + 1}`}
                disabled={busy}
                onClick={() => onChange(images.filter((image) => image !== id))}
              >
                Hapus
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
