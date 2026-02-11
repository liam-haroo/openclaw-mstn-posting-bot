import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Env } from "./env.js";

export interface SessionData {
  email: string;
  env: Env;
  userId: number;
  accessToken: string;
  storageState: object;
  savedAt: number;
}

const SESSION_DIR = join(homedir(), ".openclaw", "sessions", "moneystation");
const SESSION_TTL_MS = 3 * 60 * 60 * 1000; // 3시간

function sessionPath(email: string, env: Env): string {
  const hash = createHash("sha256").update(`${env}:${email}`).digest("hex").slice(0, 16);
  return join(SESSION_DIR, `${hash}.json`);
}

export async function loadSession(email: string, env: Env): Promise<SessionData | null> {
  try {
    const raw = await readFile(sessionPath(email, env), "utf-8");
    const data: SessionData = JSON.parse(raw);

    if (Date.now() - data.savedAt > SESSION_TTL_MS) {
      return null; // 만료
    }
    return data;
  } catch {
    return null;
  }
}

export async function saveSession(data: SessionData): Promise<void> {
  await mkdir(SESSION_DIR, { recursive: true });
  const path = sessionPath(data.email, data.env);
  await writeFile(path, JSON.stringify(data, null, 2), "utf-8");
}
