import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'docs', 'Virtual-Character-OS-v1.0-database-schema.sql.md');
const targetPath = path.join(root, 'migrations', '001_virtual_character_os.sql');
const source = fs.readFileSync(sourcePath, 'utf8');
const match = source.match(/```sql\r?\n([\s\S]*?)\r?\n```/);
if (!match) throw new Error(`未找到 PostgreSQL SQL 代码块：${sourcePath}`);
const sql = `${match[1].trim()}\n`;

if (process.argv.includes('--check')) {
  if (!fs.existsSync(targetPath)) {
    console.error(`[runtime-schema] 缺少迁移文件：${targetPath}`);
    process.exitCode = 1;
  } else if (fs.readFileSync(targetPath, 'utf8') !== sql) {
    console.error('[runtime-schema] 迁移文件与权威 Schema 文档不一致');
    process.exitCode = 1;
  } else {
    console.log('[runtime-schema] 迁移文件与权威 Schema 文档一致');
  }
} else {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, sql, 'utf8');
  console.log(`[runtime-schema] 已生成 ${path.relative(root, targetPath)}`);
}
