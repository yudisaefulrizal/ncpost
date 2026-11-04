import { describe, expect, it } from "vitest";
import { vectorScope } from "../src/server/video-vektor";

describe("ncpost Video Vektor resource boundary", () => {
  it("places all descendants in a unique 2 GB scope with zero swap", () => {
    const plan = vectorScope(
      ["/engine/scripts/video.mjs", "--title", "a; b $(whoami)"],
      { PATH: "/bin", HOME: "/worker", REMOTION_GL: "angle" },
    );
    expect(plan.command).toBe("systemd-run");
    expect(plan.args).toEqual(
      expect.arrayContaining([
        "--scope",
        "--user",
        "--property=MemoryMax=2000000000",
        "--property=MemoryHigh=1700000000",
        "--property=MemorySwapMax=0",
      ]),
    );
    expect(plan.args.slice(-3)).toEqual([
      "/engine/scripts/video.mjs",
      "--title",
      "a; b $(whoami)",
    ]);
    expect(plan.env).toMatchObject({
      HOME: "/worker",
      REMOTION_GL: "swangle",
      NODE_OPTIONS: "--max-old-space-size=768",
      OPENBLAS_NUM_THREADS: "1",
    });
    expect(plan.unit).not.toBe(vectorScope([], {}).unit);
  });
});
