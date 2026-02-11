import { type Env, getEnvConfig } from "./lib/env.js";
import { SELECTORS, TIMEOUTS } from "./lib/constants.js";
import { createContext, openPage, closeBrowser } from "./lib/browser-manager.js";
import { loadSession, saveSession, type SessionData } from "./lib/session-store.js";

export interface LoginParams {
  email: string;
  password: string;
  env?: Env;
}

export interface LoginResult {
  success: boolean;
  accessToken: string;
  message: string;
}

export async function login(params: LoginParams): Promise<LoginResult> {
  const { email, password, env = "rc" } = params;
  const config = getEnvConfig(env);

  // 기존 세션 확인
  const existing = await loadSession(email, env);
  if (existing) {
    return {
      success: true,
      accessToken: existing.accessToken,
      message: "기존 세션을 재사용합니다.",
    };
  }

  // Playwright로 로그인
  const context = await createContext();
  try {
    const page = await openPage(context, `${config.siteUrl}/login`);

    // 이메일 입력
    await page.fill(SELECTORS.login.emailInput, email);
    // 비밀번호 입력
    await page.fill(SELECTORS.login.passwordInput, password);
    // 로그인 버튼 클릭 (form 내 div text "로그인")
    await page.locator("form div").filter({ hasText: /^로그인$/ }).last().click();

    // 메인 페이지로 이동 대기
    await page.waitForURL("**/main**", { timeout: TIMEOUTS.navigation });

    // localStorage에서 accessToken 추출
    const accessToken = await page.evaluate((tokenKey: string) => {
      return localStorage.getItem(tokenKey) || "";
    }, config.tokenKey);

    if (!accessToken) {
      return {
        success: false,
        accessToken: "",
        message: "로그인 후 accessToken을 찾을 수 없습니다.",
      };
    }

    // JWT에서 userId 추출
    const userId = parseUserId(accessToken);

    // storageState 저장
    const storageState = await context.storageState();

    // 세션 저장
    await saveSession({
      email,
      env,
      userId,
      accessToken,
      storageState,
      savedAt: Date.now(),
    });

    return {
      success: true,
      accessToken,
      message: "로그인 성공",
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    if (msg.includes("waitForURL") || msg.includes("Timeout")) {
      return {
        success: false,
        accessToken: "",
        message: "이메일 또는 비밀번호를 확인하세요.",
      };
    }
    if (msg.includes("locator") || msg.includes("selector")) {
      return {
        success: false,
        accessToken: "",
        message: "사이트 UI가 변경되었을 수 있습니다.",
      };
    }

    return {
      success: false,
      accessToken: "",
      message: `로그인 실패: ${msg}`,
    };
  } finally {
    await context.close();
  }
}

/** JWT payload에서 user_id를 추출한다. */
function parseUserId(token: string): number {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    return payload.user_id ?? 0;
  } catch {
    return 0;
  }
}

/**
 * 세션이 있으면 반환, 없으면 로그인 후 반환.
 * post/comment 등에서 내부적으로 사용.
 */
export async function ensureSession(params: LoginParams): Promise<SessionData> {
  const { email, password, env = "rc" } = params;

  const existing = await loadSession(email, env);
  if (existing) return existing;

  const result = await login({ email, password, env });
  if (!result.success) {
    throw new Error(result.message);
  }

  const session = await loadSession(email, env);
  if (!session) {
    throw new Error("로그인 후 세션을 찾을 수 없습니다.");
  }
  return session;
}
