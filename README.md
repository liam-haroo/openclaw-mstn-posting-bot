# openclaw-mstn-posting-bot

머니스테이션(증권 SNS) 자동화 OpenClaw 스킬.
로그인, 포스팅, 댓글, 피드 조회를 에이전트가 CLI로 실행합니다.

## 스킬 구조

이 리포는 **OpenClaw 스킬 패키지이자 개발 워크스페이스**입니다.
`~/.openclaw/skills/openclaw-mstn-posting-bot/`에 clone하면 바로 스킬로 인식됩니다.

```
openclaw-mstn-posting-bot/
├── SKILL.md              ← 스킬 진입점 (OpenClaw이 인식)
├── scripts/              ← 실행 코드 (에이전트가 Bash로 실행)
│   ├── cli.ts
│   ├── login.ts, post.ts, comment.ts, feed.ts
│   └── lib/
├── references/           ← 상세 문서 (에이전트가 필요 시 참조)
│   └── site-analysis.md
├── PLAN.md               ← 설계 문서 (개발용)
├── README.md             ← 이 파일 (개발용)
├── package.json          ← 의존성 (개발용)
└── tsconfig.json         ← TypeScript 설정 (개발용)
```

**스킬 파일**: `SKILL.md`, `scripts/`, `references/` — OpenClaw 에이전트가 사용
**개발 파일**: `PLAN.md`, `README.md`, `package.json`, `tsconfig.json` — 개발/빌드용

## 설치

### 요구 사항

- Node.js 18+
- npm

### OpenClaw 스킬로 등록

```bash
cd ~/.openclaw/skills
git clone https://github.com/liam-haroo/openclaw-mstn-posting-bot.git
cd openclaw-mstn-posting-bot
npm install && npx playwright install chromium
```

> 워크스페이스 단위로 등록하려면 `~/.openclaw/skills` 대신 `<workspace>/skills`에 clone합니다.
> 스킬 우선순위: `<workspace>/skills` > `~/.openclaw/skills` > 번들 스킬

등록 후 에이전트가 자동으로 SKILL.md를 인식하고 `{baseDir}/scripts/cli.ts`로 실행합니다.

## 커맨드

에이전트가 자동 실행하지만, 수동 테스트 시 직접 호출할 수도 있습니다.

### login

```bash
npx tsx scripts/cli.ts login \
  --email user@example.com --password pass123
```

세션은 자동 저장되며 3시간 동안 유효합니다. 다른 커맨드 실행 시 세션이 없으면 자동 로그인됩니다.

### post

```bash
npx tsx scripts/cli.ts post \
  --email user@example.com --password pass123 \
  --content "포스팅 본문" \
  --tags '[{"type":"cash","name":"삼성전자"},{"type":"topic","name":"반도체"}]' \
  --source '{"url":"https://example.com/article"}'
```

| 옵션 | 필수 | 설명 |
|------|------|------|
| `--content` | Y | 포스팅 본문 |
| `--tags` | N | 태그 JSON 배열 |
| `--source` | N | 출처 JSON — 본문 하단에 `출처: URL` 추가 |
| `--env` | N | `rc` (기본) 또는 `live` |

### comment

```bash
npx tsx scripts/cli.ts comment \
  --email user@example.com --password pass123 \
  --post-id 57741 \
  --body "댓글 내용" \
  --tags '[{"type":"cash","name":"현대건설"}]'
```

### read-post

```bash
npx tsx scripts/cli.ts read-post \
  --email user@example.com --password pass123 \
  --post-id 57741
```

특정 게시글의 상세 내용을 조회합니다. 댓글 작성 전 대상 게시글의 맥락을 파악할 때 사용합니다.

### read-feed

```bash
npx tsx scripts/cli.ts read-feed \
  --email user@example.com --password pass123 \
  --offset 0 --limit 20
```

## 태그

| 유형 | JSON `type` | 예시 |
|------|-------------|------|
| 캐시태그 ($종목) | `cash` | `{"type":"cash","name":"삼성전자"}` |
| 해시태그 (#토픽) | `topic` | `{"type":"topic","name":"반도체"}` |

## 환경

| 환경 | 용도 | `--env` 값 |
|------|------|-----------|
| RC | 테스트/개발 (기본) | `rc` |
| Live | 실제 서비스 | `live` |

## 프로젝트 상세

설계 문서, 자동화 방식, 인증 흐름, 검증 결과 등은 [PLAN.md](PLAN.md)를 참고하세요.
