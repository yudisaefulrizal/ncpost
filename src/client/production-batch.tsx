import React, { useEffect, useState } from "react";

export type BatchAction<T> = {
  id: string;
  label: string;
  destructive?: boolean;
  prepare: (item: T) => (() => Promise<unknown>) | null;
};

export async function executeBatch<T extends { id: number }>(
  items: T[],
  action: BatchAction<T>,
) {
  let succeeded = 0,
    skipped = 0;
  const failed: { id: number; error: string }[] = [];
  for (const item of items) {
    try {
      const task = action.prepare(item);
      if (!task) {
        skipped++;
        continue;
      }
      await task();
      succeeded++;
    } catch (error) {
      failed.push({
        id: item.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { succeeded, skipped, failed };
}

export function useProductionSelection<T extends { id: number }>(
  items: T[],
  scope: string | number,
) {
  const [ids, setIds] = useState<number[]>([]);
  useEffect(() => setIds([]), [scope]);
  const selected = items.filter((item) => ids.includes(item.id));
  return {
    selected,
    clear: () => setIds([]),
    checkbox: (item: T, disabled = false) => (
      <input
        type="checkbox"
        aria-label={`Pilih konten #${item.id}`}
        checked={selected.some((row) => row.id === item.id)}
        disabled={disabled}
        onChange={(e) =>
          setIds((old) =>
            e.target.checked
              ? [...old, item.id]
              : old.filter((id) => id !== item.id),
          )
        }
      />
    ),
    all: (page: T[], disabled = false) => (
      <input
        type="checkbox"
        aria-label="Pilih semua di halaman ini"
        checked={
          page.length > 0 &&
          page.every((item) => selected.some((row) => row.id === item.id))
        }
        disabled={disabled || !page.length}
        onChange={(e) =>
          setIds((old) =>
            e.target.checked
              ? [...new Set([...old, ...page.map((item) => item.id)])]
              : old.filter((id) => !page.some((item) => item.id === id)),
          )
        }
      />
    ),
  };
}

export function ProductionBatch<T extends { id: number }>({
  items,
  actions,
  onRefresh,
  onClear,
  onBusy,
}: {
  items: T[];
  actions: BatchAction<T>[];
  onRefresh: () => Promise<unknown>;
  onClear: () => void;
  onBusy: (busy: boolean) => void;
}) {
  const [choice, setChoice] = useState("ARTICLE");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof executeBatch>
  > | null>(null);
  const [error, setError] = useState("");
  const action = actions.find((action) => action.id === choice) || actions[0];
  const run = async () => {
    if (!action || !items.length || busy) return;
    if (
      action.destructive &&
      !confirm(`${action.label} untuk ${items.length} konten terpilih?`)
    )
      return;
    setBusy(true);
    onBusy(true);
    setResult(null);
    setError("");
    try {
      setResult(await executeBatch(items, action));
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <div className="production-batch">
      <div className="toolbar">
        <span>{items.length} dipilih</span>
        <select
          aria-label="Aksi batch"
          value={action?.id || ""}
          disabled={busy}
          onChange={(e) => setChoice(e.target.value)}
        >
          {actions.map((action) => (
            <option key={action.id} value={action.id}>
              {action.label}
            </option>
          ))}
        </select>
        <button
          className="btn btn-pri btn-sm"
          disabled={busy || !items.length}
          onClick={run}
        >
          {busy ? "Memproses batch…" : "Jalankan batch"}
        </button>
        <button
          className="btn btn-sec btn-sm"
          disabled={busy || !items.length}
          onClick={onClear}
        >
          Batal pilih
        </button>
      </div>
      {result && (
        <div role="status">
          {result.succeeded} berhasil · {result.skipped} dilewati ·{" "}
          {result.failed.length} gagal
          {result.failed.length > 0 && (
            <ul>
              {result.failed.map((failure) => (
                <li key={failure.id}>
                  #{failure.id}: {failure.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="warn">
          {error}
        </p>
      )}
    </div>
  );
}
