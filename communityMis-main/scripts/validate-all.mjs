import { spawn } from "node:child_process";

const scripts = [
  "scripts/validate-stage-01.mjs",
  "scripts/validate-stage-02.mjs",
  "scripts/validate-stage-03.mjs",
  "scripts/validate-stage-04.mjs",
  "scripts/validate-stage-05.mjs",
  "scripts/validate-stage-06.mjs",
  "scripts/validate-stage-07.mjs",
  "scripts/validate-stage-08.mjs",
  "scripts/validate-stage-09.mjs",
  "scripts/validate-stage-10.mjs",
  "scripts/validate-stage-11.mjs",
  "scripts/validate-stage-12.mjs",
  "scripts/validate-stage-13.mjs",
  "scripts/validate-stage-14.mjs",
  "scripts/validate-stage-15.mjs",
  "scripts/validate-stage-16.mjs",
  "scripts/validate-stage-17.mjs",
  "scripts/validate-stage-18.mjs",
  "scripts/validate-stage-19.mjs",
  "scripts/validate-stage-20.mjs",
  "scripts/validate-stage-21.mjs",
  "scripts/validate-stage-22.mjs",
  "scripts/validate-stage-23.mjs"
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
