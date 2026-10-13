import { expect, it, vi } from "vitest";
import { resolveVoice, saveVoice } from "../src/server/voices";
import { normalizeBookSettings } from "../src/server/book-settings";
it("preserves and validates per-content voice selection", () => {
  expect(normalizeBookSettings({ audioVoiceId: 3 }).audioVoiceId).toBe(3);
  expect(normalizeBookSettings({ audioVoiceId: null }).audioVoiceId).toBeNull();
  expect(() => normalizeBookSettings({ audioVoiceId: -1 })).toThrow("suara");
});
it("resolves an explicitly selected provider or the provider default", async () => {
  const voice = { id: 3, provider: "edge-tts", voice_id: "id-ID-ArdiNeural" };
  const query = vi.fn().mockResolvedValue([[voice]]);
  expect(await resolveVoice({ query } as any, 3, "elevenlabs")).toBe(voice);
  expect(query.mock.calls[0][1]).toEqual([3]);
  await resolveVoice({ query } as any, null, "edge-tts");
  expect(query.mock.calls[1][0]).toContain("is_default=1");
});
it("does not silently replace a missing explicit voice", async () => {
  await expect(
    resolveVoice({ query: async () => [[]] } as any, 3, "edge-tts"),
  ).rejects.toThrow("tidak ditemukan");
});
it("changes defaults transactionally and only within the provider", async () => {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn().mockResolvedValue([{ insertId: 3 }]),
  };
  expect(
    await saveVoice({ getConnection: async () => connection } as any, {
      name: "Ardi",
      voice_id: "id-ID-ArdiNeural",
      provider: "edge-tts",
      is_default: true,
    }),
  ).toBe(3);
  expect(connection.query.mock.calls[1][1]).toEqual(["edge-tts"]);
  expect(connection.commit).toHaveBeenCalled();
  expect(connection.release).toHaveBeenCalled();
});
