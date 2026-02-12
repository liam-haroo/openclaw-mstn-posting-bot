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

export interface PostLink {
  url: string;
  title?: string;
  description?: string;
  imageUrl?: string;
}

export interface PostMedia {
  images: string[];
  links: PostLink[];
  youtube: string[];
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
  media?: PostMedia;
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
  rawFields?: Record<string, unknown>;
  message: string;
}

/** API 응답 필드에서 미디어 정보 추출 */
function extractMedia(raw: Record<string, unknown>): PostMedia {
  const images: string[] = [];
  const links: PostLink[] = [];
  const youtube: string[] = [];

  // sPostImage: 쉼표 구분 이미지 URL
  const postImage = raw.sPostImage as string | undefined;
  if (postImage) {
    for (const url of postImage.split(",")) {
      const trimmed = url.trim();
      if (trimmed) images.push(trimmed);
    }
  }

  // objPostLink: 링크 프리뷰 메타데이터
  const link = raw.objPostLink as Record<string, unknown> | undefined;
  if (link?.sLinkURL) {
    const linkUrl = link.sLinkURL as string;
    if (isYoutubeUrl(linkUrl)) {
      youtube.push(linkUrl);
    } else {
      links.push({
        url: linkUrl,
        title: (link.sLinkTitle as string) || undefined,
        description: (link.sLinkDescription as string) || undefined,
        imageUrl: (link.sLinkImageURL as string) || undefined,
      });
    }
  }

  // sPostContents 내 bare 유튜브 URL
  const content = (raw.sPostContents as string) || "";
  const ytRe = /https?:\/\/(?:www\.)?(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = ytRe.exec(content)) !== null) {
    if (!youtube.includes(m[0])) {
      youtube.push(m[0]);
    }
  }

  return { images, links, youtube };
}

function isYoutubeUrl(url: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(url);
}

/** rsData가 배열이면 첫 번째 요소, 객체면 그대로 반환 */
function resolvePostData(rsData: unknown): Record<string, unknown> | null {
  if (Array.isArray(rsData)) {
    return rsData.length > 0 ? (rsData[0] as Record<string, unknown>) : null;
  }
  if (rsData && typeof rsData === "object" && "post_id" in rsData) {
    return rsData as Record<string, unknown>;
  }
  return null;
}

function buildFeedPost(p: Record<string, unknown>, media?: PostMedia): FeedPost {
  const hasMedia = media && (media.images.length || media.links.length || media.youtube.length);
  return {
    postId: p.post_id as number,
    userId: p.user_id as number,
    nickname: (p.sNickName as string) || "",
    username: (p.sUserName as string) || "",
    content: (p.sPostContents as string) || "",
    cashTags: ((p.arrCashTags as Array<{ sCashName: string }>) || []).map((t) => t.sCashName),
    topicTags: ((p.arrTopicTags as Array<{ sTopicName: string }>) || []).map((t) => t.sTopicName),
    likeCount: (p.iLikeCount as number) || 0,
    commentCount: (p.iCommentCount as number) || 0,
    ...(hasMedia ? { media } : {}),
  };
}

const KNOWN_POST_KEYS = new Set([
  "post_id", "user_id", "sNickName", "sUserName", "sPostContents",
  "arrCashTags", "arrTopicTags", "iLikeCount", "iCommentCount",
  "sPostImage", "objPostLink",
]);

function extractRawFields(p: Record<string, unknown>): Record<string, unknown> | undefined {
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (!KNOWN_POST_KEYS.has(k) && v !== null && v !== undefined && v !== "") {
      extra[k] = v;
    }
  }
  return Object.keys(extra).length > 0 ? extra : undefined;
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
      rsData?: unknown;
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      const p = resolvePostData(data.rsData);
      if (!p) {
        return { success: false, post: null, message: "게시글 데이터 형식 불일치" };
      }

      const media = extractMedia(p);
      const post = buildFeedPost(p, media);
      const rawFields = extractRawFields(p);

      return { success: true, post, rawFields, message: "게시글 조회 완료" };
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
      rsData?: Array<Record<string, unknown>>;
    };

    if ((data.rsStateCode === 200 || data.rsStateCode === 201) && data.rsData) {
      const posts: FeedPost[] = data.rsData.map((p) => {
        const media = extractMedia(p);
        return buildFeedPost(p, media);
      });

      return { success: true, posts, message: `${posts.length}개 게시글 조회` };
    }

    return { success: false, posts: [], message: "피드 조회 실패" };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, posts: [], message: `피드 조회 실패: ${msg}` };
  }
}
