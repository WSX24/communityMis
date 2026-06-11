import { spawn } from "node:child_process";

const scripts = [
  "scripts/validate-stage-01.mjs",
  "scripts/validate-stage-02.mjs",
  "scripts/validate-stage-03.mjs",
  "scripts/validate-stage-04.mjs",
  "scripts/validate-stage-05.mjs"
];

for (const script of scripts) {
  await run(script);
}

function run(script) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      cwd: process.cwd(),
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${script} failed with exit code ${code}`));
      }
    });
  });
}
