import { fileURLToPath } from "node:url";
import { mergeConfig } from "vite";
import base from "./vite.config.ts";

export default mergeConfig(base, {
  plugins: [{
    name: "silolink-design-entry",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url === "/" || request.url === "/index.html") {
          response.writeHead(302, { Location: "/design.html" });
          response.end();
        } else next();
      });
    },
  }],
  server: { host: "127.0.0.1", port: 7431, strictPort: true, open: false },
  resolve: { alias: [
    { find: /^(\.\/|\.\.\/)api$/, replacement: fileURLToPath(new URL("./src/design-preview/api.ts", import.meta.url)) },
    { find: "@tauri-apps/api/event", replacement: fileURLToPath(new URL("./src/design-preview/events.ts", import.meta.url)) },
  ] },
});
