import "dotenv/config";
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __DEV__: JSON.stringify(true),
  },
  test: {
    environment: "node",
    include: ["lib/e2e/**/*.e2e.ts"],
    testTimeout: 120_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "react-native": path.resolve(__dirname, "lib/e2e/shims/react-native.ts"),
      "react-native-url-polyfill/auto": path.resolve(__dirname, "lib/e2e/shims/react-native-url-polyfill.ts"),
      "@react-native-async-storage/async-storage": path.resolve(__dirname, "lib/e2e/shims/async-storage.ts"),
    },
  },
});
