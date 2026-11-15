import { defineConfig } from "vitest/config";
import { loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Serves the Vercel function in api/chat.ts during `npm run dev`, so the AI
 * chat works locally without the Vercel CLI. Put GEMINI_API_KEY in
 * frontend/.env.local (gitignored) or the shell environment.
 */
function chatFunctionDev(): Plugin {
  return {
    name: "smarteats-chat-function-dev",
    configureServer(server) {
      server.middlewares.use("/api/chat", async (req, res) => {
        try {
          const mod = (await server.ssrLoadModule("/api/chat.ts")) as {
            POST: (request: Request) => Promise<Response>;
          };
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
          }
          const request = new Request(`http://${req.headers.host ?? "localhost"}/api/chat`, {
            method: req.method,
            headers,
            body: req.method === "POST" ? Buffer.concat(chunks) : undefined,
          });
          const response = await mod.POST(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => res.setHeader(key, value));
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (error) {
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: String(error) }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  for (const key of ["GEMINI_API_KEY", "GEMINI_MODEL"]) {
    if (env[key] && !process.env[key]) process.env[key] = env[key];
  }
  return {
    plugins: [react(), tailwindcss(), chatFunctionDev()],
    test: {
      environment: "jsdom",
      setupFiles: "./src/test/setup.ts",
    },
  };
});
