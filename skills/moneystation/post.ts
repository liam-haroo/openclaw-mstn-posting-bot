import type { Page } from "playwright";
import { type Env, getEnvConfig } from "./lib/env.js";
import { SELECTORS, TIMEOUTS, WRITE_AREA_CLICK } from "./lib/constants.js";
import { createContext, openPage } from "./lib/browser-manager.js";
import { checkPostDuplicate } from "./lib/dedup.js";
import { ensureSession } from "./login.js";

export type PostSource =
  | { url: string }
  | { ticker: string }
  | { topic: string };

/** 캐시태그($종목) 또는 해시태그(#토픽) */
export interface Tag {
  type: "cash" | "topic";
  name: string;
}

export interface PostParams {
  email: string;
  password: string;
  content: string;
  tags?: Tag[];
  source?: PostSource;
  env?: Env;
}

export interface PostResult {
  success: boolean;
  postId?: number;
  message: string;
}

export async function post(params: PostParams): Promise<PostResult> {
  const { email, password, content, tags = [], source, env = "rc" } = params;
  const config = getEnvConfig(env);

  // 세션 확보 (없으면 자동 로그인)
  const session = await ensureSession({ email, password, env });

  // 중복 체크 (같은 소스 URL 또는 유사 태그)
  const sourceUrl = source && "url" in source ? source.url : undefined;
  const dupCheck = await checkPostDuplicate(session, sourceUrl, tags);
  if (dupCheck.isDuplicate) {
    return { success: false, message: `중복 포스팅: ${dupCheck.reason}` };
  }

  // 포스팅 본문 구성 (source는 출처 표시용 메타데이터)
  const body = buildBody(content, source);

  // Playwright로 포스팅
  const context = await createContext(session);
  try {
    const page = await openPage(context, `${config.siteUrl}/main`);
    await page.waitForTimeout(2000);

    // 글쓰기 영역 클릭하여 에디터 활성화
    await page.mouse.click(WRITE_AREA_CLICK.x, WRITE_AREA_CLICK.y);
    await page.waitForTimeout(1000);

    const editor = page.locator(SELECTORS.post.editor).first();
    await editor.waitFor({ state: "visible", timeout: TIMEOUTS.action });
    await editor.click();
    await page.waitForTimeout(300);

    // 본문 텍스트 입력
    await page.keyboard.type(body, { delay: 10 });

    // 태그 입력 (캐시태그 $, 해시태그 #)
    for (const tag of tags) {
      await page.keyboard.type(" ");
      await insertTag(page, tag);
    }

    // 포스트 버튼 클릭
    const stage1Btn = page.locator("#stage1_content").getByText("포스트", { exact: true });
    const normalBtn = page.getByText("포스트", { exact: true }).first();
    if (await stage1Btn.isVisible().catch(() => false)) {
      await stage1Btn.click();
    } else {
      await normalBtn.click();
    }

    // API 응답 대기
    const response = await page.waitForResponse(
      (res) => res.url().includes("/api/p/write") && res.status() === 200,
      { timeout: TIMEOUTS.action },
    ).catch(() => null);

    if (response) {
      const data = await response.json() as {
        rsStateCode?: number;
        rsData?: { post_id?: number };
      };
      if (data.rsStateCode === 200) {
        return {
          success: true,
          postId: data.rsData?.post_id,
          message: "포스팅 완료",
        };
      }
    }

    return { success: true, message: "포스팅 요청 완료 (응답 미확인)" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `포스팅 실패: ${msg}` };
  } finally {
    await context.close();
  }
}

/**
 * Quill 에디터에 캐시태그($) 또는 해시태그(#)를 자동완성으로 삽입한다.
 */
async function insertTag(page: Page, tag: Tag): Promise<void> {
  const denotation = tag.type === "cash" ? "$" : "#";

  // 기호 입력 → 자동완성 팝업 대기
  await page.keyboard.type(denotation, { delay: 100 });
  await page.waitForTimeout(TIMEOUTS.mentionWait);

  // 태그명 입력
  await page.keyboard.type(tag.name, { delay: 30 });
  await page.waitForTimeout(TIMEOUTS.mentionWait);

  // 자동완성 팝업에서 첫 항목 선택
  const item = page.locator(SELECTORS.post.mentionList).first();
  if (await item.isVisible().catch(() => false)) {
    await item.click();
    await page.waitForTimeout(300);
  }
}

/** content + source 출처 표시를 합쳐 최종 본문을 구성한다. */
function buildBody(content: string, source?: PostSource): string {
  if (!source) return content;
  if ("url" in source) return `${content}\n\n출처: ${source.url}`;
  return content;
}
