import { describe, expect, it } from "vitest";
import { BUCKETS, getBucket, isBucketKey, normalizeBucket } from "@/lib/buckets";
import { normalizeProvider, providerMeta } from "@/lib/providers";

describe("buckets", () => {
  it("has exactly the four the product is built around", () => {
    expect(BUCKETS.map((b) => b.key)).toEqual([
      "urgent_important",
      "urgent_not_priority",
      "delegate",
      "delete",
    ]);
  });

  it("accepts the wording an agent is likely to use", () => {
    expect(normalizeBucket("Urgent and Important")).toBe("urgent_important");
    expect(normalizeBucket("urgent-important")).toBe("urgent_important");
    expect(normalizeBucket("Q1")).toBe("urgent_important");
    expect(normalizeBucket("urgent not priority")).toBe("urgent_not_priority");
    expect(normalizeBucket("Delegate")).toBe("delegate");
    expect(normalizeBucket("DELETE")).toBe("delete");
  });

  it("falls back rather than dropping a task with odd wording", () => {
    expect(normalizeBucket("something nobody defined")).toBe("urgent_not_priority");
    expect(normalizeBucket(undefined)).toBe("urgent_not_priority");
    expect(normalizeBucket(42 as unknown)).toBe("urgent_not_priority");
  });

  it("still resolves a bucket for an unknown key", () => {
    expect(getBucket("nope").key).toBe("delete");
    expect(isBucketKey("delegate")).toBe(true);
    expect(isBucketKey("nope")).toBe(false);
  });
});

describe("providers", () => {
  it("maps the names connectors actually report", () => {
    expect(normalizeProvider("Microsoft 365")).toBe("outlook");
    expect(normalizeProvider("O365")).toBe("outlook");
    expect(normalizeProvider("Google")).toBe("gmail");
    expect(normalizeProvider("MSTeams")).toBe("teams");
    expect(normalizeProvider("Google Calendar")).toBe("google_calendar");
  });

  it("degrades to a generic source rather than throwing", () => {
    expect(normalizeProvider("carrier pigeon")).toBe("other");
    expect(providerMeta(null).label).toBe("Source");
  });
});
