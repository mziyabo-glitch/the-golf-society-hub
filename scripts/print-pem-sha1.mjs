#!/usr/bin/env node
/**
 * Print SHA-1 fingerprint of a PEM X.509 certificate (e.g. Play upload certificate).
 * Usage: node scripts/print-pem-sha1.mjs path/to/cert.pem
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const path = process.argv[2];
if (!path) {
  console.error("Usage: node scripts/print-pem-sha1.mjs <cert.pem>");
  process.exit(1);
}
const pem = readFileSync(path, "utf8");
const b64 = pem
  .replace(/-----BEGIN CERTIFICATE-----/g, "")
  .replace(/-----END CERTIFICATE-----/g, "")
  .replace(/\s/g, "");
const der = Buffer.from(b64, "base64");
const hex = createHash("sha1").update(der).digest("hex").toUpperCase();
const colon = hex.match(/.{1,2}/g).join(":");
console.log("SHA1:", colon);
