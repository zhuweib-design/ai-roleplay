/**
 * 生成 1.0.0 发布证据清单。
 *
 * 默认只输出清单；--write 写入 artifacts/release-evidence/ 下的 JSON。
 * --check 用于发布门禁：检查必需文件、契约版本和工作区状态，不把“未执行”
 * 的测试伪装成通过。
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_PATH = path.join(ROOT, 'package.json');
const RUNTIME_TYPES_PATH = path.join(ROOT, 'src', 'runtime', 'types.ts');
const BACKUP_PATH = path.join(ROOT, 'src', 'core', 'backup.ts');
const MIGRATION_PATH = path.join(ROOT, 'migrations', '001_virtual_character_os.sql');
const SCHEMA_DOC_PATH = path.join(ROOT, 'docs', 'Virtual-Character-OS-v1.0-database-schema.sql.md');

const REQUIRED_FILES = [
  'src/core/schema-contract.ts',
  'src/core/backup.ts',
  'src/runtime/types.ts',
  'src/runtime/runtime-core.ts',
  'migrations/001_virtual_character_os.sql',
  'docs/dev/runtime-event-contract.md',
  'docs/dev/runtime-database-migration-runbook.md',
  'docs/dev/data-backup-restore.md',
  'docs/dev/resource-security.md',
];

const REQUIRED_SCRIPTS = [
  'typecheck',
  'lint',
  'test',
  'i18n:check:strict',
  'runtime:db:schema:check',
  'check:csp',
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function readVersion(source, name) {
  const pattern = new RegExp(`export const ${name}\\s*=\\s*([^;\\n]+)`);
  return source.match(pattern)?.[1]?.trim() ?? null;
}

function buildManifest() {
  const pkg = readJson(PACKAGE_PATH);
  const runtimeTypes = fs.readFileSync(RUNTIME_TYPES_PATH, 'utf8');
  const backup = fs.readFileSync(BACKUP_PATH, 'utf8');
  const status = git(['status', '--porcelain']);
  return {
    manifestVersion: 1,
    generatedAt: new Date().toISOString(),
    packageVersion: pkg.version,
    commit: git(['rev-parse', 'HEAD']),
    branch: git(['branch', '--show-current']),
    workingTreeClean: status === '',
    coreSchema: {
      id: 'ai-roleplay-core',
      version: 1,
      source: 'src/core/schema-contract.ts',
    },
    runtime: {
      eventSchemaVersion: readVersion(runtimeTypes, 'RUNTIME_EVENT_SCHEMA_VERSION'),
      reducerVersion: readVersion(runtimeTypes, 'RUNTIME_REDUCER_VERSION'),
      contract: 'docs/dev/runtime-event-contract.md',
    },
    backup: {
      version: readVersion(backup, 'BACKUP_VERSION'),
      source: 'src/core/backup.ts',
    },
    database: {
      migration: 'migrations/001_virtual_character_os.sql',
      migrationSha256: sha256(MIGRATION_PATH),
      schemaDocument: 'docs/Virtual-Character-OS-v1.0-database-schema.sql.md',
      schemaDocumentSha256: sha256(SCHEMA_DOC_PATH),
    },
    requiredFiles: Object.fromEntries(REQUIRED_FILES.map((file) => [file, fs.existsSync(path.join(ROOT, file))])),
    requiredScripts: Object.fromEntries(REQUIRED_SCRIPTS.map((name) => [name, typeof pkg.scripts?.[name] === 'string'])),
    gates: Object.fromEntries(REQUIRED_SCRIPTS.map((name) => [name, { status: 'not-run' }])),
  };
}

function validateManifest(manifest) {
  const errors = [];
  const targetArg = process.argv.find((arg) => arg.startsWith('--target='));
  const targetVersion = targetArg?.slice('--target='.length);
  if (targetVersion && manifest.packageVersion !== targetVersion) {
    errors.push(`当前 package 版本为 ${manifest.packageVersion}，与目标版本 ${targetVersion} 不一致`);
  }
  if (!manifest.commit) errors.push('无法读取当前 Git commit');
  if (!manifest.workingTreeClean) errors.push('工作区存在未提交改动');
  for (const [file, present] of Object.entries(manifest.requiredFiles)) {
    if (!present) errors.push(`缺少必需文件：${file}`);
  }
  for (const [name, present] of Object.entries(manifest.requiredScripts)) {
    if (!present) errors.push(`缺少必需脚本：${name}`);
  }
  if (manifest.runtime.eventSchemaVersion !== '1 as const') {
    errors.push(`Runtime Event Schema 版本不是 1：${manifest.runtime.eventSchemaVersion}`);
  }
  if (manifest.runtime.reducerVersion !== '1 as const') {
    errors.push(`Runtime Reducer 版本不是 1：${manifest.runtime.reducerVersion}`);
  }
  return errors;
}

const args = process.argv.slice(2);
const manifest = buildManifest();
const errors = validateManifest(manifest);
const json = `${JSON.stringify(manifest, null, 2)}\n`;

if (args.includes('--write')) {
  const output = path.join(ROOT, 'artifacts', 'release-evidence', `v${manifest.packageVersion}`, 'manifest.json');
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, json, 'utf8');
  console.log(`[release-evidence] 已写入 ${path.relative(ROOT, output)}`);
}

if (!args.includes('--quiet')) console.log(json);

if (args.includes('--check')) {
  if (errors.length) {
    console.error(errors.map((error) => `[release-evidence] ${error}`).join('\n'));
    process.exitCode = 1;
  } else {
    console.log('[release-evidence] 当前核心契约和发布文件检查通过；质量门禁仍需逐项运行。');
  }
}
