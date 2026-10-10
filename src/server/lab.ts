import { labImageId, labImageFile, labImageIds } from "./lab-images";
import { resolveLabPrompt } from "./lab-references";
import type mysql from "mysql2/promise";
export type LabKind = "article" | "image";
export function labKind(value: unknown): LabKind {
  if (value !== "article" && value !== "image")
    throw Error("Jenis Lab tidak valid");
  return value;
}
export function labInput(input: any) {
  const kind = labKind(input?.kind);
  const imageType = input.imageType ?? "illustration";
  if (!["illustration", "ready_post", "ready_video"].includes(imageType))
    throw Error("Jenis gambar Lab tidak valid");
  if (kind !== "image" && imageType !== "illustration")
    throw Error("Jenis gambar hanya untuk Lab Gambar");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const prompt = typeof input.prompt === "string" ? input.prompt.trim() : "";
  const context = typeof input.input === "string" ? input.input.trim() : "";
  if (!name || name.length > 190)
    throw Error("Nama prompt wajib diisi, maksimal 190 karakter");
  if (!prompt || prompt.length > 30000)
    throw Error("Prompt wajib diisi, maksimal 30.000 karakter");
  if (context.length > 10000) throw Error("Input uji maksimal 10.000 karakter");
  const orientation = input.orientation || "bebas";
  if (!["bebas", "horizontal", "vertikal"].includes(orientation))
    throw Error("Orientasi gambar tidak valid");
  const referenceKey = input.referenceKey || null;
  if (referenceKey !== null && typeof referenceKey !== "string")
    throw Error("Referensi Lab tidak valid");
  resolveLabPrompt(kind, referenceKey, prompt);
  const referenceImage = labImageId(input.referenceImage);
  const logoImage = labImageId(input.logoImage);
  const referenceImages =
    input.referenceImages === undefined
      ? labImageIds([referenceImage, logoImage].filter(Boolean))
      : labImageIds(input.referenceImages);
  if (referenceImages.length && kind !== "image")
    throw Error("Referensi gambar hanya untuk Lab Gambar");
  return {
    kind,
    imageType,
    name,
    prompt,
    input: context,
    orientation,
    referenceKey,
    referenceImage,
    logoImage,
    referenceImages,
  };
}
export function labFinalPrompt(prompt: string, input: string) {
  return input ? `${prompt}\n\nInput uji:\n${input}` : prompt;
}
export interface LabRun {
  image_type?: string;
  reference_images?: string | null;
  reference_image?: string | null;
  logo_image?: string | null;
  reference_key?: string | null;
  resolved_prompt?: string | null;
  id: number;
  kind: LabKind;
  name: string;
  prompt: string;
  input: string;
  orientation: "horizontal" | "vertikal" | "bebas";
  state: string;
  result: string | null;
  error: string | null;
}
export class LabStore {
  constructor(readonly db: mysql.Pool) {}
  async images() {
    const [rows] = await this.db.query(
      "SELECT id,name,role,created_at FROM lab_images ORDER BY created_at DESC,id DESC",
    );
    return rows;
  }
  async addImage(id: string, name: string, role: string) {
    await this.db.query("INSERT INTO lab_images(id,name,role) VALUES(?,?,?)", [
      id,
      name,
      role,
    ]);
  }
  async prompts(kind: LabKind) {
    const [rows] = await this.db.query(
      "SELECT * FROM lab_prompts WHERE kind=? ORDER BY updated_at DESC,id DESC",
      [kind],
    );
    return rows;
  }
  async save(input: unknown, id?: number) {
    const draft = labInput(input);
    await Promise.all(draft.referenceImages.map(labImageFile));
    if (id !== undefined) {
      const [r]: any = await this.db.query(
        "UPDATE lab_prompts SET name=?,prompt=?,reference_key=?,reference_image=?,logo_image=?,reference_images=?,image_type=? WHERE id=? AND kind=?",
        [
          draft.name,
          draft.prompt,
          draft.referenceKey,
          draft.referenceImage,
          draft.logoImage,
          JSON.stringify(draft.referenceImages),
          draft.imageType,
          id,
          draft.kind,
        ],
      );
      if (!r.affectedRows) throw Error("Prompt Lab tidak ditemukan");
      return id;
    }
    const [r]: any = await this.db.query(
      "INSERT INTO lab_prompts(kind,name,prompt,reference_key,reference_image,logo_image,reference_images,image_type) VALUES(?,?,?,?,?,?,?,?)",
      [
        draft.kind,
        draft.name,
        draft.prompt,
        draft.referenceKey,
        draft.referenceImage,
        draft.logoImage,
        JSON.stringify(draft.referenceImages),
        draft.imageType,
      ],
    );
    return r.insertId as number;
  }
  async enqueue(input: unknown) {
    const draft = labInput(input);
    await Promise.all(draft.referenceImages.map(labImageFile));
    const [r]: any = await this.db.query(
      "INSERT INTO lab_runs(kind,name,prompt,input,orientation,reference_key,resolved_prompt,reference_image,logo_image,reference_images,image_type) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
      [
        draft.kind,
        draft.name,
        draft.prompt,
        draft.input,
        draft.orientation,
        draft.referenceKey,
        labFinalPrompt(
          resolveLabPrompt(draft.kind, draft.referenceKey, draft.prompt),
          draft.input,
        ),
        draft.referenceImage,
        draft.logoImage,
        JSON.stringify(draft.referenceImages),
        draft.imageType,
      ],
    );
    return r.insertId as number;
  }
  async list(kind: LabKind) {
    const [rows] = await this.db.query(
      "SELECT id,kind,name,prompt,image_type,reference_key,reference_image,logo_image,reference_images,state,error,orientation,created_at,started_at,finished_at FROM lab_runs WHERE kind=? ORDER BY id DESC LIMIT 100",
      [kind],
    );
    return rows;
  }
  async get(id: number) {
    const [rows]: any = await this.db.query(
      "SELECT * FROM lab_runs WHERE id=?",
      [id],
    );
    return rows[0] as LabRun | undefined;
  }
  async claim(now = Date.now()) {
    await this.db.query(
      "UPDATE lab_runs SET state='failed',error='Worker terhenti. Jalankan uji baru untuk mencoba lagi.',lease=0,finished_at=NOW() WHERE state='running' AND lease<?",
      [now],
    );
    const c = await this.db.getConnection();
    try {
      await c.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await c.beginTransaction();
      const [rows]: any = await c.query(
        "SELECT * FROM lab_runs WHERE state='queued' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",
      );
      const job = rows[0] as LabRun | undefined;
      if (job)
        await c.query(
          "UPDATE lab_runs SET state='running',lease=?,started_at=NOW() WHERE id=?",
          [now + 300000, job.id],
        );
      await c.commit();
      return job ? { ...job, state: "running" } : undefined;
    } catch (error) {
      await c.rollback();
      throw error;
    } finally {
      c.release();
    }
  }
  async heartbeat(id: number) {
    await this.db.query(
      "UPDATE lab_runs SET lease=? WHERE id=? AND state='running'",
      [Date.now() + 300000, id],
    );
  }
  async complete(id: number, result: unknown) {
    await this.db.query(
      "UPDATE lab_runs SET state='completed',result=?,lease=0,finished_at=NOW() WHERE id=? AND state='running'",
      [JSON.stringify(result), id],
    );
  }
  async fail(id: number, error: string) {
    await this.db.query(
      "UPDATE lab_runs SET state='failed',error=?,lease=0,finished_at=NOW() WHERE id=? AND state='running'",
      [error, id],
    );
  }
}
