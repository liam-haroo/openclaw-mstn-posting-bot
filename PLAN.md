# OpenClaw Skills - 머니스테이션(MoneyStation)

OpenClaw에서 사용할 머니스테이션 자동화 스킬 모음.
타인에게 배포되는 스킬 패키지이며, 호출마다 다른 계정이 사용될 수 있다.

> **머니스테이션**은 증권정보 SNS 플랫폼이다.
> 포스팅/댓글은 금융·경제·투자 관련 주제 위주로 작성하며, 이와 무관한 내용은 작성하지 않는다.

---

## 프로젝트 구조

```
claw-bot-mstn/
├── PLAN.md
├── package.json
├── tsconfig.json
├── .gitignore
└── skills/
    └── moneystation/
        ├── skill.json              # 스킬 패키지 메타 (이름, 버전, 설명)
        ├── index.ts                # 스킬 진입점 (login, post, comment, readFeed export)
        ├── login.ts                # 스킬: 로그인 + ensureSession 헬퍼
        ├── post.ts                 # 스킬: 포스팅 (캐시태그/해시태그 포함)
        ├── comment.ts              # 스킬: 댓글 (캐시태그/해시태그 포함)
        ├── feed.ts                 # 스킬: 피드 조회 (게시글 목록 + 내용)
        └── lib/                    # 스킬 내부 공유 모듈
            ├── browser-manager.ts  # Playwright 인스턴스 관리
            ├── session-store.ts    # 계정별 세션/토큰 저장 (userId 포함)
            ├── dedup.ts            # 중복 포스팅/댓글 체크
            ├── env.ts              # RC/Live 환경 설정
            └── constants.ts        # 셀렉터, 타임아웃, API 경로
```

---

## 대상 사이트

| 환경 | 프론트엔드 | API | 용도 |
|------|-----------|-----|------|
| **RC** (기본) | `https://dev2.moneystation.kr` | `https://api-dev.moneystation.kr` | 테스트/개발 |
| **Live** | `https://www.moneystation.net` | `https://api.moneystation.net` (추정) | 실제 서비스 |

`env` 파라미터를 생략하면 **RC**가 기본값. 배포 시 Live로 전환.

---

## 태그 시스템

머니스테이션의 포스팅/댓글에서 사용하는 태그 기능.

| 태그 유형 | 기호 | 용도 | 예시 |
|----------|------|------|------|
| **캐시태그** | `$` | 종목(주식) 언급 | `$삼성전자`, `$KODEXK원자력SMR` |
| **해시태그** | `#` | 토픽(주제) 언급 | `#원전시공역량`, `#SMR`, `#에너지안보` |

### Quill 에디터의 태그 동작

1. `$` 또는 `#` 입력 시 자동완성 팝업 표시
2. 종목명/토픽명 입력하면 검색 결과 팝업
3. 항목 선택 시 mention `<span>` 으로 삽입

**삽입된 태그 HTML:**
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

### 포스팅 예시 (태그 포함)

```
원전 시장에서 한국이 왜 1등 대우를 받을까요?
...본문...
﻿$KODEXK원자력SMR﻿ ﻿$현대건설﻿ ﻿$두산에너빌리티
﻿#원전시공역량﻿ ﻿#K원전﻿ ﻿#SMR﻿ ﻿#에너지안보
```

---

## 설계 원칙

**에이전트 오케스트레이션 (A안)**

콘텐츠 생성은 에이전트(LLM)의 역할이고, 스킬은 머니스테이션 조작에 집중한다.

- 스킬은 **실행**만 담당 (로그인, 포스팅, 댓글, 피드 조회)
- 에이전트가 **판단**을 담당 (어떤 내용을 쓸지, 어떤 태그를 붙일지)
- `source` 필드는 콘텐츠를 대체하지 않고, 출처 표시용 메타데이터로만 사용

**소스 기반 포스팅 워크플로우:**
```
사용자: "네이버 증권 뉴스에서 적당한 주제 잡아서 포스팅해줘"
1. 에이전트가 소스 URL 방문 → 기사 목록 파악
2. 에이전트가 기사 선택 → 내용 분석
3. 에이전트가 머니스테이션용 포스팅 콘텐츠 작성 (LLM)
4. 에이전트가 관련 종목/토픽 태그 결정
5. skills.post({ content, tags, source: { url: articleUrl } })
```

**댓글 작성 워크플로우:**
```
1. skills.readFeed() → 게시글 목록 + 내용 조회
2. 에이전트가 게시글 내용을 읽고 맥락에 맞는 댓글 생성 (LLM)
3. skills.comment({ postId, body, tags })
```

> 댓글은 대상 게시글의 내용에 맞게 작성해야 한다.
> 반드시 `readFeed()`로 게시글 내용을 확인한 뒤, 해당 내용에 맞는 댓글을 생성한다.

**중복 방지 (계정별)**

스킬 내부에서 자동으로 중복을 감지하여 차단한다. 범위는 계정(email)별 개별.

| 대상 | 중복 기준 | 체크 방식 |
|------|----------|----------|
| 포스팅 | 같은 소스 URL **또는** 유사 태그 (태그 절반 이상 겹침) | 해당 계정의 최근 게시글 50개 조회 (`/api/p/reads/user/{userId}`) |
| 댓글 | 같은 계정이 같은 내용의 댓글 (FEFF·공백 정규화 후 비교) | 해당 게시글의 댓글 목록 조회 (`/api/p/c/{postId}`) |

중복 감지 시 `{ success: false, message: "중복 포스팅: ..." }` 또는 `"중복 댓글: ..."` 반환.

---

## 스킬 목록

### 1. 로그인 (login)

머니스테이션에 이메일/비밀번호로 로그인하고 세션을 저장한다.

| 항목 | 내용 |
|------|------|
| 필수 입력 | email, password |
| 선택 입력 | env |
| 세션 저장 | 계정(email)별로 분리 저장 |
| 세션 재사용 | 동일 계정의 유효한 세션이 있으면 재로그인 생략 |

**호출 예시:**
```ts
await skills.login({ email: "userA@example.com", password: "passA" })
await skills.login({ email: "userB@example.com", password: "passB", env: "rc" })
```

---

### 2. 포스팅 (post)

에이전트가 생성한 본문과 태그를 받아 머니스테이션에 포스팅한다.

| 항목 | 내용 |
|------|------|
| 필수 입력 | email, password, content |
| 선택 입력 | tags, source, env |
| 인증 | 저장된 세션 사용, 없거나 만료 시 자동 로그인 |
| 태그 | `tags` 배열로 캐시태그($)/해시태그(#) 자동완성 삽입 |
| 출처 | `source: { url }` 전달 시 본문 하단에 `출처: URL` 추가 |

**처리 흐름:**
1. `ensureSession()`으로 세션 확보 (없으면 자동 로그인)
2. `checkPostDuplicate()` — 같은 소스 URL / 유사 태그 체크 → 중복 시 거부
3. `buildBody(content, source)` — 본문 구성 + 출처 URL 추가
4. 저장된 storageState로 Playwright 브라우저 복원
4. 메인 피드(`/main`) 글쓰기 영역 클릭 → Quill 에디터 활성화
5. 본문 텍스트 입력
6. 태그 입력: `$`/`#` 자동완성 팝업 → 항목 선택으로 mention 삽입
7. "포스트" 버튼 클릭 → `/api/p/write` 응답에서 postId 확인

**호출 예시:**
```ts
// 에이전트가 생성한 콘텐츠 + 태그 + 출처
await skills.post({
  email: "user@example.com",
  password: "pass",
  content: "최근 원전 관련주가 주목받고 있습니다. 체코 원전 수주 이후...",
  tags: [
    { type: "cash", name: "현대건설" },
    { type: "cash", name: "두산에너빌리티" },
    { type: "topic", name: "원전시공역량" },
    { type: "topic", name: "SMR" },
  ],
  source: { url: "https://m.stock.naver.com/..." },
})

// 출처 없는 포스팅
await skills.post({
  email: "user@example.com",
  password: "pass",
  content: "삼성전자 실적 분석...",
  tags: [{ type: "cash", name: "삼성전자" }],
})
```

---

### 3. 댓글 (comment)

특정 게시글에 댓글을 작성한다. 해당 계정의 accessToken으로 API 호출.

> 댓글 내용은 대상 게시글의 내용과 맥락이 맞아야 한다.
> 에이전트는 `readFeed()`로 게시글 내용을 확인한 뒤 댓글을 생성해야 한다.

| 항목 | 내용 |
|------|------|
| 필수 입력 | email, password, postId, body |
| 선택 입력 | tags, env |
| 인증 | 저장된 accessToken 사용, 없거나 만료 시 자동 로그인 |
| 태그 | `tags` 배열로 본문에 `﻿$종목﻿ ﻿#토픽﻿` 형식 추가 |

**호출 예시:**
```ts
// 1. 먼저 피드에서 게시글 내용 확인
const feed = await skills.readFeed({ email, password });
const targetPost = feed.posts[0]; // 댓글 대상 게시글

// 2. 에이전트가 게시글 내용에 맞는 댓글 생성
const commentBody = "...에이전트가 생성한 맥락에 맞는 댓글...";

// 3. 댓글 작성
await skills.comment({
  email: "userA@example.com",
  password: "passA",
  postId: targetPost.postId,
  body: commentBody,
  tags: [
    { type: "cash", name: "삼성전자" },
    { type: "topic", name: "반도체" },
  ],
})
```

---

### 4. 피드 조회 (readFeed)

머니스테이션 피드에서 게시글 목록을 조회한다. API 호출 방식.

| 항목 | 내용 |
|------|------|
| 필수 입력 | email, password |
| 선택 입력 | offset, limit, env |
| 인증 | 저장된 accessToken 사용, 없거나 만료 시 자동 로그인 |
| 반환 | 게시글 배열 (postId, content, cashTags, topicTags, nickname 등) |

**호출 예시:**
```ts
// 최신 게시글 20개 조회
const feed = await skills.readFeed({
  email: "user@example.com",
  password: "pass",
})

// 페이징: 20번째부터 10개
const feed = await skills.readFeed({
  email: "user@example.com",
  password: "pass",
  offset: 20,
  limit: 10,
})

// 반환 구조
feed.posts[0]
// {
//   postId: 57741,
//   nickname: "dev__",
//   content: "본문 텍스트...",
//   cashTags: ["삼성전자"],
//   topicTags: ["테스트"],
//   likeCount: 0,
//   commentCount: 1,
// }
```

---

## 자동화 방식

| 스킬 | 방식 | 설명 |
|------|------|------|
| login | Playwright | 폼 로그인 → localStorage에서 JWT 추출 → 계정별 세션 저장 |
| post | Playwright | 세션 복원 → 글쓰기 영역 클릭 → Quill 에디터에 본문+태그 입력 → 포스트 |
| comment | API 호출 | accessToken으로 `POST /api/p/c/write/{postId}` 호출. 403 시 자동 재로그인 |
| readFeed | API 호출 | accessToken으로 `GET /api/p/reads/all/all/{offset}/{limit}` 호출 |

### 인증 흐름

1. 스킬 호출 시 `email`로 저장된 세션 조회
2. 유효한 세션이 있으면 재사용 (TTL: 3시간)
3. 없거나 만료 시 `email` + `password`로 자동 로그인
4. 로그인 결과(storageState + accessToken)를 계정별로 저장

세션 저장 경로: `~/.openclaw/sessions/moneystation/<email_hash>.json`

---

## 에러 상황 대응

| 상황 | 대응 |
|------|------|
| 세션 만료 | 전달된 email/password로 자동 재로그인 |
| 셀렉터 못 찾음 | "사이트 UI가 변경되었을 수 있습니다" 안내 |
| 로그인 실패 | "이메일 또는 비밀번호를 확인하세요" 안내 |
| 댓글 API 403 | accessToken 만료 → 자동 재로그인 후 재시도 |
| 포스팅 중복 | 같은 소스 URL 또는 유사 태그 → `success: false` 반환 |
| 댓글 중복 | 같은 내용의 댓글이 이미 존재 → `success: false` 반환 |
| 브라우저 실패 | 에러 메시지 반환 |

---

## 사이트 분석 결과

### API 엔드포인트

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

### 로그인 페이지 (`/login`)

| 요소 | 셀렉터 |
|------|--------|
| 이메일/유저네임 입력 | `#login_id` (name: `nicknameOrEmail`) |
| 비밀번호 입력 | `#login_password` |
| 로그인 버튼 | `form` 내 마지막 `div` (text: "로그인") — `<button>`이 아닌 `<div>` |

### 포스팅 (메인 피드 `/main`)

- **글쓰기 영역**: 피드 상단 플레이스홀더 ("투자 아이디어를 공유해주세요") 클릭으로 에디터 활성화
- **에디터**: Quill (`div.ql-editor[contenteditable="true"]`)
- **자동완성**: `$`/`#` 입력 시 `.ql-mention-list-container` 팝업
- **포스트 버튼**: `#stage1_content` 내 또는 피드 상단의 "포스트" `<div>`
- 별도 제목 필드 없음 (SNS 형태, 본문만)
- 이미지 첨부: `input[type="file"][accept="image/*"]`

### localStorage

| 키 | 용도 |
|----|------|
| `dev_access_token` | RC 환경 JWT 토큰 |
| `access_token` | Live 환경 JWT 토큰 (추정) |

### JWT 토큰 payload

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

### 댓글 데이터 구조 (`/api/p/c/{postId}` 응답)

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

### 게시글 데이터 구조 (피드 API 응답)

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

## 구현 상세

### TypeScript 인터페이스

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
type PostSource = { url: string } | { ticker: string } | { topic: string };  // 출처 메타데이터 (현재 url만 buildBody에서 처리)
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

### 모듈별 역할

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

### Playwright 구현 디테일

**로그인 (`login.ts`)**
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

**포스팅 (`post.ts`)**
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

**댓글 (`comment.ts`)**
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

### 의존성

- `playwright` `^1.58.2` — 브라우저 자동화 (로그인, 포스팅)
- `typescript` `^5.9.3`, `@types/node` `^22.19.11` — 개발 의존성

### 빌드

```bash
npm run build       # tsc → dist/
npm run typecheck   # tsc --noEmit
```

- `tsconfig.json`: target ES2022, module Node16, strict, declaration + sourceMap
- 출력: `dist/skills/moneystation/`

### RC 환경 검증 결과

1. `npx tsc --noEmit` — 타입 체크 통과
2. `dev/1234` 로그인 → accessToken 정상 발급 (`dev_access_token`)
3. 포스팅 (본문 + $삼성전자 캐시태그 + #테스트 해시태그) → `rsStateCode: 200`, postId: 57741
4. 댓글 API (`POST /api/p/c/write/57741`) → `rsStateCode: 200`, `writeComment Success`
5. 피드 조회 (`GET /api/p/reads/all/all/0/5`) → `rsStateCode: 201`, 5개 게시글 정상 반환
