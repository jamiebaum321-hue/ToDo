import { describe, expect, it } from "vitest";
import { crossedLocalTime, isQuietHours, minutesOfDay, parseHhMm, relativeLabel } from "@/lib/time";

describe("parseHhMm", () => {
  it("reads a valid time", () => {
    expect(parseHhMm("07:30")).toEqual({ hour: 7, minute: 30 });
    expect(parseHhMm("23:59")).toEqual({ hour: 23, minute: 59 });
  });

  it("falls back on nonsense instead of producing NaN", () => {
    expect(parseHhMm("25:00")).toEqual({ hour: 7, minute: 0 });
    expect(parseHhMm("")).toEqual({ hour: 7, minute: 0 });
  });
});

describe("minutesOfDay", () => {
  it("reads the wall clock in the given zone", () => {
    // 2026-01-15T17:30Z is 12:30 in New York (UTC-5 in January).
    const d = new Date("2026-01-15T17:30:00Z");
    expect(minutesOfDay(d, "America/New_York")).toBe(12 * 60 + 30);
    expect(minutesOfDay(d, "UTC")).toBe(17 * 60 + 30);
  });

  it("handles midnight without wrapping to 1440", () => {
    expect(minutesOfDay(new Date("2026-01-15T00:00:00Z"), "UTC")).toBe(0);
  });
});

describe("isQuietHours", () => {
  const tz = "UTC";

  it("covers a window that wraps past midnight", () => {
    expect(isQuietHours(new Date("2026-01-15T22:00:00Z"), tz, "21:30", "06:30")).toBe(true);
    expect(isQuietHours(new Date("2026-01-15T03:00:00Z"), tz, "21:30", "06:30")).toBe(true);
    expect(isQuietHours(new Date("2026-01-15T12:00:00Z"), tz, "21:30", "06:30")).toBe(false);
  });

  it("covers a same-day window", () => {
    expect(isQuietHours(new Date("2026-01-15T13:00:00Z"), tz, "12:00", "14:00")).toBe(true);
    expect(isQuietHours(new Date("2026-01-15T15:00:00Z"), tz, "12:00", "14:00")).toBe(false);
  });

  it("treats the end of the window as already awake", () => {
    expect(isQuietHours(new Date("2026-01-15T06:30:00Z"), tz, "21:30", "06:30")).toBe(false);
  });
});

describe("crossedLocalTime", () => {
  it("fires on the first tick after the digest time", () => {
    expect(crossedLocalTime(new Date("2026-01-15T12:05:00Z"), "UTC", "12:00", 20)).toBe(true);
    expect(crossedLocalTime(new Date("2026-01-15T12:19:00Z"), "UTC", "12:00", 20)).toBe(true);
  });

  it("does not fire again once the window has passed", () => {
    expect(crossedLocalTime(new Date("2026-01-15T12:25:00Z"), "UTC", "12:00", 20)).toBe(false);
  });

  it("does not fire before the time", () => {
    expect(crossedLocalTime(new Date("2026-01-15T11:50:00Z"), "UTC", "12:00", 20)).toBe(false);
  });

  it("works across midnight", () => {
    expect(crossedLocalTime(new Date("2026-01-15T00:05:00Z"), "UTC", "00:00", 20)).toBe(true);
    expect(crossedLocalTime(new Date("2026-01-14T23:55:00Z"), "UTC", "00:00", 20)).toBe(false);
  });

  it("fires for each timezone at that zone's local time", () => {
    // 12:05 UTC is 07:05 in New York — the New York digest, not the UTC one.
    const now = new Date("2026-01-15T12:05:00Z");
    expect(crossedLocalTime(now, "America/New_York", "07:00", 20)).toBe(true);
    expect(crossedLocalTime(now, "UTC", "07:00", 20)).toBe(false);
  });
});

describe("relativeLabel", () => {
  const now = new Date("2026-01-15T12:00:00Z");

  it("describes the near future and the recent past", () => {
    expect(relativeLabel(new Date("2026-01-15T14:00:00Z"), now)).toContain("2");
    expect(relativeLabel(new Date("2026-01-14T12:00:00Z"), now)).toMatch(/yesterday|1 day ago/i);
    expect(relativeLabel(new Date("2026-01-15T12:00:20Z"), now)).toBe("now");
  });
});
