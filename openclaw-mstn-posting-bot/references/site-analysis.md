# 머니스테이션 사이트 분석 및 구현 상세

스킬 코드 수정/디버깅 시 참조하는 상세 문서.

---

## API 엔드포인트

| 기능 | Method | Path | 비고 |
|------|--------|------|------|
| 토큰 발급 | GET | `/api/m/getToken` | 익명 시 user_id=0 |
| 피드 조회 (전체) | GET | `/api/p/reads/all/all/{offset}/{limit}` | |
| 피드 조회 (유저별) | GET | `/api/p/reads/user/{userId}/{offset}/{limit}` | 중복 체크용 |
| 게시글 상세 | GET | `/api/p/read/{postId}` | |
| 포스트 작성 | POST | `/api/p/write` | Playwright가 내부적으로 호출 |
| 댓글 조회 | GET | `/api/p/c/{postId}/{offset}/{limit}` | 중복 체크용 |
| 댓글 작성 | POST | `/api/p/c/write/{postId}` | accessToken 필요 |
| 답글 작성 | POST | `/api/p/r/write/{postId}` | |

- 인증 헤더: `x-access-token: {JWT}`
- 성공 응답: `rsStateCode` 200 또는 201

---

## 로그인 페이지 (`/login`)

| 요소 | 셀렉터 |
|------|--------|
| 이메일/유저네임 입력 | `#login_id` (name: `nicknameOrEmail`) |
| 비밀번호 입력 | `#login_password` |
| 로그인 버튼 | `form` 내 마지막 `div` (text: "로그인") — `<button>`이 아닌 `<div>` |

---

## 포스팅 (메인 피드 `/main`)

- **글쓰기 영역**: 피드 상단 플레이스홀더 ("투자 아이디어를 공유해주세요") 클릭으로 에디터 활성화
- **에디터**: Quill (`div.ql-editor[contenteditable="true"]`)
- **자동완성**: `$`/`#` 입력 시 `.ql-mention-list-container` 팝업
- **포스트 버튼**: `#stage1_content` 내 또는 피드 상단의 "포스트" `<div>`
- 별도 제목 필드 없음 (SNS 형태, 본문만)
- 이미지 첨부: `input[type="file"][accept="image/*"]`

### 삽입된 태그 HTML

```html
<span class="mention" data-denotation-char="$" data-id="370" data-value="삼성전자" data-type="cash">
  ﻿<span contenteditable="false"><span class="ql-mention-denotation-char">$</span>삼성전자</span>
</span>
```

### API에서의 태그 형식

저장 시 태그는 FEFF(zero-width no-break space)로 감싸짐:
```
﻿$삼성전자﻿ ﻿#원전시공역량
```

---

## localStorage

| 키 | 용도 |
|----|------|
| `dev_access_token` | RC 환경 JWT 토큰 |
| `access_token` | Live 환경 JWT 토큰 (추정) |

---

## JWT 토큰 payload

```json
{
  "user_id": 121,
  "sUserName": "dev",
  "sEmail": "dev@moneystation.net",
  "sDeviceInfo": "",
  "iat": 1770809858,
  "exp": 1857209858
}
```

---

## 데이터 구조

### 댓글 (`/api/p/c/{postId}` 응답)

```json
{
  "comment_id": 2060,
  "user_id": 121,
  "sNickName": "dev__",
  "sCommentContents": "자동화 테스트 댓글입니다.",
  "arrCashTags": [],
  "arrTopicTags": [],
  "iLikeCount": 0,
  "iReplyCount": 0,
  "createdAt": "2026-02-11T10:43:02.000Z"
}
```

### 게시글 (피드 API 응답)

```json
{
  "post_id": 57741,
  "user_id": 121,
  "sNickName": "dev__",
  "sUserName": "dev",
  "sPostContents": "본문 ﻿$삼성전자﻿ ﻿#테스트﻿",
  "arrCashTags": [{ "cash_id": 370, "sCashName": "삼성전자" }],
  "arrTopicTags": [{ "topic_id": 773, "sTopicName": "테스트" }],
  "iLikeCount": 0,
  "iCommentCount": 0
}
```

---

## TypeScript 인터페이스

```ts
// lib/env.ts
type Env = "rc" | "live";
interface EnvConfig { siteUrl: string; apiUrl: string; tokenKey: string; }

// lib/session-store.ts
interface SessionData {
  email: string;
  env: Env;
  userId: number;            // JWT에서 추출 (user_id)
  accessToken: string;
  storageState: object;     // Playwright storageState (cookies + localStorage)
  savedAt: number;           // Date.now() — TTL 판단용
}

// post.ts
type PostSource = { url: string } | { ticker: string } | { topic: string };
interface Tag { type: "cash" | "topic"; name: string; }

// login.ts
interface LoginParams  { email: string; password: string; env?: Env; }
interface LoginResult  { success: boolean; accessToken: string; message: string; }

// post.ts
interface PostParams   { email: string; password: string; content: string; tags?: Tag[]; source?: PostSource; env?: Env; }
interface PostResult   { success: boolean; postId?: number; message: string; }

// comment.ts
interface CommentParams { email: string; password: string; postId: number; body: string; tags?: Tag[]; env?: Env; }
interface CommentResult { success: boolean; message: string; }

// feed.ts
interface ReadFeedParams  { email: string; password: string; offset?: number; limit?: number; env?: Env; }
interface ReadFeedResult  { success: boolean; posts: FeedPost[]; message: string; }
interface FeedPost {
  postId: number; userId: number; nickname: string; username: string;
  content: string; cashTags: string[]; topicTags: string[];
  likeCount: number; commentCount: number;
}
```

---

## 모듈별 역할

| 파일 | export | 역할 |
|------|--------|------|
| `lib/env.ts` | `Env`, `getEnvConfig()` | 환경별 siteUrl, apiUrl, tokenKey 반환 |
| `lib/constants.ts` | `SELECTORS`, `WRITE_AREA_CLICK`, `TIMEOUTS`, `API_PATHS` | CSS 셀렉터, 좌표, 타임아웃, API 경로 상수 |
| `lib/browser-manager.ts` | `launchBrowser()`, `createContext()`, `openPage()`, `closeBrowser()` | Playwright Chromium 인스턴스 관리 (headless, 1280×900, ko-KR) |
| `lib/session-store.ts` | `SessionData`, `loadSession()`, `saveSession()` | 파일 기반 세션 저장 — `~/.openclaw/sessions/moneystation/<sha256>.json`, TTL 3시간 |
| `lib/dedup.ts` | `checkPostDuplicate()`, `checkCommentDuplicate()` | 유저별 피드/댓글 조회 → 소스 URL·태그·텍스트 비교로 중복 감지 |
| `login.ts` | `login()`, `ensureSession()` | Playwright 폼 로그인 → JWT에서 userId 추출 → 세션 저장 |
| `post.ts` | `post()`, `Tag`, `PostSource` | 중복 체크 → `buildBody()`로 본문+출처 구성 → Playwright 태그 자동완성 삽입 |
| `comment.ts` | `comment()` | 중복 체크 → fetch API로 댓글 작성, 태그는 FEFF 형식, 403 시 재로그인 후 재시도 |
| `feed.ts` | `readFeed()`, `FeedPost` | fetch API로 피드 조회 — 게시글 내용·태그·작성자 등 구조화 반환 |
| `index.ts` | 모든 스킬 + 타입 re-export | `login`, `post`, `comment`, `readFeed` 함수 + `Tag`, `FeedPost`, `Env` 등 타입 |
| `cli.ts` | CLI 엔트리포인트 | `process.argv` 파싱 → 해당 함수 호출 → JSON stdout 출력 |

---

## Playwright 구현 디테일

### 로그인 (`login.ts`)

```ts
// 1. 이메일/비밀번호 입력
await page.fill("#login_id", email);
await page.fill("#login_password", password);

// 2. 로그인 버튼 — <button>이 아닌 <div>
await page.locator("form div").filter({ hasText: /^로그인$/ }).last().click();

// 3. 메인 페이지 이동 대기 → localStorage에서 토큰 추출
await page.waitForURL("**/main**", { timeout: 30000 });
const accessToken = await page.evaluate(
  (key: string) => localStorage.getItem(key) || "", config.tokenKey
);

// 4. JWT에서 userId 추출
const userId = parseUserId(accessToken);  // Buffer.from(payload, "base64") → user_id

// 5. storageState + accessToken + userId를 세션 파일로 저장
const storageState = await context.storageState();
await saveSession({ email, env, userId, accessToken, storageState, savedAt: Date.now() });
```

### 포스팅 (`post.ts`)

```ts
// 1. 저장된 storageState로 브라우저 컨텍스트 복원
const context = await createContext(session);
const page = await openPage(context, `${config.siteUrl}/main`);

// 2. 글쓰기 영역 좌표 클릭으로 Quill 에디터 활성화
await page.mouse.click(640, 160);  // WRITE_AREA_CLICK

// 3. 에디터 가시성 확인 후 본문 입력
const editor = page.locator(".ql-editor[contenteditable='true']").first();
await editor.waitFor({ state: "visible", timeout: 10000 });
await page.keyboard.type(body, { delay: 10 });

// 4. 태그 삽입: insertTag() — 기호 입력 → 자동완성 팝업 → 첫 항목 클릭
for (const tag of tags) {
  const denotation = tag.type === "cash" ? "$" : "#";
  await page.keyboard.type(denotation, { delay: 100 });
  await page.keyboard.type(tag.name, { delay: 30 });
  await page.locator(".ql-mention-list li").first().click();
}

// 5. 포스트 버튼 클릭 (stage1_content 내부 우선, 없으면 first() 폴백)
const stage1Btn = page.locator("#stage1_content").getByText("포스트", { exact: true });
if (await stage1Btn.isVisible().catch(() => false)) await stage1Btn.click();
else await page.getByText("포스트", { exact: true }).first().click();

// 6. /api/p/write 응답에서 postId 확인
const response = await page.waitForResponse(
  (res) => res.url().includes("/api/p/write") && res.status() === 200
);
```

### 댓글 (`comment.ts`)

```ts
// 1. 태그를 FEFF로 감싸서 본문에 추가
const tagStr = tags.map(t => `\uFEFF${t.type === "cash" ? "$" : "#"}${t.name}\uFEFF`).join(" ");
const commentBody = `${body}\n${tagStr}`;

// 2. fetch API 직접 호출
const res = await fetch(`${config.apiUrl}/api/p/c/write/${postId}`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "x-access-token": session.accessToken },
  body: JSON.stringify({ sCommentContents: commentBody }),
});

// 3. 403 응답 시 → 재로그인 후 새 accessToken으로 재시도
if (data.rsStateCode === 403) return await retryWithFreshSession(params);
```

---

## 의존성

- `playwright` `^1.58.2` — 브라우저 자동화 (로그인, 포스팅)
- `tsx` — TypeScript 직접 실행 (`npx tsx scripts/cli.ts`)
- `typescript` `^5.9.3`, `@types/node` `^22.19.11` — 개발 의존성

---

## RC 환경 검증 결과

1. `npx tsc --noEmit` — 타입 체크 통과
2. `dev/1234` 로그인 → accessToken 정상 발급 (`dev_access_token`)
3. 포스팅 (본문 + $삼성전자 캐시태그 + #테스트 해시태그) → `rsStateCode: 200`, postId: 57741
4. 댓글 API (`POST /api/p/c/write/57741`) → `rsStateCode: 200`, `writeComment Success`
5. 피드 조회 (`GET /api/p/reads/all/all/0/5`) → `rsStateCode: 201`, 5개 게시글 정상 반환
