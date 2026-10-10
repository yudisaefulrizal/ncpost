import type { Store } from "../server/store";
// Record the new request before sending, so an interrupted repost cannot reuse
// the previous published status and accidentally submit again.
export async function sendInstagramPublication<
  T extends { status: string; mediaId?: string | null },
>(
  store: Pick<Store, "setPost" | "setReels">,
  chapterId: number,
  kind: "POST_IG" | "REELS_IG",
  requestId: string,
  send: () => Promise<T>,
) {
  const save = (data: {
    status: string;
    requestId: string;
    mediaId?: string | null;
  }) =>
    kind === "POST_IG"
      ? store.setPost(chapterId, data)
      : store.setReels(chapterId, data);
  await save({ status: "processing", requestId });
  try {
    const result = await send();
    await save({
      status: String(result.status),
      requestId,
      mediaId: result.mediaId,
    });
    return result;
  } catch (error) {
    await save({ status: "unknown", requestId });
    throw error;
  }
}
