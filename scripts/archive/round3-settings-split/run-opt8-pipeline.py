"""第三轮优化项 8 全管线：还原原文件 → S1 toast 迁移 → 拆分子组件 → 主文件重写 → 收尾。

前置：scripts/split-settings-view.py / rewrite-settings-main.py / apply-s1-toast.py /
post-split-fixups.py 均已存在；src/utils/toast-service.ts 与 master-password-modal-state.ts 已就位。
"""
import subprocess

steps = [
    ['git', 'show', 'HEAD:src/views/SettingsView.vue'],
]


def run(cmd):
    use_shell = isinstance(cmd, str)
    r = subprocess.run(cmd, shell=use_shell, capture_output=True, text=True,
                       encoding='utf-8', errors='replace')
    if r.returncode != 0:
        print('FAILED:', cmd, r.stderr[:500])
        raise SystemExit(1)
    return r.stdout


blob = run(['git', 'show', 'HEAD:src/views/SettingsView.vue'])
io = open('src/views/SettingsView.vue', 'w', encoding='utf-8', newline='')
io.write(blob)
io.close()
print('restored from HEAD')

run('python scripts/apply-s1-toast.py')
run('python scripts/split-settings-view.py')
run('python scripts/rewrite-settings-main.py')
run('python scripts/post-split-fixups.py')
print('pipeline done')
