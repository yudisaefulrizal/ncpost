import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parseHTML } from "linkedom";
import { expect, it } from "vitest";
import {
  normalizeBookSettings,
  socialTargets,
  type BookSettings,
} from "../src/server/book-settings";
import { videoVektorType } from "../src/server/video-vektor-type";
import { socialPlan, youtubeMediaFor } from "../src/server/social-plan";
import { youtubePublishInput } from "../src/server/youtube-publish";
import { requiredPosts } from "../src/server/cleanup-domain";
import { SocialPlanFields } from "../src/client/social-plan";
import { ContentPlanCard } from "../src/client/content-plan";

const legacy: BookSettings = {
  ...videoVektorType().settings,
  youtubeMedia: "v",
  youtubeAccountId: "a".repeat(24),
  tiktokAccountId: "b".repeat(24),
  instagramAccountId: "12",
  socialTargets: ["instagram", "youtube", "tiktok"],
  youtube: { visibility: "private", madeForKids: true, synthetic: true },
  tiktok: {
    media: "photo",
    privacy: "SELF_ONLY",
    allowComment: true,
    allowDuet: false,
    allowStitch: false,
    synthetic: true,
    autoMusic: false,
  },
};

it("normalizes saved vector settings to horizontal while preserving accounts and publication preferences", () => {
  const settings = normalizeBookSettings(legacy);
  expect(settings.youtubeMedia).toBe("h");
  expect(settings.tiktok).toEqual({ ...legacy.tiktok, media: "h" });
  expect(settings.youtube).toEqual(legacy.youtube);
  expect(settings.youtubeAccountId).toBe(legacy.youtubeAccountId);
  expect(settings.tiktokAccountId).toBe(legacy.tiktokAccountId);
  expect(settings.instagramAccountId).toBe("12");
  expect(socialTargets(settings)).toEqual(["youtube", "tiktok"]);
  expect(socialTargets({ ...legacy, socialTargets: undefined })).toEqual([
    "youtube",
    "tiktok",
  ]);
  expect(socialTargets({ ...legacy, socialTargets: [] })).toEqual([]);
});

it("selects the real horizontal artifact for vector publishing without sentence-image sources", () => {
  expect(legacy.sentenceVideoHKind).toBeNull();
  expect(youtubeMediaFor(legacy)).toBe("h");
  expect(youtubePublishInput("book:2172", "Judul", legacy)).toMatchObject({
    mediaKey: "book:2172:h",
    accountId: legacy.youtubeAccountId,
    visibility: "private",
    madeForKids: true,
    synthetic: true,
  });
  const plan = socialPlan(["VIDEO_KALIMAT_H"], legacy);
  for (const platform of ["youtube", "tiktok"])
    expect(plan.find((p) => p.platform === platform)).toMatchObject({
      active: true,
      posts: ["Video horizontal"],
      problems: [],
    });
  expect(plan.find((p) => p.platform === "instagram")).toMatchObject({
    active: false,
    posts: [],
  });
  expect(
    requiredPosts(["VIDEO_KALIMAT_H"], normalizeBookSettings(legacy)),
  ).toEqual({ instagram: [], youtube: true, tiktok: true });
});

it("renders vector publication controls with fixed 1080p horizontal media and no Shorts, vertical or carousel choices", () => {
  const html = renderToStaticMarkup(
    React.createElement(SocialPlanFields, {
      settings: legacy,
      outputs: ["VIDEO_KALIMAT_H"],
      zernioAccounts: [],
      zernioState: "connected",
      onChange: () => {},
    }),
  );
  expect(html).toContain("1920×1080 (16:9)");
  expect(html).toContain("Diposting: Video horizontal");
  expect(html).not.toContain("Shorts");
  expect(html).not.toContain("Video vertikal");
  expect(html).not.toContain("Foto carousel");
  const { document } = parseHTML(html);
  expect(document.querySelector('[aria-label="Media YouTube"]')).toBeNull();
  expect(document.querySelector('[aria-label="Media TikTok"]')).toBeNull();
  expect(document.querySelector("input[disabled]")).not.toBeNull();
});

it("shows the dedicated video format section instead of image/article settings", () => {
  const html = renderToStaticMarkup(
    React.createElement(ContentPlanCard, {
      type: { id: 10, ...videoVektorType() },
      onSave: async () => {},
    }),
  );
  expect(html).toContain("Format video");
  expect(html).toContain("1920×1080 (16:9)");
  expect(html).not.toContain("Output &amp; gambar");
  expect(html).not.toContain("Konfigurasi artikel");
});

it("keeps the existing format choices for ordinary content types", () => {
  const settings = normalizeBookSettings({
    ...legacy,
    pipeline: undefined,
    sentenceVideoKind: "IMAGE_VERTICAL",
  });
  expect(youtubeMediaFor(settings)).toBe("v");
  expect(socialTargets(settings)).toContain("instagram");
  const html = renderToStaticMarkup(
    React.createElement(SocialPlanFields, {
      settings,
      outputs: ["VIDEO_KALIMAT", "VIDEO_KALIMAT_H", "PANEL"],
      zernioAccounts: [],
      zernioState: "connected",
      onChange: () => {},
    }),
  );
  expect(html).toContain("Shorts (video vertikal)");
  expect(html).toContain("Foto carousel");
});
