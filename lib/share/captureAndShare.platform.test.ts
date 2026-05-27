import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("captureAndShare platform bundles", () => {
  it("web implementation does not reference native-only modules", () => {
    const webPath = resolve(__dirname, "captureAndShare.web.ts");
    const source = readFileSync(webPath, "utf8");
    expect(source).not.toMatch(/react-native-view-shot/);
    expect(source).not.toMatch(/from ["']expo-sharing["']/);
    expect(source).toMatch(/html2canvas/);
  });

  it("native implementation uses view-shot and expo-sharing", () => {
    const nativePath = resolve(__dirname, "captureAndShare.native.ts");
    const source = readFileSync(nativePath, "utf8");
    expect(source).toMatch(/react-native-view-shot/);
    expect(source).toMatch(/expo-sharing/);
    expect(source).not.toMatch(/html2canvas/);
  });
});
