#!/usr/bin/env node
/**
 * PostToolUse hook: 編集された TS/TSX に対して
 *   1. prettier --write（対象ファイルのみ・高速）
 *   2. tsc --noEmit（プロジェクト全体・strict の生命線）
 *   3. src/core/** の場合のみ vitest related（コアの純粋ロジックを守る）
 * を実行する。
 *
 * 失敗時は exit code 2 で stderr を返し、Claude に修正を促す。
 * package.json が未作成の初期段階では何もせず正常終了する。
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

function readStdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

const payload = readStdin();
const filePath = payload?.tool_input?.file_path ?? '';

if (!/\.(ts|tsx)$/.test(filePath)) process.exit(0);
if (!existsSync(path.join(projectRoot, 'node_modules'))) process.exit(0);

const rel = path.relative(projectRoot, filePath).split(path.sep).join('/');
const problems = [];

function run(cmd, args, label) {
  try {
    execFileSync(cmd, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
      timeout: 120_000,
    });
    return true;
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`.trim();
    problems.push(`[${label}]\n${out.slice(0, 4000)}`);
    return false;
  }
}

run('npx', ['prettier', '--write', rel], 'prettier');
run('npx', ['tsc', '--noEmit'], 'typecheck');

if (rel.startsWith('src/core/')) {
  run('npx', ['vitest', 'related', rel, '--run', '--reporter=dot'], 'vitest');
}

if (problems.length > 0) {
  console.error(problems.join('\n\n'));
  process.exit(2);
}
