import { type Env, getEnvConfig } from "./lib/env.js";
import { API_PATHS } from "./lib/constants.js";
import { checkCommentDuplicate } from "./lib/dedup.js";
import { ensureSession } from "./login.js";
import type { Tag } from "./post.js";

export interface CommentParams {
  email: string;
  password: string;
  postId: number;
  body: string;
  tags?: Tag[];
  env?: Env;
}

export interface CommentResult {
  success: boolean;
  message: string;
}

/** 태그를 머니스테이션 형식(﻿$종목﻿, ﻿#토픽﻿)으로 변환 */
function formatTagsInBody(body: string, tags: Tag[] = []): string {
  if (tags.length === 0) return body;

  const tagStr = tags
    .map((t) => {
      const char = t.type === "cash" ? "$" : "#";
      return `\uFEFF${char}${t.name}\uFEFF`;
    })
    .join(" ");

  return `${body}\n${tagStr}`;
}

export async function comment(params: CommentParams): Promise<CommentResult> {
  const { email, password, postId, body, tags = [], env = "rc" } = params;
  const config = getEnvConfig(env);

  const session = await ensureSession({ email, password, env });

  // 중복 체크 (같은 계정이 같은 내용의 댓글을 남겼는지)
  const dupCheck = await checkCommentDuplicate(session, postId, body);
  if (dupCheck.isDuplicate) {
    return { success: false, message: `중복 댓글: ${dupCheck.reason}` };
  }

  const url = `${config.apiUrl}${API_PATHS.writeComment}${postId}`;
  const commentBody = formatTagsInBody(body, tags);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-access-token": session.accessToken,
      },
      body: JSON.stringify({ sCommentContents: commentBody }),
    });

    const data = (await res.json()) as {
      rsStateCode?: number;
      rsMessage?: string;
    };

    if (data.rsStateCode === 200 || data.rsStateCode === 201) {
      return { success: true, message: "댓글 작성 완료" };
    }

    // 토큰 만료 → 재로그인 후 재시도
    if (data.rsStateCode === 403) {
      return await retryWithFreshSession(params);
    }

    return {
      success: false,
      message: `댓글 실패: ${data.rsMessage || "알 수 없는 오류"}`,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, message: `댓글 실패: ${msg}` };
  }
}

async function retryWithFreshSession(
  params: CommentParams,
): Promise<CommentResult> {
  const { email, password, postId, body, tags = [], env = "rc" } = params;
  const config = getEnvConfig(env);

  const { login: doLogin } = await import("./login.js");
  const loginResult = await doLogin({ email, password, env });

  if (!loginResult.success) {
    return { success: false, message: `재로그인 실패: ${loginResult.message}` };
  }

  const url = `${config.apiUrl}${API_PATHS.writeComment}${postId}`;
  const commentBody = formatTagsInBody(body, tags);

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-access-token": loginResult.accessToken,
    },
    body: JSON.stringify({ sCommentContents: commentBody }),
  });

  const data = (await res.json()) as {
    rsStateCode?: number;
    rsMessage?: string;
  };

  if (data.rsStateCode === 200 || data.rsStateCode === 201) {
    return { success: true, message: "댓글 작성 완료 (재로그인 후)" };
  }

  return {
    success: false,
    message: `댓글 실패: ${data.rsMessage || "알 수 없는 오류"}`,
  };
}
