/**
 * axe-core 审计 helper（Phase G4）
 *
 * 用法：
 *   import { mountAndAudit } from './axe-helper';
 *   import Modal from '@/components/common/Modal.vue';
 *
 *   it('Modal 应通过 axe 无障碍审计', async () => {
 *     const results = await mountAndAudit(Modal, { props: { modelValue: true, title: '标题' } });
 *     expect(results.violations).toHaveLength(0);
 *   });
 */
import axe from 'axe-core';
import { mount, type ComponentMountingOptions } from '@vue/test-utils';
import type { Component } from 'vue';

/**
 * 在 jsdom 环境下禁用需要真实布局/渲染的规则，
 * 仅保留可在 jsdom 中验证的 ARIA / 语义 / 键盘可达性规则。
 *
 * - color-contrast：jsdom 不计算样式，已通过 scripts/check-contrast.mjs 单独验证
 * - region：单组件挂载时缺少完整页面结构，会误报
 * - bypass：skip link 在 App.vue，单组件挂载无意义
 * 其他 page-level 规则（html-has-lang / document-title 等）axe 会自动跳过不适用的。
 */
const axeConfig: axe.RunOptions = {
  rules: {
    'color-contrast': { enabled: false },
    region: { enabled: false },
    bypass: { enabled: false },
  },
};

/**
 * 对已挂载的 DOM 节点运行 axe 审计
 * @param element DOM 节点（必须是已附加到 document 的元素）
 * @returns axe 审计结果
 */
export async function runAxe(element: HTMLElement): Promise<axe.AxeResults> {
  return axe.run(element, axeConfig);
}

/**
 * 挂载 Vue 组件并运行 axe 审计。
 * 组件会附加到 document.body，确保 axe 能找到 DOM。
 * @param component Vue 组件
 * @param options 挂载选项（props/stubs/global 等）
 * @returns axe 审计结果
 */
export async function mountAndAudit<T extends Component>(
  component: T,
  options?: ComponentMountingOptions<T>
): Promise<axe.AxeResults> {
  // 创建一个容器并附加到 body，让 axe 能找到
  const container = document.createElement('div');
  document.body.appendChild(container);

  const wrapper = mount(component, {
    ...options,
    attachTo: container,
  });
  await wrapper.vm.$nextTick();
  const results = await runAxe(container);

  // 清理：销毁组件并移除容器
  wrapper.unmount();
  container.remove();

  return results;
}

/**
 * 挂载使用 <Teleport to="body"> 的组件并审计整个 document.body。
 * 适用于 Modal、Toast 等将内容传送到 body 的组件。
 * @param component Vue 组件
 * @param options 挂载选项
 * @returns axe 审计结果
 */
export async function mountAndAuditBody<T extends Component>(
  component: T,
  options?: ComponentMountingOptions<T>
): Promise<axe.AxeResults> {
  // 创建一个挂载点
  const container = document.createElement('div');
  document.body.appendChild(container);

  const wrapper = mount(component, {
    ...options,
    attachTo: container,
  });
  await wrapper.vm.$nextTick();
  // Teleport 内容已挂到 body，审计整个 body
  const results = await runAxe(document.body);

  wrapper.unmount();
  container.remove();

  return results;
}

/**
 * 格式化违规结果为可读字符串（断言失败时输出）
 */
export function formatViolations(results: axe.AxeResults): string {
  if (results.violations.length === 0) return 'No violations';
  return results.violations
    .map((v) => {
      const nodes = v.nodes
        .map((n) => `    - ${n.target.length > 0 ? n.target.join(', ') : '(no target)'}`)
        .join('\n');
      return `  [${v.id}] ${v.help} (${v.impact})\n    ${v.description}\n${nodes}`;
    })
    .join('\n');
}
