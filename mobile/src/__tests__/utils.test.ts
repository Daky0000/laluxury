import { isNewerVersion } from "../utils/version";
import { formatCurrency } from "../utils/format";
import { resolveImageUrl } from "../utils/image";

describe("isNewerVersion", () => {
  it.each([
    ["1.3.3", "1.3.4", true],
    ["1.3.4", "1.3.4", false],
    ["1.3.5", "1.3.4", false],
    ["1.9.0", "1.10.0", true],
    ["1.3", "1.3.1", true],
    ["", "1.0.0", false],
  ])("%s -> %s is %s", (current, latest, expected) => {
    expect(isNewerVersion(current, latest)).toBe(expected);
  });
});

describe("formatCurrency", () => {
  it("formats pesewas as cedis with grouping", () => {
    expect(formatCurrency(123_456_78)).toBe("GH₵ 123,456.78");
    expect(formatCurrency(5)).toBe("GH₵ 0.05");
    expect(formatCurrency(-250)).toBe("-GH₵ 2.50");
  });
});

describe("resolveImageUrl", () => {
  it("keeps absolute URLs and resolves relative ones", () => {
    expect(resolveImageUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect(resolveImageUrl("/media/a.jpg", "https://store.test/")).toBe("https://store.test/media/a.jpg");
    expect(resolveImageUrl("/catalog/a.jpg")).toMatch(/r2\.dev\/catalog\/a\.jpg$/);
    expect(resolveImageUrl("")).toBeNull();
    expect(resolveImageUrl(null)).toBeNull();
  });
});
