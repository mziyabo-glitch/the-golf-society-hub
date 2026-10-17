// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: [
      "dist/**",
      ".expo/**",
      "node_modules/**",
      "coverage/**",
      "**/*.d.ts",
    ],
  },
  {
    // eslint-import-resolver-typescript pulls unrs-resolver (native binding); can fail on some npm/Windows installs.
    // @/ path aliases are validated by `tsc`; keep import rules that would invoke TS resolver disabled.
    rules: {
      "import/namespace": "off",
      "import/no-unresolved": "off",
      // Still invokes resolver-typescript / unrs on some installs; duplicates are caught by TS bundler.
      "import/no-duplicates": "off",
      // Default export naming rules still load the broken TS resolver on some npm/Windows installs.
      "import/no-named-as-default": "off",
      "import/no-named-as-default-member": "off",
    },
  },
]);
