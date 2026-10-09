import { labImageCatalog } from "./lab-image-types";
import { labReferences } from "./lab-references";
import { LAB_IMAGE_LIMIT, saveLabImage, labImageFile } from "./lab-images";
import { raw, Router } from "express";
import path from "node:path";
import { LabStore, labKind } from "./lab";
import { outputRoot } from "./output-paths";
import { safeFile } from "./templates";
function id(value: unknown) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1)
    throw Error("ID Lab tidak valid");
  return parsed;
}
export function labRouter(getStore: () => LabStore) {
  const router = Router();
  router.post(
    "/images",
    raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: LAB_IMAGE_LIMIT,
    }),
    async (req, res) => {
      const role = req.query.role || "reference";
      if (role !== "reference" && role !== "logo")
        throw Error("Jenis gambar tidak valid");
      const name =
        typeof req.query.name === "string"
          ? req.query.name.trim()
          : "Gambar referensi";
      if (!name || name.length > 190)
        throw Error("Nama gambar wajib diisi, maksimal 190 karakter");
      const id = await saveLabImage(req.body);
      try {
        await getStore().addImage(id, name, role);
      } catch (error) {
        const { unlink } = await import("node:fs/promises");
        await unlink(await labImageFile(id));
        throw error;
      }
      res.status(201).json({ id });
    },
  );
  router.get("/images", async (_req, res) =>
    res.json(await getStore().images()),
  );
  router.get("/images/:id", async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res
      .type("png")
      .sendFile(await labImageFile(req.params.id), { dotfiles: "allow" });
  });
  router.get("/image-types", async (_req, res) =>
    res.json(labImageCatalog((await getStore().prompts("image")) as any)),
  );
  router.get("/references", (req, res) =>
    res.json(labReferences(labKind(req.query.kind))),
  );
  router.get("/prompts", async (req, res) =>
    res.json(await getStore().prompts(labKind(req.query.kind))),
  );
  router.post("/prompts", async (req, res) =>
    res.status(201).json({ id: await getStore().save(req.body) }),
  );
  router.put("/prompts/:id", async (req, res) =>
    res.json({ id: await getStore().save(req.body, id(req.params.id)) }),
  );
  router.get("/runs", async (req, res) =>
    res.json(await getStore().list(labKind(req.query.kind))),
  );
  router.post("/runs", async (req, res) =>
    res.status(202).json({ id: await getStore().enqueue(req.body) }),
  );
  router.get("/runs/:id", async (req, res) => {
    const run = await getStore().get(id(req.params.id));
    if (!run) return void res.sendStatus(404);
    res.json({ ...run, result: run.result ? JSON.parse(run.result) : null });
  });
  router.get("/runs/:id/image", async (req, res) => {
    const run = await getStore().get(id(req.params.id));
    if (!run || run.kind !== "image" || run.state !== "completed")
      return void res.sendStatus(404);
    const root = path.join(outputRoot(), "lab");
    res
      .type("jpg")
      .sendFile(safeFile(root, path.join(root, String(run.id), "image.jpg")));
  });
  return router;
}
