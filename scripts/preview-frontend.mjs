process.env.NODE_ENV = "production";
process.env.API_BASE_URL ??= `http://127.0.0.1:${process.env.BACKEND_PORT ?? "3001"}`;
process.env.APP_ENV ??= "preview";

const { createFrontendServer } = await import("../frontend/server.mjs");
const { PROJECT_ROOT } = await import("../frontend/src/prototypeRenderer.mjs");

const port = Number(process.env.FRONTEND_PORT ?? 5173);

try {
  createFrontendServer().listen(port, "127.0.0.1", () => {
    console.log(`Frontend preview: http://127.0.0.1:${port}`);
    console.log(`API base URL: ${process.env.API_BASE_URL}`);
    console.log(`Project root: ${PROJECT_ROOT}`);
  });
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
