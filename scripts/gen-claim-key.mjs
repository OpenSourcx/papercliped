#!/usr/bin/env node
// Generates the Ed25519 key pair for Connect account claims.
//   node scripts/gen-claim-key.mjs <private-key-file> [kid]
// The PRIVATE key goes into the gateway's CONNECT_CLAIM_ED25519_PRIVATE_KEY (and CONNECT_CLAIM_KEY_ID = kid) and is never
// printed. The PUBLIC JWK printed here is not secret: it goes into Connect's CLAIM_PUBLIC_JWKS.
import { generateKeyPairSync } from "node:crypto";
import { writeFileSync } from "node:fs";
const [file, kid = "pcd-claim-1"] = process.argv.slice(2);
if (!file) { console.error("usage: gen-claim-key.mjs <private-key-file> [kid]"); process.exit(2); }
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
writeFileSync(file, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });
console.log(JSON.stringify([{ ...publicKey.export({ format: "jwk" }), kid }]));
