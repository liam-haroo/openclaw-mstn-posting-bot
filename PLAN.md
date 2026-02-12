# 머니스테이션(MoneyStation) 자동화 스킬

OpenClaw AgentSkills 형식으로 배포되는 머니스테이션 자동화 스킬 패키지.
호출마다 다른 계정이 사용될 수 있다.

> **머니스테이션**은 증권정보 SNS 플랫폼이다.
> 포스팅/댓글은 금융·경제·투자 관련 주제 위주로 작성하며, 이와 무관한 내용은 작성하지 않는다.

---

## 프로젝트 구조

```
openclaw-mstn-posting-bot/                    # 리포 루트 = 스킬 루트
├── SKILL.md                                  # 스킬 진입점 (YAML frontmatter + 에이전트 지시서)
├── scripts/                                  # 실행 코드 (Claude가 Bash로 실행)
│   ├── cli.ts                                # CLI 엔트리포인트 (npx tsx)
│   ├── index.ts                              # 모듈 re-export
│   ├── login.ts                              # 로그인 + ensureSession 헬퍼
│   ├── post.ts                               # 포스팅 (캐시태그/해시태그 포함)
│   ├── comment.ts                            # 댓글 (캐시태그/해시태그 포함)
│   ├── feed.ts                               # 피드 조회 (게시글 목록 + 내용)
│   └── lib/                                  # 내부 공유 모듈
│       ├── browser-manager.ts                # Playwright 인스턴스 관리
│       ├── session-store.ts                  # 계정별 세션/토큰 저장 (userId 포함)
│       ├── dedup.ts                          # 중복 포스팅/댓글 체크
│       ├── env.ts                            # RC/Live 환경 설정
│       └── constants.ts                      # 셀렉터, 타임아웃, API 경로
├── references/                               # 상세 문서 (필요 시 context에 로드)
│   └── site-analysis.md                      # API/셀렉터/JWT/데이터 구조 레퍼런스
├── PLAN.md                                   # 프로젝트 설계 문서 (이 파일)
├── README.md                                 # 설치/사용법 (개발자용)
├── package.json                              # 의존성 (playwright, tsx, typescript)
├── tsconfig.json
└── .gitignore
```

**스킬 패키지 구조 (OpenClaw AgentSkills 호환):**
- `SKILL.md` — 스킬 진입점. YAML frontmatter(name, description, metadata) + 사용법/지시서
- `scripts/` — 실행 가능한 코드. SKILL.md에서 `{baseDir}/scripts/cli.ts` 로 참조
- `references/` — 상세 문서. 에이전트가 코드 수정/디버깅 시 참조

---

## 자동화 방식

| 스킬 | 방식 | 설명 |
|------|------|------|
| login | Playwright | 폼 로그인 → localStorage에서 JWT 추출 → 계정별 세션 저장 |
| post | Playwright | 세션 복원 → 글쓰기 영역 클릭 → Quill 에디터에 본문+태그 입력 → 포스트 |
| comment | API 호출 | accessToken으로 `POST /api/p/c/write/{postId}` 호출. 403 시 자동 재로그인 |
| readFeed | API 호출 | accessToken으로 `GET /api/p/reads/all/all/{offset}/{limit}` 호출 |
| readPost | API 호출 | accessToken으로 `GET /api/p/read/{postId}` 호출. 특정 게시글 상세 조회 |

### 인증 흐름

1. 스킬 호출 시 `email`로 저장된 세션 조회
2. 유효한 세션이 있으면 재사용 (TTL: 3시간)
3. 없거나 만료 시 `email` + `password`로 자동 로그인
4. 로그인 결과(storageState + accessToken)를 계정별로 저장

세션 저장 경로: `~/.openclaw/sessions/openclaw-mstn-posting-bot/<email_hash>.json`

---

## 개발 / 실행

```bash
npm run typecheck   # tsc --noEmit (타입 체크)

# CLI 직접 실행 (tsx — 빌드 없이 TypeScript 직접 실행)
npx tsx scripts/cli.ts login --email dev --password 1234 --env rc
npx tsx scripts/cli.ts post --email dev --password 1234 --content "..." --tags '[...]'
npx tsx scripts/cli.ts comment --email dev --password 1234 --post-id 123 --body "..."
npx tsx scripts/cli.ts read-post --email dev --password 1234 --post-id 57741
npx tsx scripts/cli.ts read-feed --email dev --password 1234
```

- `tsconfig.json`: target ES2022, module Node16, strict
- include: `scripts/**/*.ts`
- 별도 빌드 불필요 — `tsx`가 TypeScript를 직접 실행

### 의존성

- `playwright` `^1.58.2` — 브라우저 자동화 (로그인, 포스팅)
- `tsx` `^4.21.0` — TypeScript 직접 실행 (`npx tsx scripts/cli.ts`)
- `typescript` `^5.9.3`, `@types/node` `^22.19.11` — 개발 의존성

---

## 상세 문서

스킬 사용법, 커맨드 옵션, 설계 원칙, 워크플로우, 태그 시스템, 에러 대응은 스킬 패키지 내 문서에 정의되어 있다:

- **[SKILL.md](SKILL.md)** — 스킬 사용 지시서 (커맨드, 옵션, 워크플로우, 태그 시스템, 에러 대응)
- **[references/site-analysis.md](references/site-analysis.md)** — 사이트 분석 상세 (API 엔드포인트, 셀렉터, JWT 구조, 데이터 구조, TypeScript 인터페이스, 모듈별 역할, Playwright 구현 디테일)

---

## RC 환경 검증 결과

1. `npx tsc --noEmit` — 타입 체크 통과
2. `npx tsx scripts/cli.ts login --email dev --password 1234 --env rc` → accessToken 정상 발급
3. 포스팅 (본문 + $삼성전자 캐시태그 + #테스트 해시태그) → `rsStateCode: 200`, postId: 57741
4. 댓글 API (`POST /api/p/c/write/57741`) → `rsStateCode: 200`, `writeComment Success`
5. 피드 조회 (`GET /api/p/reads/all/all/0/5`) → `rsStateCode: 201`, 5개 게시글 정상 반환
