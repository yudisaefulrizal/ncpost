import { it, expect, vi } from "vitest";
import {
  runCli,
  parseEvents,
  tts,
  publish,
  editorReport,
} from "../src/server/providers";
it("JSON rusak dan tanpa final ditolak", () => {
  expect(() => parseEvents("bad")).toThrow();
  expect(() => parseEvents("{}")).toThrow();
  expect(
    parseEvents(
      '{"type":"item.completed","item":{"type":"agent_message","text":"ok"}}',
    ),
  ).toBe("ok");
});
it("stdin EOF dan timeout executable mock", async () => {
  expect(
    await runCli(
      process.execPath,
      [
        "-e",
        "process.stdin.resume();process.stdin.on('end',()=>process.stdout.write('eof'))",
      ],
      "x",
      process.cwd(),
      1000,
    ),
  ).toBe("eof");
  await expect(
    runCli(
      process.execPath,
      ["-e", "setInterval(()=>{},1000)"],
      "",
      process.cwd(),
      50,
    ),
  ).rejects.toThrow(/timeout/);
});
it("TTS ditolak sebelum network", async () => {
  const f = vi.fn();
  await expect(
    tts("text", { live: false, key: "", voice: "" }, f),
  ).rejects.toThrow(/LIVE_TTS/);
  expect(f).not.toHaveBeenCalled();
});
const reel = {
  requestId: "t-1",
  igUserId: "123",
  videoUrl: "https://media.example/v.mp4",
  caption: "Tes",
};
it("publish Reels: input tidak valid ditolak sebelum network", async () => {
  const f = vi.fn();
  for (const bad of [
    { ...reel, requestId: "a b" },
    { ...reel, igUserId: "abc" },
    { ...reel, videoUrl: "file:///etc/passwd" },
    { ...reel, videoUrl: "https://u:p@x.test/v.mp4" },
    { ...reel, caption: "x".repeat(2201) },
  ])
    await expect(publish(bad, f)).rejects.toThrow();
  expect(f).not.toHaveBeenCalled();
});
it("publish Reels: kirim REELS+videoUrl dengan key server-side", async () => {
  process.env.NCWA_API_KEY = "ncig_test";
  const f = vi.fn(async () =>
    Response.json({ status: "processing" }, { status: 202 }),
  );
  expect(await publish(reel, f as any)).toEqual({ status: "processing" });
  const [url, init]: any = f.mock.calls[0];
  expect(url).toMatch(/\/instagram\/posts$/);
  expect(init.headers.Authorization).toBe("Bearer ncig_test");
  expect(JSON.parse(init.body)).toEqual({
    requestId: "t-1",
    igUserId: "123",
    mediaType: "REELS",
    videoUrl: reel.videoUrl,
    caption: "Tes",
  });
  delete process.env.NCWA_API_KEY;
});
it("publish Reels: error NC-WA diteruskan tanpa retry", async () => {
  process.env.NCWA_API_KEY = "k";
  const f = vi.fn(async () =>
    Response.json({ error: { message: "invalid_video" } }, { status: 400 }),
  );
  await expect(publish(reel, f as any)).rejects.toThrow(/400.*invalid_video/);
  expect(f).toHaveBeenCalledTimes(1);
  delete process.env.NCWA_API_KEY;
});
it("review perlu catatan spesifik semua checks", () => {
  expect(() => editorReport({ lolos: true, checks: [] })).toThrow();
});
it("mock HTTP ElevenLabs memakai eleven_v3 dan menolak bila live dimatikan", async () => {
  const { tts } = await import("../src/server/providers");
  const mock = vi.fn(async (_url: any, init: any) => {
    expect(JSON.parse(init.body).model_id).toBe("eleven_v3");
    return new Response(new Uint8Array(200), { status: 200 });
  });
  const out = await tts(
    "Satu kalimat.",
    { live: true, key: "mock-key", voice: "mock-voice" },
    mock,
  );
  expect(out.length).toBe(200);
  expect(mock).toHaveBeenCalledTimes(1);
  await expect(
    tts("x", { live: false, key: "k", voice: "v" }, mock),
  ).rejects.toThrow(/LIVE_TTS/);
});
it("publishCarousel mengirim mediaType CAROUSEL dengan urutan gambar", async () => {
  const { publishCarousel } = await import("../src/server/providers");
  process.env.NCWA_API_KEY = "key-uji";
  let sent: any;
  const fake = (async (url: string, init: any) => {
    sent = { url, body: JSON.parse(init.body) };
    return new Response(JSON.stringify({ status: "processing" }), {
      status: 202,
    });
  }) as unknown as typeof fetch;
  const r = await publishCarousel(
    {
      requestId: "ncpost-2-abc",
      igUserId: "178",
      imageUrls: ["https://x/1.jpg", "https://x/2.jpg"],
      caption: "c",
    },
    fake,
  );
  expect(r.status).toBe("processing");
  expect(sent.url).toMatch(/\/posts$/);
  expect(sent.body).toEqual({
    requestId: "ncpost-2-abc",
    igUserId: "178",
    imageUrls: ["https://x/1.jpg", "https://x/2.jpg"],
    caption: "c",
    mediaType: "CAROUSEL",
  });
  await expect(
    publishCarousel(
      { requestId: "a.b", igUserId: "1", imageUrls: ["1", "2"], caption: "" },
      fake,
    ),
  ).rejects.toThrow(/requestId/);
  await expect(
    publishCarousel(
      { requestId: "a", igUserId: "1", imageUrls: ["1"], caption: "" },
      fake,
    ),
  ).rejects.toThrow(/2 sampai 10/);
});
