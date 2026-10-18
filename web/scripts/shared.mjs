import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { keccak256, toHex } from "viem";
export const canonical = (v) => JSON.stringify(sort(v));
function sort(v) {
  return Array.isArray(v)
    ? v.map(sort)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, sort(v[k])]),
        )
      : v;
}
export const abiHash = (abi) => keccak256(toHex(canonical(abi))).slice(2);
export const sha256 = (data) => createHash("sha256").update(data).digest("hex");
export const json = async (path) => JSON.parse(await readFile(path, "utf8"));
export async function files(root, prefix = "") {
  const out = [];
  for (const entry of await readdir(root + "/" + prefix, {
    withFileTypes: true,
  })) {
    const path = prefix + entry.name;
    if (entry.isSymbolicLink())
      throw new Error("Symlinks are not exported: " + path);
    if (entry.isDirectory()) out.push(...(await files(root, path + "/")));
    else out.push(path);
  }
  return out.sort();
}
