"""第三轮优化项 8 拆分后收尾（幂等，可重复运行）：
1) mpModal* 提升到共享模块（security 触发 / data 渲染）
2) 按 vue-tsc TS6133/TS6192 输出迭代清理未使用导入（基于错误行定位 import 语句）
"""
import io
import re
import subprocess

SHARED_IMPORT = "import { mpModalOpen, mpModalMode } from '@/utils/master-password-modal-state';"


def patch_once(path, old, new):
    s = io.open(path, encoding='utf-8').read()
    if old in s and (new == '' or new not in s):
        io.open(path, 'w', encoding='utf-8', newline='').write(s.replace(old, new, 1))
        print('patched', path)


# ── 1. mpModal 共享状态 ──
for p in ['src/components/settings/SettingsSecurityPanel.vue',
          'src/components/settings/SettingsDataPanel.vue']:
    patch_once(p,
               "import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';",
               "import type { MasterPasswordMode } from '@/components/common/MasterPasswordModal.vue';\n" + SHARED_IMPORT)
    s = io.open(p, encoding='utf-8').read()
    s2 = re.sub(r"const mpModalOpen = ref\(false\);\n", '', s, count=1)
    s2 = re.sub(r"const mpModalMode = ref<MasterPasswordMode>\('setup'\);\n", '', s2, count=1)
    if s2 != s:
        io.open(p, 'w', encoding='utf-8', newline='').write(s2)
        print('mpModal local decls removed:', p)


def tsc_errors():
    out = subprocess.run('npx vue-tsc --noEmit', capture_output=True, text=True,
                         encoding='utf-8', errors='replace', shell=True)
    return [l for l in (out.stdout + out.stderr).split('\n')
            if 'TS6133' in l or 'TS6192' in l]


def remove_specifier(text, name):
    """从所有 import 语句中移除指定具名导入；整条语句无成员则删除。"""
    # 处理 import [type] { ... } from '...';（含多行）
    pat = re.compile(r"import (type )?\{([^}]*)\} from[^\n;]*;", re.S)

    def repl(m):
        kind, inner = m.group(1) or '', m.group(2)
        parts = [x.strip() for x in inner.split(',') if x.strip()]
        # 成员本地名：剥掉 'as 别名' 与 'type ' 前缀后比较
        def local(x):
            return x.split(' as ')[-1].strip().replace('type ', '', 1)
        kept = [x for x in parts if local(x) != name]
        if len(kept) == len(parts):
            return m.group(0)
        if not kept:
            return ''
        prefix = 'import type ' if kind else 'import '
        kept = [k if not k.startswith('type ') else k for k in kept]
        return f"{prefix}{{ {', '.join(kept)} }} from" + m.group(0)[m.group(0).rindex(' from') + len(' from'):] + ';'

    return pat.sub(repl, text)


def remove_import_stmt_at(text, line_no):
    """删除指定行所在的整条 import 语句（到第一个分号）。"""
    lines = text.split('\n')
    i = line_no - 1
    if i >= len(lines):
        return text
    start = i
    while start > 0 and not re.match(r'\s*import\b', lines[start]):
        start -= 1
    end = i
    while end < len(lines) and not lines[end].rstrip().endswith(';'):
        end += 1
    del lines[start:end + 1]
    # 顺带清理连续空行
    return '\n'.join(lines)


for round_no in range(6):
    errors = tsc_errors()
    if not errors:
        print(f'round {round_no}: clean')
        break
    per_file = {}
    for l in errors:
        m = re.match(r'([^(]+)\((\d+),\d+\): error (TS6133|TS6192):', l)
        if m:
            per_file.setdefault(m.group(1), []).append((int(m.group(2)), m.group(3), l))
    if not per_file:
        print('no import errors parsed; stop')
        break
    nm = re.compile(r"error TS6133: '([^']+)'")
    for path, errs in per_file.items():
        s = io.open(path, encoding='utf-8').read()
        for line_no, kind, raw in errs:
            if kind == 'TS6133':
                mm = nm.search(raw)
                if mm:
                    name = mm.group(1)
                    if name == 'settings':
                        # 兼容层的 settings 常量未使用 → 删除声明行
                        s = re.sub(r"\nconst settings = useSettingsStore\(\);", '', s, count=1)
                    else:
                        s = remove_specifier(s, name)
            else:
                s = remove_import_stmt_at(s, line_no)
        io.open(path, 'w', encoding='utf-8', newline='').write(s)
        print(f'round {round_no}: cleaned {path}')
print('done')
