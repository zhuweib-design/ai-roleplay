"""调试 split_blocks 对原版 SettingsView 脚本的解析（一次性）。"""
import io
import re


def split_blocks(ls):
    blocks = []
    cur = []
    depth = 0
    i = 0
    while i < len(ls):
        l = ls[i]
        stripped = l.strip()
        is_import = stripped.startswith('import ')
        is_comment = stripped.startswith('//') or stripped.startswith('/*') or stripped.startswith('*')
        if depth == 0 and (is_import or is_comment):
            cur = [l]
            i += 1
            if is_comment:
                while i < len(ls) and (ls[i].strip().startswith('//') or ls[i].strip().startswith('*') or ls[i].strip().startswith('/*') or ls[i].strip() == ''):
                    if ls[i].strip() == '':
                        break
                    cur.append(ls[i])
                    i += 1
            blocks.append(('import' if is_import else 'comment', cur))
            continue
        cur = [l]
        m = re.match(r'\s*(?:async\s+)?(?:const|let|function)\s+([a-zA-Z_$][\w$]*)', l)
        name = m.group(1) if m else None
        depth = 0
        in_str = None
        j = i
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
        if name == 'selectTheme':
            print('selectTheme block: lines =', len(cur), '| last:', cur[-1][:60] if cur else '')
            # 重放深度轨迹
            d = 0
            ins = None
            esc2 = False
            for k, ln in enumerate(cur):
                for ch in ln:
                    if ins:
                        if esc2:
                            esc2 = False
                        elif ch == '\\':
                            esc2 = True
                        elif ch == ins:
                            ins = None
                        continue
                    if ch in ('"', "'", '`'):
                        ins = ch
                    elif ch in '{([':
                        d += 1
                    elif ch in '})]':
                        d -= 1
                print('  depth after line', k, '=', d, '| in_str =', ins)
    return blocks


s = io.open('artifacts/orig-settings.vue', encoding='utf-8').read()
lines = s.split('\n')
script_start = next(i for i, l in enumerate(lines) if l.strip() == '<script setup lang="ts">')
script_end = next(i for i, l in enumerate(lines) if l.strip() == '</script>')
script_lines = lines[script_start + 1:script_end]
blocks = split_blocks(script_lines)
decl = {b[1]: b[2] for b in blocks if b[0] == 'decl' and b[1]}
print('decl blocks:', len(decl))
st = decl.get('selectTheme')
print('selectTheme lines:', len(st) if st else None)
to = decl.get('themeOptions')
print('themeOptions lines:', len(to) if to else None)
bad = [(n, len(b), b[0].strip()[-1]) for n, b in decl.items()
       if len(b) == 1 and b[0].rstrip().endswith(('{', '[', '('))]
print('suspicious 1-line opener blocks:', bad[:15])
