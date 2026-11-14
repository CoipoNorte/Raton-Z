import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1100, height: 760 },
    launchOptions: {
      args: [
        "--no-sandbox",
        "--use-angle=gl",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
      ],
    },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "npm run dev -- --host 0.0.0.0 --port 5173",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 60000,
  },
});
