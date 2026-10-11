import type mysql from "mysql2/promise";
import { DEFAULT_CRON_GUIDE, normalizeCronGuide } from "./cron-guide-domain";
export async function loadCronGuide(db: mysql.Pool) {
  const [rows]: any = await db.query(
    "SELECT settings FROM cron_guide WHERE id=1",
  );
  return normalizeCronGuide(
    rows[0] ? JSON.parse(rows[0].settings) : DEFAULT_CRON_GUIDE,
  );
}
export async function saveCronGuide(db: mysql.Pool, input: unknown) {
  const guide = normalizeCronGuide(input);
  await db.query(
    "INSERT INTO cron_guide(id,settings) VALUES(1,?) ON DUPLICATE KEY UPDATE settings=VALUES(settings)",
    [JSON.stringify(guide)],
  );
  return guide;
}
