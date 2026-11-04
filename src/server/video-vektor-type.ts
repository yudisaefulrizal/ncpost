import { normalizeContentType } from "./content-type-domain";
export function videoVektorType() {
  return normalizeContentType({
    name: "Video Vektor",
    engine: "book",
    outputs: ["VIDEO_KALIMAT_H"],
    settings: { pipeline: "video-vektor" },
  });
}
export async function ensureVideoVektorType(db: {
  query: (...args: any[]) => Promise<any>;
}) {
  const type = videoVektorType();
  await db.query(
    `INSERT INTO content_types(name,engine,outputs,settings)
     SELECT ?,?,?,? WHERE NOT EXISTS (
       SELECT 1 FROM content_types WHERE name=? OR JSON_UNQUOTE(JSON_EXTRACT(settings,'$.pipeline'))='video-vektor'
     )`,
    [
      type.name,
      type.engine,
      JSON.stringify(type.outputs),
      JSON.stringify(type.settings),
      type.name,
    ],
  );
}
