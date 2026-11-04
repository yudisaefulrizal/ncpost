import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ContentTypeStore, withContentType } from "./content-types";
import type { Store } from "./store";

/** Exercise the real database enqueue path without exposing a job to the worker. */
export async function verifyVideoVektorQueue(store: Store) {
  const [types]: any = await store.db.query(
    "SELECT id FROM content_types WHERE deleted_at IS NULL AND JSON_UNQUOTE(JSON_EXTRACT(settings,'$.pipeline'))='video-vektor' ORDER BY id LIMIT 1",
  );
  if (!types.length) return false;
  const type = await new ContentTypeStore(store.db).get(Number(types[0].id));
  const connection = await store.db.getConnection();
  try {
    await connection.beginTransaction();
    const [created]: any = await connection.query(
      "INSERT INTO chapters(book,title,part_number,article,content_type_id) VALUES(?,?,1,'',?)",
      [
        `__check-video-vektor-${randomUUID()}`,
        "Verifikasi antrean Video Vektor",
        type.id,
      ],
    );
    const chapter = await store.chapter(Number(created.insertId), connection);
    assert(chapter);
    assert.equal(chapter.article, "");
    assert.equal(chapter.sentence_audio, null);
    const id = await withContentType(type, () =>
      store.enqueue(chapter.id, "VIDEO_KALIMAT_H", false, connection),
    );
    const [jobs]: any = await connection.query(
      "SELECT kind,state,revision,force_new FROM jobs WHERE id=?",
      [id],
    );
    assert.equal(jobs[0]?.kind, "VIDEO_KALIMAT_H");
    assert.equal(jobs[0]?.state, "queued");
    assert.equal(Number(jobs[0]?.revision), Number(chapter.revision));
    assert.equal(Number(jobs[0]?.force_new), 0);
    return true;
  } finally {
    try {
      await connection.rollback();
    } finally {
      connection.release();
    }
  }
}
