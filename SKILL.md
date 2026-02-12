---
name: openclaw-mstn-posting-bot
description: "MUST use for any request containing moneystation.net or dev2.moneystation.kr URLs, or any mention of 머니스테이션/MoneyStation. Also use when t.me or 텔레그램/Telegram channel URLs are mentioned as data sources for 머니스테이션 posting. 머니스테이션 증권 SNS 자동화: 게시글 조회(read-post), 포스팅, 댓글, 피드 조회. 머니스테이션은 JS렌더링 사이트라 WebFetch 불가 — 반드시 이 스킬의 read-post API로 본문을 조회해야 한다. 텔레그램 채널은 t.me/s/ URL로 변환하여 WebFetch로 조회."
metadata: {"openclaw":{"requires":{"bins":["npx","node"]}}}
---

# Moneystation

머니스테이션(증권정보 SNS)에서 로그인, 포스팅, 댓글, 피드 조회를 자동화하는 스킬.
포스팅/댓글은 금융·경제·투자 관련 주제 위주로 작성하며, 이와 무관한 내용은 작성하지 않는다.

**콘텐츠 톤 (필수):** 증권 플랫폼에 맞는 전문적인 문체를 사용한다.
- 이모지 사용 금지. 절대로 이모지를 넣지 않는다.
- 간결하고 건조한 투자 분석 톤. 감탄사/과장 표현 자제.
- 좋은 예: "수급 흐름이 양호하고, 실적 컨센서스 상회 시 추가 상승 여력이 있다고 봅니다."
- 나쁜 예: "🚀 대박 종목! 꼭 잡으세요!! 💰🔥"

## 설계 원칙

**에이전트 오케스트레이션**: 콘텐츠 생성은 에이전트(LLM)의 역할이고, 스킬은 머니스테이션 조작만 담당한다.

- 스킬은 **실행**만 담당 (로그인, 포스팅, 댓글, 피드 조회)
- 에이전트가 **판단**을 담당 (어떤 내용을 쓸지, 어떤 태그를 붙일지)
- `--source` 필드는 콘텐츠를 대체하지 않고, 출처 표시용 메타데이터로만 사용

**머니스테이션 URL 처리 (중요):**

머니스테이션 웹페이지는 JS 렌더링이라 WebFetch/웹스크래핑으로 본문을 읽을 수 없다.
머니스테이션 게시글 URL이 주어지면 반드시 아래 절차를 따른다:

1. URL에서 postId를 추출한다: `https://www.moneystation.net/post/116590` → postId = `116590`
2. `read-post --post-id <추출한 ID> --env live` 명령으로 API를 통해 본문을 조회한다
3. **절대로** 머니스테이션 URL을 직접 fetch/웹스크래핑하지 않는다

URL 패턴:
- `https://www.moneystation.net/post/<postId>` → `--env live`
- `https://dev2.moneystation.kr/post/<postId>` → `--env rc`

**중복 방지 (계정별, 자동):**

| 대상 | 중복 기준 |
|------|----------|
| 포스팅 | 같은 소스 URL **또는** 유사 태그 (태그 절반 이상 겹침) |
| 댓글 | 같은 계정이 같은 내용의 댓글 (공백 정규화 후 비교) |

중복 감지 시 `{ "success": false, "message": "중복 포스팅: ..." }` 반환.

## 환경

| 환경 | 프론트엔드 | API | 기본값 |
|------|-----------|-----|--------|
| **RC** | `https://dev2.moneystation.kr` | `https://api-dev.moneystation.kr` | `--env rc` (기본) |
| **Live** | `https://www.moneystation.net` | `https://api.moneystation.net` | `--env live` |

## 인증 (필수 — 최우선)

모든 커맨드는 `--email`과 `--password`가 필요하다. `--email`에는 **이메일 또는 아이디(닉네임)** 둘 다 사용 가능하다.

**비로그인 상태에서 요청이 들어오면, 무조건 첫 번째 응답에서 아이디(또는 이메일)와 비밀번호를 요청한다.**
다른 선택지를 먼저 제시하지 않는다. 텍스트 붙여넣기 등의 대안은 사용자가 로그인을 거부한 후에만 안내한다.

```
[올바른 응답 예시]
"머니스테이션 아이디(또는 이메일)와 비밀번호를 알려주세요. 로그인 후 게시글을 조회하고 댓글을 제안해 드리겠습니다."

[잘못된 응답 예시 — 이렇게 하지 않는다]
"아래 둘 중 하나로 진행할게요: 1) 텍스트 붙여넣기 2) 로그인 정보 제공"
```

이미 로그인한 세션이 있으면 자동 재사용되므로 매번 묻지 않아도 된다 (TTL: 3시간).
사용자가 로그인을 거부하면 그때 "게시글 텍스트를 직접 붙여넣어 주시면 그 내용으로 댓글을 제안해 드릴 수 있습니다"라고 안내한다.

## Commands

모든 커맨드는 `npx tsx {baseDir}/scripts/cli.ts <command> [options]`로 실행. 결과는 JSON stdout.

### login

머니스테이션에 이메일(또는 아이디)/비밀번호로 로그인하고 세션을 저장한다.
동일 계정의 유효한 세션(3시간 TTL)이 있으면 재로그인을 생략한다.

```bash
npx tsx {baseDir}/scripts/cli.ts login --email user@example.com --password pass123 --env rc
```

### post

에이전트가 생성한 본문과 태그를 받아 머니스테이션에 포스팅한다.
세션이 없거나 만료 시 자동 로그인한다.

```bash
# 기본 포스팅
npx tsx {baseDir}/scripts/cli.ts post \
  --email user@example.com --password pass123 \
  --content "최근 원전 관련주가 주목받고 있습니다." \
  --tags '[{"type":"cash","name":"현대건설"},{"type":"topic","name":"SMR"}]'

# 출처 포함 포스팅
npx tsx {baseDir}/scripts/cli.ts post \
  --email user@example.com --password pass123 \
  --content "분석 내용..." \
  --tags '[{"type":"cash","name":"삼성전자"}]' \
  --source '{"url":"https://m.stock.naver.com/..."}'
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--email` | Y | 이메일 또는 아이디 |
| `--password` | Y | 비밀번호 |
| `--content` | Y | 포스팅 본문 |
| `--tags` | N | JSON 배열 `[{"type":"cash\|topic","name":"..."}]` |
| `--source` | N | JSON `{"url":"..."}` — 본문 하단에 `출처: URL` 추가 |
| `--env` | N | `rc` (기본) 또는 `live` |

### comment

특정 게시글에 댓글을 작성한다. API 직접 호출 방식.

> **중요**: 댓글 내용은 대상 게시글의 내용과 맥락이 맞아야 한다.
> 반드시 `read-feed`로 게시글 내용을 확인한 뒤, 해당 내용에 맞는 댓글을 생성한다.

```bash
npx tsx {baseDir}/scripts/cli.ts comment \
  --email user@example.com --password pass123 \
  --post-id 57741 \
  --body "좋은 분석입니다. 원전 관련주 흐름이 당분간 지속될 것 같네요." \
  --tags '[{"type":"cash","name":"현대건설"}]'
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--email` | Y | 이메일 또는 아이디 |
| `--password` | Y | 비밀번호 |
| `--post-id` | Y | 댓글 대상 게시글 ID |
| `--body` | Y | 댓글 본문 |
| `--tags` | N | JSON 배열 — FEFF 형식으로 본문에 추가 |
| `--env` | N | `rc` (기본) 또는 `live` |

### read-post

특정 게시글의 상세 내용을 조회한다. 댓글 작성 전 대상 게시글의 맥락을 파악할 때 사용.
**미디어 자동 추출**: 본문 HTML에서 이미지/링크/유튜브 URL을 파싱하여 `media` 필드로 반환한다.

```bash
npx tsx {baseDir}/scripts/cli.ts read-post \
  --email user@example.com --password pass123 \
  --post-id 57741
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--email` | Y | 이메일 또는 아이디 |
| `--password` | Y | 비밀번호 |
| `--post-id` | Y | 조회할 게시글 ID |
| `--env` | N | `rc` (기본) 또는 `live` |

반환 JSON (`media`는 해당 미디어가 있을 때만 포함):
```json
{
  "success": true,
  "post": {
    "postId": 116590,
    "nickname": "이십팔만전자포에버",
    "content": "8만 원대 고생하며 버틴 보람이 있다...",
    "cashTags": ["삼성전자", "삼성전자우", "KODEX삼성그룹"],
    "topicTags": ["삼전", "신고가"],
    "likeCount": 13,
    "commentCount": 0,
    "media": {
      "images": ["https://storage.moneystation.kr/images/posts/...jpg"],
      "links": [{"url": "https://www.etoday.co.kr/...", "title": "기사 제목", "description": "기사 설명", "imageUrl": "https://..."}],
      "youtube": ["https://youtube.com/watch?v=..."]
    }
  },
  "rawFields": { "iSentimentStatus": 1, "sProfileImage": "...", "createdAt": "..." },
  "message": "게시글 조회 완료"
}
```

미디어 소스:
- `media.images` ← API 필드 `sPostImage` (쉼표 구분 URL)
- `media.links` ← API 필드 `objPostLink` (URL, 제목, 설명, 프리뷰 이미지)
- `media.youtube` ← `objPostLink` 또는 `sPostContents` 내 유튜브 URL

### read-feed

머니스테이션 피드에서 게시글 목록을 조회한다.

```bash
# 최신 20개 조회
npx tsx {baseDir}/scripts/cli.ts read-feed --email user@example.com --password pass123

# 페이징
npx tsx {baseDir}/scripts/cli.ts read-feed --email user@example.com --password pass123 --offset 20 --limit 10
```

반환 JSON의 `posts` 배열에 각 게시글 포함:
```json
{
  "postId": 57741,
  "nickname": "dev__",
  "content": "본문 텍스트...",
  "cashTags": ["삼성전자"],
  "topicTags": ["테스트"],
  "likeCount": 0,
  "commentCount": 1
}
```

## 태그 시스템

| 태그 유형 | 기호 | 용도 | 예시 |
|----------|------|------|------|
| **캐시태그** | `$` | 종목(주식) 언급 | `$삼성전자`, `$KODEXK원자력SMR` |
| **해시태그** | `#` | 토픽(주제) 언급 | `#원전시공역량`, `#SMR` |

`--tags` JSON 형식: `[{"type":"cash","name":"삼성전자"}, {"type":"topic","name":"SMR"}]`

포스팅은 Playwright가 Quill 에디터 자동완성으로 삽입.
댓글은 API 호출 시 FEFF(zero-width no-break space)로 감싸서 전송.

## 워크플로우

### 소스 기반 포스팅 (웹)

```
사용자: "네이버 증권 뉴스에서 적당한 주제 잡아서 포스팅해줘"
1. 에이전트가 소스 URL 방문 → 기사 목록 파악
2. 에이전트가 기사 선택 → 내용 분석
3. 에이전트가 머니스테이션용 포스팅 콘텐츠 작성 (LLM)
4. 에이전트가 관련 종목/토픽 태그 결정
5. npx tsx {baseDir}/scripts/cli.ts post --content "..." --tags '[...]' --source '{"url":"..."}'
```

### 소스 기반 포스팅 (텔레그램)

텔레그램 채널을 데이터 소스로 사용하는 경우:

**텔레그램 URL 처리:**
- `https://t.me/siglab` → 네이티브 앱 리다이렉트 페이지 (본문 없음)
- `https://t.me/s/siglab` → 웹에서 채팅 내용 열람 가능 (**이 URL을 사용**)
- 채널 ID `@siglab` → `https://t.me/s/siglab`으로 변환

```
사용자: "@siglab 텔레그램 채널에서 적당한 내용 포스팅해줘"

1. 채널 URL 생성: https://t.me/s/siglab
2. WebFetch로 채널 페이지 조회 (t.me/s/ URL은 서버 렌더링이라 WebFetch 가능)
3. 페이지 하단(최신순)에서 최근 5개 메시지를 추출
4. 5개 중 증권/투자/금융 플랫폼에 적합한 콘텐츠를 선별
5. 선별한 메시지를 기반으로 머니스테이션용 포스팅 작성 (LLM) — 단순 복사가 아닌, 분석/요약/의견 추가
6. 에이전트가 관련 종목/토픽 태그 결정
7. npx tsx {baseDir}/scripts/cli.ts post --content "..." --tags '[...]' --source '{"url":"https://t.me/siglab/메시지번호"}'
```

> **주의**: `t.me/채널` URL이 주어지면 반드시 `t.me/s/채널`로 변환하여 조회한다. `/s/` 없는 URL은 본문을 읽을 수 없다.
> **주의**: 텔레그램 페이지는 최신 메시지가 하단에 위치한다. 하단부터 최근 5개를 읽는다.

### 댓글 작성 (피드 탐색)

```
1. npx tsx {baseDir}/scripts/cli.ts read-feed → 게시글 목록 + 내용 조회
2. 에이전트가 게시글 내용을 읽고 맥락에 맞는 댓글 생성 (LLM)
3. npx tsx {baseDir}/scripts/cli.ts comment --post-id <id> --body "..."
```

### 댓글 작성 (특정 게시글)

```
1. npx tsx {baseDir}/scripts/cli.ts read-post --post-id <id> → 게시글 상세 조회 (텍스트 + 미디어)
2. 에이전트가 게시글 내용(텍스트, 이미지, 링크, 유튜브)을 종합적으로 파악하고 맥락에 맞는 댓글 생성 (LLM)
3. npx tsx {baseDir}/scripts/cli.ts comment --post-id <id> --body "..."
```

> **미디어 활용**: `read-post` 응답의 `media` 필드를 확인한다.
> - `media.images`: 첨부 이미지가 있으면 이미지 내용을 언급하거나 관련 의견 추가
> - `media.links`: 공유된 링크가 있으면 해당 기사/자료의 맥락을 반영
> - `media.youtube`: 유튜브 영상이 있으면 영상 주제에 대한 의견 반영
> - `rawFields`: API가 추가 필드를 반환하면 참고 (아직 발견되지 않은 미디어 관련 필드가 있을 수 있음)

### 댓글 작성 (URL 기반)

사용자가 머니스테이션 게시글 URL을 제공한 경우:

```
사용자: "https://www.moneystation.net/post/116590 이 글에 댓글 달아줘"

1. [최우선] 로그인 정보 확보: 아이디(또는 이메일)와 비밀번호가 없으면 먼저 물어본다
2. URL에서 postId 추출: 116590
3. URL 도메인으로 env 판별: www.moneystation.net → live
4. npx tsx {baseDir}/scripts/cli.ts read-post --post-id 116590 --email <id> --password <pw> --env live → 게시글 상세 + 미디어 조회
5. 에이전트가 게시글 내용(텍스트 + 미디어)을 종합 파악하고 맥락에 맞는 댓글 생성 (LLM)
6. npx tsx {baseDir}/scripts/cli.ts comment --post-id 116590 --email <id> --password <pw> --body "..." --env live
```

> **주의**: 머니스테이션 URL을 WebFetch/웹스크래핑으로 직접 읽으면 안 된다. 반드시 `read-post` API를 사용한다.
> **주의**: 로그인 정보가 없으면 무조건 먼저 요청한다. 텍스트 붙여넣기 대안은 사용자가 로그인을 거부한 경우에만 안내한다.

## 에러 대응

| 상황 | 자동 대응 |
|------|----------|
| MODULE_NOT_FOUND / Cannot find package | `cd {baseDir} && npm install && npx playwright install chromium` 실행 후 재시도 |
| 세션 만료 | email/password로 자동 재로그인 |
| 댓글 API 403 | 자동 재로그인 후 재시도 |
| 포스팅/댓글 중복 | `success: false` 반환 (자동 차단) |
| 셀렉터 못 찾음 | "사이트 UI가 변경되었을 수 있습니다" |
| 로그인 실패 | "이메일 또는 비밀번호를 확인하세요" |

## Resources

- [references/site-analysis.md](references/site-analysis.md) — API 엔드포인트, 셀렉터, JWT 구조, 데이터 구조, Playwright 구현 디테일

