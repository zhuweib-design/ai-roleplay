<script setup lang="ts">
/**
 * 上下文面板 · Virtual Character OS 的 Runtime 最小状态查看与回放自检（R2-3 从 ContextPanel 拆出）
 *
 * 只是给 RuntimeStatePanel 套一层 section 外壳，标题与容器样式由宿主提供。
 */
import RuntimeStatePanel from '@/components/chat/RuntimeStatePanel.vue';
import { useContextPanel } from '@/composables/useContextPanel';
import { t } from '@/i18n';

const { char } = useContextPanel();
</script>

<template>
  <section class="ctx-section" aria-labelledby="ctx-runtime-title">
    <header class="ctx-section-header">
      <span id="ctx-runtime-title" class="ctx-section-title">{{ t('runtime.title') }}</span>
    </header>
    <!-- RuntimeStatePanel 的 character 是必填 prop：没有当前角色时整段不渲染，
         否则空安装下打开上下文面板会抛 prop 类型告警（2026-10-26 角色库改为从空开始） -->
    <RuntimeStatePanel v-if="char" :character="char" />
  </section>
</template>
