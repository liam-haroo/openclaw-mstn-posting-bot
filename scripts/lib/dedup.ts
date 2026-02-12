import { type Env, getEnvConfig } from "./env.js";
import { API_PATHS } from "./constants.js";
import type { SessionData } from "./session-store.js";

/**
 * 포스팅 중복 체크.
 * 해당 계정의 최근 게시글에서 같은 소스 URL이거나 유사한 태그가 있으면 중복.
 */
export async function checkPostDuplicate(
  session: SessionData,
  sourceUrl: string | undefined,
  tags: Array<{ type: string; name: string }>,
): Promise<{ isDuplicate: boolean; reason?: string }> {
  const config = getEnvConfig(session.env);
  const url = `${config.apiUrl}${API_PATHS.readUserFeed}${session.userId}/0/50`;

  try {
    const res = await fetch(url, {
      headers: { "x-access-token": session.accessToken },
    });

    const data = (await res.json()) as {
      rsStateCode?: number;
      rsData?: Array<{
        post_id: number;
        sPostContents: string;
        arrCashTags?: Array<{ sCashName: string }>;
        arrTopicTags?: Array<{ sTopicName: string }>;
      }>;
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      for (const post of data.rsData) {
        // 1. 같은 소스 URL 체크
        if (sourceUrl && post.sPostContents.includes(sourceUrl)) {
          return { isDuplicate: true, reason: `이미 같은 출처로 포스팅됨 (postId: ${post.post_id})` };
        }

        // 2. 유사 태그 체크 (캐시태그/토픽태그가 절반 이상 겹치면 중복)
        if (tags.length > 0) {
          const postCashTags = (post.arrCashTags || []).map((t) => t.sCashName);
          const postTopicTags = (post.arrTopicTags || []).map((t) => t.sTopicName);
          const postTagSet = new Set([...postCashTags, ...postTopicTags]);

          const inputTagNames = tags.map((t) => t.name);
          const overlap = inputTagNames.filter((name) => postTagSet.has(name));

          if (overlap.length > 0 && overlap.length >= inputTagNames.length / 2) {
            return {
              isDuplicate: true,
              reason: `유사한 태그의 포스팅이 존재 (postId: ${post.post_id}, 겹치는 태그: ${overlap.join(", ")})`,
            };
          }
        }
      }
    }
  } catch {
    // API 실패 시 중복 체크를 건너뜀 (포스팅은 허용)
  }

  return { isDuplicate: false };
}

/**
 * 댓글 중복 체크.
 * 해당 게시글의 기존 댓글 중 같은 내용이 있으면 중복.
 */
export async function checkCommentDuplicate(
  session: SessionData,
  postId: number,
  body: string,
): Promise<{ isDuplicate: boolean; reason?: string }> {
  const config = getEnvConfig(session.env);
  const url = `${config.apiUrl}${API_PATHS.readComments}${postId}/0/100`;

  try {
    const res = await fetch(url, {
      headers: { "x-access-token": session.accessToken },
    });

    const data = (await res.json()) as {
      rsStateCode?: number;
      rsData?: Array<{
        comment_id: number;
        user_id: number;
        sCommentContents: string;
      }>;
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      // 같은 계정이 같은 내용의 댓글을 남겼는지 체크
      const normalizedBody = normalizeText(body);
      for (const comment of data.rsData) {
        if (
          comment.user_id === session.userId &&
          normalizeText(comment.sCommentContents) === normalizedBody
        ) {
          return {
            isDuplicate: true,
            reason: `이미 같은 내용의 댓글이 존재 (commentId: ${comment.comment_id})`,
          };
        }
      }
    }
  } catch {
    // API 실패 시 중복 체크를 건너뜀
  }

  return { isDuplicate: false };
}

/** FEFF 문자, 공백 정규화 등을 적용하여 텍스트를 비교용으로 정리한다. */
function normalizeText(text: string): string {
  return text
    .replace(/\uFEFF/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
