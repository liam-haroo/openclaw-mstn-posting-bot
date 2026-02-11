# openclaw-mstn-posting-bot

머니스테이션(증권 SNS) 자동화 OpenClaw 스킬.
로그인, 포스팅, 댓글, 피드 조회를 에이전트가 CLI로 실행합니다.

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
npx tsx openclaw-mstn-posting-bot/scripts/cli.ts login \
  --email user@example.com --password pass123
```

세션은 자동 저장되며 3시간 동안 유효합니다. 다른 커맨드 실행 시 세션이 없으면 자동 로그인됩니다.

### post

```bash
npx tsx openclaw-mstn-posting-bot/scripts/cli.ts post \
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
npx tsx openclaw-mstn-posting-bot/scripts/cli.ts comment \
  --email user@example.com --password pass123 \
  --post-id 57741 \
  --body "댓글 내용" \
  --tags '[{"type":"cash","name":"현대건설"}]'
```

### read-feed

```bash
npx tsx openclaw-mstn-posting-bot/scripts/cli.ts read-feed \
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
