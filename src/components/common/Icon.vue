<script setup lang="ts">
/* eslint-disable vue/no-v-html -- getIconPath 仅返回固定白名单路径(PATHS: Record<IconName,string>), 不含任何用户输入, v-html 安全 */
import { getIconPath, type IconName } from './icons';

withDefaults(
  defineProps<{
    name: IconName;
    size?: number;
  }>(),
  { size: 16 }
);
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="getIconPath(name)"
  />
</template>
