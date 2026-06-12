import { pathToFileURL } from "node:url";
import { createBackendServer } from "./src/app.mjs";
import { loadBackendConfig } from "./src/config.mjs";

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const config = loadBackendConfig();
  createBackendServer({ config }).listen(config.port, config.bindHost, () => {
    console.log(`Backend API: http://${config.bindHost}:${config.port}`);
    console.log(`Health check: http://${config.bindHost}:${config.port}/api/health`);
    console.log(`Readiness check: http://${config.bindHost}:${config.port}/api/ready`);
  });
}

export { createBackendServer };
