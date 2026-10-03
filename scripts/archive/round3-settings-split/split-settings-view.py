"""第三轮优化项 8 一次性拆分脚本：从 SettingsView.vue 提取 5 个分区子组件。

用法：python scripts/split-settings-view.py
产物：src/components/settings/Settings{Appearance,Extension,Security,Data,About}Panel.vue
主文件重写为布局容器 + model 区（既有两个面板包装）。
拆分后需人工核对 typecheck/tests；本脚本只跑一次，留在 scripts/ 备查。
"""
import io
import re

SRC = 'src/views/SettingsView.vue'
s = io.open(SRC, encoding='utf-8').read()
lines = s.split('\n')

tpl_start = next(i for i, l in enumerate(lines) if l.strip() == '<template>')
script_start = next(i for i, l in enumerate(lines) if l.strip() == '<script setup lang="ts">')
script_end = next(i for i, l in enumerate(lines) if l.strip() == '</script>')
style_start = next(i for i, l in enumerate(lines) if l.startswith('<style scoped>'))
style_end = next(i for i, l in enumerate(lines) if l.strip() == '</style>')
tpl_lines = lines[tpl_start + 1:style_start]
script_lines = lines[script_start + 1:script_end]
style_lines = lines[style_start + 1:style_end]

# ── 分区定位（深度匹配 div） ──
sections = {}
for i, l in enumerate(tpl_lines):
    m = re.search(r"v-show=\"activeCategory === '([a-z]+)'\"", l)
    if m and re.match(r'\s*<div\b', l):
        sections[m.group(1)] = i


def div_close(ls, start):
    depth = 0
    for j in range(start, len(ls)):
        depth += len(re.findall(r'<div\b', ls[j])) - len(re.findall(r'</div>', ls[j]))
        if depth <= 0:
            return j
    return len(ls) - 1


sec_tpl = {}
for name, start in sections.items():
    close = div_close(tpl_lines, start)
    sec_tpl[name] = tpl_lines[start:close + 1]

# ── 脚本符号块提取（括号平衡，忽略字符串与注释） ──
def split_blocks(ls):
    """把脚本行切成顶层块：每块一个声明（const/function/let/import/注释组）。"""
    blocks = []
    cur = []
    depth = 0
    in_str = None
    i = 0
    while i < len(ls):
        l = ls[i]
        stripped = l.strip()
        is_import = stripped.startswith('import ')
        is_comment = stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*')
        if depth == 0 and (is_import or is_comment):
            cur = [l]
            i += 1
            if is_import:
                # 多行 import：消费到出现 from '...' 为止
                joined = chr(10).join(cur)
                while i < len(ls) and not re.search(r"from\s*['\"]", joined):
                    cur.append(ls[i])
                    joined = chr(10).join(cur)
                    i += 1
            # 注释组/单行 import
            if is_comment:
                while i < len(ls) and (ls[i].strip().startswith('//') or ls[i].strip().startswith('*') or ls[i].strip().startswith('/*') or ls[i].strip() == ''):
                    if ls[i].strip() == '' :
                        break
                    cur.append(ls[i]); i += 1
            blocks.append(('import' if is_import else 'comment', cur))
            continue
        # 声明块
        cur = []
        m = re.match(r'\s*(?:async\s+)?(?:const|let|function|type|interface|enum)\s+([a-zA-Z_$][\w$]*)', l)
        name = m.group(1) if m else None
        depth = 0
        in_str = None
        j = i
        esc = False
        while j < len(ls):
            for ch in ls[j]:
                if in_str:
                    if esc: esc = False
                    elif ch == '\\': esc = True
                    elif ch == in_str: in_str = None
                    continue
                if ch in ('"', "'", '`'): in_str = ch
                elif ch in '{([': depth += 1
                elif ch in '})]': depth -= 1
            cur.append(ls[j])
            j += 1
            if depth <= 0:
                break
        blocks.append(('decl', name, cur))
        i = j
    return blocks


def block_tokens(text):
    return set(re.findall(r'\b([a-zA-Z_$][\w$]*)\b', re.sub(r"'[^']*'|\"[^\"]*\"|`[^`]*`", '', text)))


blocks = split_blocks(script_lines)
decl_blocks = {name: '\n'.join(body) for kind, name, body in [(b[0], b[1] if len(b) > 2 else None, b[-1]) for b in blocks] if kind == 'decl' and name}
import_blocks = ['\n'.join(b[-1]) for b in blocks if b[0] == 'import']
decl_names = set(decl_blocks)

# import 提供的标识符 → import 语句
import_of = {}
for imp in import_blocks:
    for m in re.finditer(r'import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))(?:\s*,\s*\{([^}]*)\})?\s+from', imp):
        names = []
        if m.group(1): names += [x.strip().split(' as ')[-1].strip() for x in m.group(1).split(',')]
        if m.group(2): names.append(m.group(2))
        if m.group(3): names += [x.strip().split(' as ')[-1].strip() for x in m.group(3).split(',')]
        for n in names:
            if n: import_of[n] = imp

# ── 分区模板用到的类名 ──
sec_classes = {}
for name, body in sec_tpl.items():
    cs = set()
    for m in re.finditer(r'class="([^"]+)"', '\n'.join(body)):
        cs |= set(re.sub(r"[{}':]", ' ', m.group(1)).split())
    # 动态 :class 内容也抓标识符
    for m in re.finditer(r':class="([^"]+)"', '\n'.join(body)):
        cs |= set(re.findall(r"'([a-zA-Z][\w-]*)'", m.group(1)))
    sec_classes[name] = cs

# ── 样式子集：顶层块（规则/@media/@keyframes）按类名子串匹配 ──
def split_style(ls):
    chunks = []
    cur = []
    depth = 0
    for l in ls:
        cur.append(l)
        depth += l.count('{') - l.count('}')
        if depth <= 0 and l.strip().endswith('}'):
            chunks.append('\n'.join(cur))
            cur = []
            depth = 0
    if cur: chunks.append('\n'.join(cur))
    return chunks


style_chunks = split_style(style_lines)

# ── 生成子组件 ──
CHILDREN = {
    'appearance': 'SettingsAppearancePanel',
    'extension': 'SettingsExtensionPanel',
    'security': 'SettingsSecurityPanel',
    'data': 'SettingsDataPanel',
    'about': 'SettingsAboutPanel',
}

report = []
for sec, comp in CHILDREN.items():
    tpl_body = '\n'.join(sec_tpl[sec])
    # 去掉根 v-show（由父级 v-show 控制组件）
    tpl_body = re.sub(r'\s*v-show="activeCategory === \'[a-z]+\'"', '', tpl_body, count=1)
    # 根 div class 保留（样式钩子）
    # 注意：不能剥掉双引号内容——@click="selectTheme(...)" 等处理器名恰在引号内
    used = set(re.findall(r'\b([a-zA-Z_$][\w$]*)\b', tpl_body)) & decl_names
    # 传递闭包
    moved = set()
    frontier = set(used)
    while frontier:
        sym = frontier.pop()
        if sym in moved or sym not in decl_blocks: continue
        moved.add(sym)
        for tok in block_tokens(decl_blocks[sym]) & decl_names:
            if tok not in moved: frontier.add(tok)
    script_parts = []
    needed_imports = set()
    for sym in sorted(moved):
        if sym == 'settings':
            continue  # settings 由统一头部声明，避免重复
        block = decl_blocks[sym]
        script_parts.append(block)
        for tok in block_tokens(block):
            if tok in import_of and tok != sym:
                needed_imports.add(import_of[tok])
    # 模板 token 也纳入导入扫描（如模板直接调用 t(...) / useXxxStore()）
    for tok in re.findall(r'\b([a-zA-Z_$][\w$]*)\b', tpl_body):
        if tok in import_of and tok != 'settings':
            needed_imports.add(import_of[tok])
    tpl_classes = set()
    for m in re.finditer(r'class="([^"]+)"', tpl_body):
        tpl_classes |= set(re.sub(r"[{}':]", ' ', m.group(1)).split())
    css_parts = [c for c in style_chunks if any(cl in c for cl in tpl_classes)]
    imports_sorted = sorted(set(needed_imports))
    # settings 头部仅在确实被使用（迁移代码或模板引用）时声明
    settings_used = 'settings' in moved or re.search(r'settings\.', tpl_body)
    vue = (
        '<script setup lang="ts">\n'
        + '\n'.join(imports_sorted)
        + '\n\nconst settings = ' + (
            "useSettingsStore();" if settings_used else 'undefined as never;'
        )
        + '\n\n' + '\n\n'.join(script_parts)
        + '\n</' + 'script>\n\n<template>\n' + tpl_body + '\n</' + 'template>\n\n'
        + '<style scoped>\n' + '\n'.join(css_parts) + '\n</' + 'style>\n'
    )
    if settings_used and "import { useSettingsStore }" not in vue:
        # 在首个 import 后补 useSettingsStore 导入
        vue = re.sub(r"(<script setup lang=\"ts\">\n)", r"\1import { useSettingsStore } from '@/stores/settings';\n", vue, count=1)
    out = f'src/components/settings/{comp}.vue'
    io.open(out, 'w', encoding='utf-8', newline='').write(vue)
    report.append(f'{comp}: symbols={sorted(moved)}, css chunks={len(css_parts)}')

print('\n'.join(report))
