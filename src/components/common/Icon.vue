<script setup lang="ts">
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
