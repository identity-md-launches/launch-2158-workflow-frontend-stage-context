import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { abiHash, sha256, json, files } from "./shared.mjs";
const web = fileURLToPath(new URL("..", import.meta.url));
const root = resolve(web, "..");
const dist = resolve(root, "dist");
const handoff = await json(web + "/deployment/handoff.json");
const chain = await json(web + "/deployment/network.json");
const { version, launchId, chainId, sourceCommit, attestationHash, poolKey } =
  handoff;
const contracts = [];
await mkdir(dist + "/abi", { recursive: true });
for (const c of handoff.contracts) {
  const bytes = await readFile(root + "/docs/abi/" + c.name + ".json");
  const abi = JSON.parse(bytes);
  if (!Array.isArray(abi) || abiHash(abi) !== c.abiHash)
    throw new Error("ABI hash mismatch: " + c.name);
  const abiPath = "abi/" + c.name + ".json";
  await writeFile(dist + "/" + abiPath, bytes);
  contracts.push({
    name: c.name,
    address: c.address,
    abiHash: c.abiHash,
    abiPath,
  });
}
const assets = [];
for (const path of await files(dist)) {
  if (path === "imd-deployment.json") continue;
  const bytes = await readFile(dist + "/" + path);
  if (bytes.length > 8388608) throw new Error("Asset too large: " + path);
  assets.push({ path, sha256: sha256(bytes) });
}
if (assets.length > 128) throw new Error("Too many assets");
const manifest = {
  version,
  launchId,
  chainId,
  sourceCommit,
  attestationHash,
  contracts,
  assets,
  ...(poolKey ? { poolKey } : {}),
  ...chain,
};
await writeFile(
  dist + "/imd-deployment.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
console.log(
  `Manifest generated: ${contracts.length} attested ABIs, ${assets.length} hashed assets.`,
);
