<script setup lang="ts">
import type { UICharacter } from '@/types';

const props = withDefaults(
  defineProps<{
    character: UICharacter;
    size?: number;
  }>(),
  { size: 32 }
);

function avatarStyle(): Record<string, string> {
  if (props.character.avatarType === 'image' && props.character.avatar) {
    return {
      backgroundImage: `url('${props.character.avatar}')`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  }
  return {
    background: `linear-gradient(135deg, ${props.character.gradientFrom || 'var(--tk-cyan-500)'}, ${props.character.gradientTo || 'var(--tk-cyan-700)'})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--on-media)',
    fontFamily: 'var(--font-display)',
    fontWeight: '600',
    fontSize: `${props.size * 0.4}px`,
    // P2-4：文字阴影保证渐变浅端上 initial 对比（WCAG 1.4.3，axe 无法计算渐变）
    textShadow: '0 1px 2px rgba(0,0,0,0.6), 0 0 1px rgba(0,0,0,0.5)',
  };
}

function initial(): string {
  return props.character.initial || props.character.name[0] || '?';
}
</script>

<template>
  <span
    class="avatar"
    :style="{
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: 'var(--radius-pill)',
      border: '1px solid var(--border)',
      flexShrink: '0',
      ...avatarStyle(),
    }"
  >
    <template v-if="character.avatarType !== 'image'">{{ initial() }}</template>
  </span>
</template>
