import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { abiHash, canonical, sha256, json, files } from "./shared.mjs";
const web = fileURLToPath(new URL("..", import.meta.url)),
  root = resolve(web, ".."),
  dist = root + "/dist";
const h = await json(web + "/deployment/handoff.json"),
  n = await json(web + "/deployment/network.json"),
  m = await json(dist + "/imd-deployment.json");
assert.deepEqual(
  Object.keys(m).sort(),
  [
    "version",
    "launchId",
    "chainId",
    "sourceCommit",
    "attestationHash",
    "contracts",
    "assets",
    "poolKey",
    "network",
    "walletAddChain",
  ].sort(),
);
for (const k of [
  "version",
  "launchId",
  "chainId",
  "sourceCommit",
  "attestationHash",
  "poolKey",
])
  assert.equal(canonical(m[k]), canonical(h[k]), k);
assert.deepEqual(m.network, n.network);
assert.deepEqual(m.walletAddChain, n.walletAddChain);
assert.deepEqual(
  m.contracts.map(({ abiPath, ...c }) => c),
  h.contracts.map(({ name, address, abiHash }) => ({ name, address, abiHash })),
);
const safe = (path) =>
  typeof path === "string" &&
  /^[a-zA-Z0-9_./-]+$/.test(path) &&
  !path.startsWith("/") &&
  !path.split("/").includes("..");
for (const c of m.contracts) {
  assert(safe(c.abiPath));
  assert.equal(abiHash(await json(dist + "/" + c.abiPath)), c.abiHash);
}
assert(m.assets.length <= 128);
assert.deepEqual(
  m.assets.map((a) => a.path).sort(),
  (await files(dist)).filter((p) => p !== "imd-deployment.json"),
);
let total = 0;
for (const a of m.assets) {
  assert(safe(a.path));
  const bytes = await readFile(dist + "/" + a.path);
  total += bytes.length;
  assert(bytes.length <= 8388608);
  assert.equal(sha256(bytes), a.sha256, a.path);
}
assert(total < 32 * 1024 * 1024);
console.log(
  JSON.stringify(
    {
      passed: true,
      contracts: m.contracts.length,
      assets: m.assets.length,
      exportBytes: total,
    },
    null,
    2,
  ),
);
