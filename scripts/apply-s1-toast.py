"""第三轮优化项 8 S1：把 SettingsView 的本地 Toast 迁移到全局服务（幂等）。"""
import io

def patch(path, repls):
    s = io.open(path, encoding='utf-8').read()
    changed = False
    for old, new in repls:
        if old in s and (new == '' or new not in s):
            s = s.replace(old, new, 1)
            changed = True
    if changed:
        io.open(path, 'w', encoding='utf-8', newline='').write(s)
    print('patched' if changed else 'skip', path)


patch('src/views/SettingsView.vue', [
    ("import Toast from '@/components/common/Toast.vue';\n",
     "import { showToast } from '@/utils/toast-service';\n"),
    ("""const toastOpen = ref(false);
const toastType = ref<'info' | 'success' | 'error'>('info');
const toastMessage = ref('');

function showToast(type: 'info' | 'success' | 'error', message: string) {
  toastType.value = type;
  toastMessage.value = message;
  toastOpen.value = true;
}
""",
     ""),
    ("""    <Toast
      v-model="toastOpen"
      :type="toastType"
      :message="toastMessage"
    />
""", ""),
])
