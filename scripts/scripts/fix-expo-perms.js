const fs = require("fs");
const path = require("path");

const binPath = path.join(process.cwd(), "node_modules", ".bin", "expo");

try {
  if (fs.existsSync(binPath)) {
    fs.chmodSync(binPath, 0o755);
    console.log(`[fix-expo-perms] chmod +x applied to: ${binPath}`);
  } else {
    console.log(`[fix-expo-perms] expo bin not found at: ${binPath}`);
  }
} catch (err) {
  console.warn(
    `[fix-expo-perms] Could not chmod expo bin: ${err?.message || err}`
  );
}
