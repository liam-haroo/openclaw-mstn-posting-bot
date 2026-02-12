#!/usr/bin/env npx tsx
/**
 * MoneyStation CLI — Claude Code에서 Bash로 실행하는 엔트리포인트
 *
 * Usage:
 *   npx tsx scripts/cli.ts login   --email <email> --password <pw> [--env rc|live]
 *   npx tsx scripts/cli.ts post    --email <email> --password <pw> --content "..." [--tags '[...]'] [--source '{"url":"..."}'] [--env rc|live]
 *   npx tsx scripts/cli.ts comment --email <email> --password <pw> --post-id <id> --body "..." [--tags '[...]'] [--env rc|live]
 *   npx tsx scripts/cli.ts read-post --email <email> --password <pw> --post-id <id> [--env rc|live]
 *   npx tsx scripts/cli.ts read-feed --email <email> --password <pw> [--offset 0] [--limit 20] [--env rc|live]
 */

import { login } from "./login.js";
import { post } from "./post.js";
import { comment } from "./comment.js";
import { readFeed, readPost } from "./feed.js";
import type { Tag } from "./post.js";
import type { PostSource } from "./post.js";
import type { Env } from "./lib/env.js";

function parseArgs(args: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[key] = next;
        i++;
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
}

function requireArg(args: Record<string, string>, key: string): string {
  const value = args[key];
  if (!value) {
    throw new Error(`필수 인자 --${key}가 없습니다.`);
  }
  return value;
}

function parseJson<T>(value: string, label: string): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    throw new Error(`--${label} JSON 파싱 실패: ${value}`);
  }
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (!command) {
    console.log(JSON.stringify({
      success: false,
      message: "사용법: npx tsx scripts/cli.ts <login|post|comment|read-post|read-feed> [options]",
    }));
    process.exit(1);
  }

  const args = parseArgs(rest);
  const env = (args.env || "rc") as Env;

  try {
    let result: unknown;

    switch (command) {
      case "login": {
        result = await login({
          email: requireArg(args, "email"),
          password: requireArg(args, "password"),
          env,
        });
        break;
      }

      case "post": {
        const tags: Tag[] = args.tags ? parseJson(args.tags, "tags") : [];
        const source: PostSource | undefined = args.source
          ? parseJson(args.source, "source")
          : undefined;

        result = await post({
          email: requireArg(args, "email"),
          password: requireArg(args, "password"),
          content: requireArg(args, "content"),
          tags,
          source,
          env,
        });
        break;
      }

      case "comment": {
        const tags: Tag[] = args.tags ? parseJson(args.tags, "tags") : [];

        result = await comment({
          email: requireArg(args, "email"),
          password: requireArg(args, "password"),
          postId: Number(requireArg(args, "post-id")),
          body: requireArg(args, "body"),
          tags,
          env,
        });
        break;
      }

      case "read-post": {
        result = await readPost({
          email: requireArg(args, "email"),
          password: requireArg(args, "password"),
          postId: Number(requireArg(args, "post-id")),
          env,
        });
        break;
      }

      case "read-feed": {
        result = await readFeed({
          email: requireArg(args, "email"),
          password: requireArg(args, "password"),
          offset: args.offset ? Number(args.offset) : undefined,
          limit: args.limit ? Number(args.limit) : undefined,
          env,
        });
        break;
      }

      default:
        result = { success: false, message: `알 수 없는 명령: ${command}` };
        process.exit(1);
    }

    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ success: false, message }));
    process.exit(1);
  }
}

main();
