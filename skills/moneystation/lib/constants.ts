/** CSS 셀렉터 */
export const SELECTORS = {
  // 로그인 페이지
  login: {
    emailInput: "#login_id",
    passwordInput: "#login_password",
  },

  // 포스팅 (메인 피드의 Quill 에디터)
  post: {
    editor: ".ql-editor[contenteditable='true']",
    mentionList: ".ql-mention-list li",
  },
} as const;

/** 글쓰기 영역 활성화 좌표 (메인 피드 상단 클릭) */
export const WRITE_AREA_CLICK = { x: 640, y: 160 } as const;

/** 타임아웃 (ms) */
export const TIMEOUTS = {
  navigation: 30_000,
  action: 10_000,
  mentionWait: 1_000,
} as const;

/** API 경로 */
export const API_PATHS = {
  getToken: "/api/m/getToken",
  writePost: "/api/p/write",
  writeComment: "/api/p/c/write/",
  writeReply: "/api/p/r/write/",
  readFeed: "/api/p/reads/all/all",
  readUserFeed: "/api/p/reads/user/",
  readComments: "/api/p/c/",
  readPost: "/api/p/read/",
} as const;
