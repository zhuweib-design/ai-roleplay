<script setup lang="ts">
/**
 * 设置 → 外观（装配层）
 *
 * R3-1：原文件 1893 行触顶单文件棘轮，且其中 447 行是死样式——从 SettingsView
 * 拆分时整段搬过来的、模板里根本不存在的选择器（.settings-nav-* / .profile-* /
 * .audit-* / .extension-block 等）。先按"样式有、模板无"机械核对删掉死样式
 * （css-equiv 丢失 63 条全部为死类、误删 0），再把剩下的四个分区拆成子组件：
 *
 *   AppearanceLocaleSection    语言（T-13）
 *   AppearanceThemeSection     主题 + 自定义主题编辑器（F08.4）
 *   AppearanceFontSizeSection  字号 + 实时预览
 *   AppearanceUiCustomSection  界面自定义高级段（F08.2/F08.3 + M8-b 开合记忆出口）
 *
 * 为什么按分区切而不是按"逻辑/样式"切：四个分区之间没有共享状态，各自直接读写
 * settings store，切面是干净的；而基类（.settings-section / .section-header 等）
 * 因为是 scoped，跨不到子组件内部，只能各带一份——这与 R2-4 市场页拆分同一处理。
 */
import AppearanceLocaleSection from './AppearanceLocaleSection.vue';
import AppearanceThemeSection from './AppearanceThemeSection.vue';
import AppearanceFontSizeSection from './AppearanceFontSizeSection.vue';
import AppearanceUiCustomSection from './AppearanceUiCustomSection.vue';
</script>

<template>
  <div>
    <AppearanceLocaleSection />
    <AppearanceThemeSection />
    <AppearanceFontSizeSection />
    <AppearanceUiCustomSection />
  </div>
</template>
