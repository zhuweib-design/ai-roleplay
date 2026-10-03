"""第三轮优化项 8：把 SettingsView.vue 主文件重写为布局容器（一次性脚本）。

从原文件提取：aside 导航 + model 区（上下文长度设置）+ 主文件保留符号
（导航/分类/上下文长度，含传递闭包），5 个分区替换为子组件标签。
样式块原样保留（子组件已有各自样式子集，父级 scoped 仍作用于子组件根元素）。
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
style_block = '\n'.join(lines[style_start:style_end + 1])


def split_blocks(ls):
    blocks = []
    cur = []
    depth = 0
    i = 0
    while i < len(ls):
        l = ls[i]
        stripped = l.strip()
        if depth == 0 and (stripped.startswith('import ') or stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*')):
            cur = [l]
            i += 1
            if stripped.startswith('import '):
                # 多行 import：消费到出现 from '...' 为止
                joined = chr(10).join(cur)
                while i < len(ls) and not re.search(r"from\s*['\"]", joined):
                    cur.append(ls[i])
                    joined = chr(10).join(cur)
                    i += 1
            else:
                while i < len(ls) and (ls[i].strip().startswith('//') or ls[i].strip().startswith('*') or ls[i].strip().startswith('/*')):
                    if ls[i].strip() == '':
                        break
                    cur.append(ls[i])
                    i += 1
            blocks.append(('import' if stripped.startswith('import ') else 'comment', None, cur))
            continue
        cur = []
        m = re.match(r'\s*(?:async\s+)?(?:const|let|function|type|interface|enum)\s+([a-zA-Z_$][\w$]*)', l)
        name = m.group(1) if m else None
        depth = 0
        j = i
        in_str = None
        esc = False
        while j < len(ls):
            for ch in ls[j]:
                if in_str:
                    if esc:
                        esc = False
                    elif ch == '\\':
                        esc = True
                    elif ch == in_str:
                        in_str = None
                    continue
                if ch in ('"', "'", '`'):
                    in_str = ch
                elif ch in '{([':
                    depth += 1
                elif ch in '})]':
                    depth -= 1
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
decl_blocks = {b[1]: '\n'.join(b[2]) for b in blocks if b[0] == 'decl' and b[1]}
import_blocks = ['\n'.join(b[2]) for b in blocks
                 if any('import ' in x for x in b[2]) and "from" in '\n'.join(b[2])]
import_of = {}
for imp in import_blocks:
    for m in re.finditer(r'import\s+(?:type\s+)?(?:\{([^}]*)\}|(\w+))(?:\s*,\s*\{([^}]*)\})?\s+from', imp):
        names = []
        if m.group(1):
            names += [x.strip().split(' as ')[-1].strip() for x in m.group(1).split(',')]
        if m.group(2):
            names.append(m.group(2))
        if m.group(3):
            names += [x.strip().split(' as ')[-1].strip() for x in m.group(3).split(',')]
        for n in names:
            if n:
                import_of[n] = imp

KEEP = {
    'settings', 'settingsCategories', 'activeCategory', 'activeCategoryDesc',
    'selectCategory', 'handleCategoryKeydown', 'CONTEXT_PRESETS', 'applyContextPreset',
    'contextBudget', 'contextLengthError', 'formatTokenCount', 'onMaxContextInput',
    'onReservedInput',
}
moved = set()
frontier = set(KEEP)
while frontier:
    sym = frontier.pop()
    if sym in moved or sym not in decl_blocks:
        continue
    moved.add(sym)
    for tok in block_tokens(decl_blocks[sym]):
        if tok in decl_blocks and tok not in moved:
            frontier.add(tok)

needed_imports = set()
for sym in moved:
    for tok in block_tokens(decl_blocks[sym]):
        if tok in import_of:
            needed_imports.add(import_of[tok])
needed_imports.add(import_of.get('useSettingsStore', ''))

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


model_start = sections['model']
model_close = div_close(tpl_lines, model_start)
aside_start = next(i for i, l in enumerate(tpl_lines) if l.strip().startswith('<aside'))
# 保留 aside 导航 + 分类头（标题/副标题，含 activeCategoryDesc）——至首个分区（appearance）前
appearance_start = sections['appearance']
# 头部 = 模板开头（根 div + settings-body 开标签 + aside 导航 + 分类头）至首个分区前
head_tpl = '\n'.join(tpl_lines[0:appearance_start])
model_sec = '\n'.join(tpl_lines[model_start:model_close + 1])
# 模板 token 也纳入导入扫描（组件标签 / t(...) 等）；此时 aside_start 等已就绪
tpl_head_and_model = '\n'.join(tpl_lines[aside_start:model_close + 1])
for tok in re.findall(r'\b([A-Za-z][\w$]*)\b', tpl_head_and_model):
    if tok in import_of:
        needed_imports.add(import_of[tok])
needed_imports = sorted(x for x in needed_imports if x)

about_start = sections['about']
about_close = div_close(tpl_lines, about_start)
# 尾部闭合标签（settings-body / 根 div 等）；排除原模板自身的 </template>（由本脚本重写）
tail_tpl = '\n'.join(l for l in tpl_lines[about_close + 1:] if l.strip() != '</template>')

new_tpl = (
    head_tpl + '\n\n'
    + '    <!-- S2-S6（ROUND_3_HIGH_RISK_SPLIT_DESIGN）：各分区拆分为子组件；v-show 保留草稿状态 -->\n'
    + "    <SettingsAppearancePanel v-show=\"activeCategory === 'appearance'\" />\n\n"
    + model_sec + '\n\n'
    + "    <SettingsExtensionPanel v-show=\"activeCategory === 'extension'\" />\n\n"
    + "    <SettingsSecurityPanel v-show=\"activeCategory === 'security'\" />\n\n"
    + "    <SettingsDataPanel v-show=\"activeCategory === 'data'\" />\n\n"
    + "    <SettingsAboutPanel v-show=\"activeCategory === 'about'\" />\n"
    + tail_tpl
)

new_script = '\n'.join(needed_imports) + '\n\n' + '\n\n'.join(decl_blocks[sym] for sym in sorted(moved))
imports_for_components = """import SettingsAppearancePanel from '@/components/settings/SettingsAppearancePanel.vue';
import SettingsExtensionPanel from '@/components/settings/SettingsExtensionPanel.vue';
import SettingsSecurityPanel from '@/components/settings/SettingsSecurityPanel.vue';
import SettingsDataPanel from '@/components/settings/SettingsDataPanel.vue';
import SettingsAboutPanel from '@/components/settings/SettingsAboutPanel.vue';"""
new_script = new_script + '\n' + imports_for_components

out = (
    '<script setup lang="ts">\n' + new_script + '\n</script>\n\n'
    + '<template>\n' + new_tpl + '\n</template>\n\n'
    + style_block + '\n'
)
io.open(SRC, 'w', encoding='utf-8', newline='').write(out)
print('main file rewritten; kept symbols:', sorted(moved))
