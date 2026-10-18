import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, extname } from "node:path";
const root = resolve(fileURLToPath(new URL("../..", import.meta.url)), "dist");
export function startServer(port = 0) {
  return new Promise((resolveServer) => {
    const server = createServer(async (req, res) => {
      const raw = decodeURIComponent((req.url ?? "/").split("?")[0]);
      const path = raw.startsWith("/preview/") ? raw.slice(9) : raw.slice(1);
      const file = resolve(root, path || "index.html");
      if (!file.startsWith(root + "/")) {
        res.writeHead(403).end();
        return;
      }
      try {
        const body = await readFile(file);
        res.writeHead(200, {
          "Content-Type":
            {
              ".html": "text/html",
              ".js": "text/javascript",
              ".css": "text/css",
              ".json": "application/json",
              ".svg": "image/svg+xml",
              ".png": "image/png",
              ".woff2": "font/woff2",
            }[extname(file)] ?? "application/octet-stream",
        });
        res.end(body);
      } catch {
        res.writeHead(404).end("Not found");
      }
    });
    server.listen(port, "127.0.0.1", () =>
      resolveServer({
        server,
        url: `http://127.0.0.1:${server.address().port}/preview/`,
      }),
    );
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { server, url } = await startServer(Number(process.argv[2] ?? 4173));
  console.log(url);
  for (const sig of ["SIGINT", "SIGTERM"])
    process.on(sig, () => server.close(() => process.exit()));
}
