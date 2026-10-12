import path from "node:path";
import { readdir, lstat } from "node:fs/promises";

const KEEP = new Set([
  "lab",
  "lab-references",
  "probes",
  ".test",
  "media-backups",
]);
export async function mediaResetFolders(root: string) {
  const folders: string[] = [];
  for (const name of await readdir(root).catch((e) => {
    if (e.code === "ENOENT") return [];
    throw e;
  })) {
    if (KEEP.has(name)) continue;
    const file = path.join(root, name);
    const stat = await lstat(file);
    if (stat.isSymbolicLink()) throw Error(`Reset menolak symlink: ${name}`);
    if (stat.isDirectory()) {
      if (name === "berita") {
        const media = path.join(file, "media");
        const child = await lstat(media).catch((e) => {
          if (e.code === "ENOENT") return null;
          throw e;
        });
        if (child?.isSymbolicLink())
          throw Error("Reset menolak symlink: berita/media");
        if (child?.isDirectory()) folders.push(media);
      } else folders.push(file);
    }
  }
  return folders;
}
export const MEDIA_RESET_SQL = [
  "DELETE FROM chapter_stock",
  "DELETE FROM news_stock",
  "DELETE FROM news_media_outputs",
  "DELETE FROM assets",
  "DELETE FROM media_stock",
  "DELETE FROM jobs WHERE kind NOT IN ('ARTICLE','EDITOR','QUOTE')",
  "DELETE FROM news_media_jobs",
  "UPDATE jobs j JOIN chapters c ON c.id=j.chapter_id SET j.revision=c.revision+1 WHERE j.state='queued' AND j.kind IN ('ARTICLE','EDITOR','QUOTE')",
  `UPDATE chapters SET revision=revision+1,visual_status='belum',panel_status='belum',production_status='belum',instagram_status='belum',post_status='belum',post_request_id=NULL,post_media_id=NULL,reels_status='belum',reels_request_id=NULL,reels_media_id=NULL,preview=NULL,panels=NULL,quote_image=NULL,text_image=NULL,sentence_audio=NULL,sentence_video=NULL,sentence_video_h=NULL`,
];
