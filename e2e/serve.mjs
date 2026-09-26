import { preview } from "vite";
import { readFile } from "node:fs/promises";

let unavailable = false;
let revision = "0";
await preview({
  configFile: false,
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
  plugins: [{
    name: "pokus-local-network-test",
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.startsWith("/__pokus_test_network")) {
          unavailable = request.url.includes("offline=true");
          revision = request.url.split("version=")[1] ?? revision;
          response.end("ok");
          return;
        }
        if (unavailable) { request.socket.destroy(); return; }
        if (request.url === "/sw.js" && revision !== "0") {
          response.setHeader("Content-Type", "application/javascript");
          response.setHeader("Cache-Control", "no-cache");
          void readFile("dist/sw.js", "utf8").then((source) => response.end(`${source}\n// test version ${revision}\n`));
          return;
        }
        next();
      });
    },
  }],
});
