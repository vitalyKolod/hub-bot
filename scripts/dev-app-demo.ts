import { spawn } from "node:child_process";
import { createDemo } from "./api-demo.js";
const apiPort = Number(process.env.API_PORT || 3001);
const webPort = Number(process.env.WEB_PORT || 3000);
const demo = await createDemo(apiPort, true);
const web = spawn(
  "npm",
  ["--prefix", "web", "run", "dev", "--", "--port", String(webPort)],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NEXT_PUBLIC_ALLOW_DEV_AUTH: "true",
      NEXT_PUBLIC_DEV_AUTH_USER_ID: "1001",
      API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
    },
    stdio: "inherit",
  },
);
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  web.kill("SIGTERM");
  await demo.close();
  process.exit(code);
}
web.on("exit", (code) => {
  if (!stopping) void stop(code || 0);
});
web.on("error", () => void stop(1));
process.once("SIGINT", () => void stop());
process.once("SIGTERM", () => void stop());
console.log(`HUB mobile app demo: http://localhost:${webPort}`);
console.log(
  "Temporary MongoDB + simulated Telegram. Use the demo switch to open the administrator view.",
);
