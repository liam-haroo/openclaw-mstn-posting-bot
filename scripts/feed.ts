import { type Env, getEnvConfig } from "./lib/env.js";
import { API_PATHS } from "./lib/constants.js";
import { ensureSession } from "./login.js";

export interface ReadFeedParams {
  email: string;
  password: string;
  offset?: number;
  limit?: number;
  env?: Env;
}

export interface FeedPost {
  postId: number;
  userId: number;
  nickname: string;
  username: string;
  content: string;
  cashTags: string[];
  topicTags: string[];
  likeCount: number;
  commentCount: number;
}

export interface ReadFeedResult {
  success: boolean;
  posts: FeedPost[];
  message: string;
}

export interface ReadPostParams {
  email: string;
  password: string;
  postId: number;
  env?: Env;
}

export interface ReadPostResult {
  success: boolean;
  post: FeedPost | null;
  message: string;
}

export async function readPost(params: ReadPostParams): Promise<ReadPostResult> {
  const { email, password, postId, env = "rc" } = params;
  const config = getEnvConfig(env);

  const session = await ensureSession({ email, password, env });

  const url = `${config.apiUrl}${API_PATHS.readPost}${postId}`;

  try {
    const res = await fetch(url, {
      headers: {
        "x-access-token": session.accessToken,
      },
    });

    const data = (await res.json()) as {
      rsStateCode?: number;
      rsData?: {
        post_id: number;
        user_id: number;
        sNickName: string;
        sUserName: string;
        sPostContents: string;
        arrCashTags?: Array<{ cash_id: number; sCashName: string }>;
        arrTopicTags?: Array<{ topic_id: number; sTopicName: string }>;
        iLikeCount: number;
        iCommentCount: number;
      };
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      const p = data.rsData;
      const post: FeedPost = {
        postId: p.post_id,
        userId: p.user_id,
        nickname: p.sNickName,
        username: p.sUserName,
        content: p.sPostContents,
        cashTags: (p.arrCashTags || []).map((t) => t.sCashName),
        topicTags: (p.arrTopicTags || []).map((t) => t.sTopicName),
        likeCount: p.iLikeCount,
        commentCount: p.iCommentCount,
      };

      return { success: true, post, message: "게시글 조회 완료" };
    }

    return { success: false, post: null, message: "게시글 조회 실패" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, post: null, message: `게시글 조회 실패: ${msg}` };
  }
}

export async function readFeed(params: ReadFeedParams): Promise<ReadFeedResult> {
  const { email, password, offset = 0, limit = 20, env = "rc" } = params;
  const config = getEnvConfig(env);

  const session = await ensureSession({ email, password, env });

  const url = `${config.apiUrl}${API_PATHS.readFeed}/${offset}/${limit}`;

  try {
    const res = await fetch(url, {
      headers: {
        "x-access-token": session.accessToken,
      },
    });

    const data = (await res.json()) as {
      rsStateCode?: number;
      rsData?: Array<{
        post_id: number;
        user_id: number;
        sNickName: string;
        sUserName: string;
        sPostContents: string;
        arrCashTags?: Array<{ cash_id: number; sCashName: string }>;
        arrTopicTags?: Array<{ topic_id: number; sTopicName: string }>;
        iLikeCount: number;
        iCommentCount: number;
      }>;
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      const posts: FeedPost[] = data.rsData.map((p) => ({
        postId: p.post_id,
        userId: p.user_id,
        nickname: p.sNickName,
        username: p.sUserName,
        content: p.sPostContents,
        cashTags: (p.arrCashTags || []).map((t) => t.sCashName),
        topicTags: (p.arrTopicTags || []).map((t) => t.sTopicName),
        likeCount: p.iLikeCount,
        commentCount: p.iCommentCount,
      }));

      return { success: true, posts, message: `${posts.length}개 게시글 조회` };
    }

    return { success: false, posts: [], message: "피드 조회 실패" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, posts: [], message: `피드 조회 실패: ${msg}` };
  }
}
