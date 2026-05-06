import path from "path";
import dotenv from "dotenv";
import ngrok from "@ngrok/ngrok";

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env"), override: true });

const port = Number(process.env.PORT || 3000);
const authtoken = process.env.NGROK_AUTHTOKEN;
const configuredDomain = process.env.NGROK_DOMAIN || process.env.PUBLIC_URL || "";
const domain = configuredDomain.replace(/^https?:\/\//, "").replace(/\/+$/, "");
const maxAttempts = Number(process.env.NGROK_MAX_ATTEMPTS || 5);
const retryDelayMs = Number(process.env.NGROK_RETRY_DELAY_MS || 3000);
let activeListener: Awaited<ReturnType<typeof ngrok.forward>> | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function isTransientNgrokError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();

  return [
    "failed to establish tcp connection",
    "failed to connect session",
    "econnreset",
    "etimedout",
    "enotfound",
    "eai_again",
    "network"
  ].some((text) => message.includes(text));
}

function validateConfig() {
  if (!authtoken) {
    throw new Error("NGROK_AUTHTOKEN is required in the root .env file");
  }

  if (!domain) {
    throw new Error("NGROK_DOMAIN is required in the root .env file");
  }

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`PORT must be a valid positive number. Received: ${process.env.PORT}`);
  }
}

async function startTunnel() {
  validateConfig();

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      console.log(
        `Starting ngrok tunnel for ${domain} -> http://localhost:${port} (attempt ${attempt}/${maxAttempts})`
      );

      activeListener = await ngrok.forward({
        addr: `localhost:${port}`,
        authtoken,
        domain
      });

      console.log(`Ngrok tunnel connected: ${activeListener.url()}`);
      console.log(`Forwarding ${activeListener.url()} -> http://localhost:${port}`);
      console.log("Keep this terminal open while Twilio is using the webhook.");

      heartbeatTimer = setInterval(() => {
        console.log(`Ngrok tunnel still running: ${activeListener?.url()} -> http://localhost:${port}`);
      }, 60000);

      process.stdin.resume();
      return;
    } catch (error) {
      const message = getErrorMessage(error);
      const canRetry = attempt < maxAttempts && isTransientNgrokError(error);

      console.error(`Ngrok attempt ${attempt} failed: ${message}`);

      if (!canRetry) {
        throw error;
      }

      console.log(`Retrying in ${Math.round(retryDelayMs / 1000)} seconds...`);
      await sleep(retryDelayMs);
    }
  }
}

process.on("SIGINT", async () => {
  console.log("Closing ngrok tunnel...");
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
  }
  await activeListener?.close().catch(() => undefined);
  process.exit(0);
});

startTunnel().catch((error) => {
  console.error("Failed to start ngrok tunnel.");
  console.error(`Reason: ${getErrorMessage(error)}`);
  console.error("Check your internet connection, firewall/VPN, NGROK_AUTHTOKEN, and NGROK_DOMAIN.");
  process.exit(1);
});
