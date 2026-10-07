import { initConfig } from "../src/server/config";
import { publish, postStatus } from "../src/server/providers";
initConfig();
const [requestId, igUserId, videoUrl, caption] = process.argv.slice(2);
const r = await publish({ requestId, igUserId, videoUrl, caption });
console.log(JSON.stringify(r));
for (
  let i = 0;
  i < 30 && !["published", "failed", "unknown"].includes(r.status);
  i++
) {
  await new Promise((x) => setTimeout(x, 10000));
  const s = await postStatus(requestId);
  console.log(JSON.stringify(s));
  if (["published", "failed", "unknown"].includes(s.status)) break;
}
