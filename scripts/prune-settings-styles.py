"""第三轮优化项 8 S7：裁剪 SettingsView 父级 scoped 样式。

拆分后父模板仅剩：导航/头部 + model 区 + 子组件标签。父级 scoped 规则只对
自身模板与子组件根元素生效，因此：
- 保留：选择器含主模板实际类名的规则；含 :deep( 的规则（穿透面板内部）；@keyframes
- 删除：其余死规则（已随分区迁入子组件的 scoped 样式）
"""
import io
import re

SRC = 'src/views/SettingsView.vue'
s = io.open(SRC, encoding='utf-8').read()
lines = s.split('\n')
style_start = next(i for i, l in enumerate(lines) if l.startswith('<style scoped>'))
style_end = next(i for i, l in enumerate(lines) if l.strip() == '</style>')
style_lines = lines[style_start + 1:style_end]

# 主模板 = <template> 到 </template>（父级自身标记）
tpl_start = next(i for i, l in enumerate(lines) if l.strip() == '<template>')
tpl_end = next(i for i, l in enumerate(lines) if l.strip() == '</template>')
tpl = '\n'.join(lines[tpl_start + 1:tpl_end])
tpl_classes = set()
for m in re.finditer(r'class="([^"]+)"', tpl):
    tpl_classes |= set(re.sub(r"[{}':]", ' ', m.group(1)).split())

# 切顶层块（规则 / @media / @keyframes / 注释组）
chunks = []
cur = []
depth = 0
for l in style_lines:
    cur.append(l)
    depth += l.count('{') - l.count('}')
    if depth <= 0 and l.strip().endswith('}'):
        chunks.append('\n'.join(cur))
        cur = []
        depth = 0
if cur:
    chunks.append('\n'.join(cur))

kept, dropped = [], []
for c in chunks:
    header = c.split('{', 1)[0]
    if ':deep(' in c or '@keyframes' in c or 'keyframes' in header:
        kept.append(c)
        continue
    if any(cl in c for cl in tpl_classes):
        kept.append(c)
    else:
        dropped.append(c)

print(f'style chunks: {len(chunks)} kept={len(kept)} dropped={len(dropped)}')
new_style = '\n'.join(kept)
new_lines = lines[:style_start + 1] + new_style.split('\n') + lines[style_end:]
io.open(SRC, 'w', encoding='utf-8', newline='').write('\n'.join(new_lines))
print('pruned; new file lines:', len(new_lines))
