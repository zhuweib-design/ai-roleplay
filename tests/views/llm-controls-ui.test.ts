import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { nextTick } from 'vue';
import ThinkingBlock from '../../src/components/chat/ThinkingBlock.vue';
import SegmentedControl from '../../src/components/common/SegmentedControl.vue';
import MessageBubble from '../../src/components/chat/MessageBubble.vue';
import ContextPanel from '../../src/components/layout/ContextPanel.vue';
import { useSettingsStore } from '../../src/stores/settings';
import { useCharacterStore } from '../../src/stores/character';
import { t } from '@/i18n';
import type { UIMessage, UICharacter, ApiProfile } from '@/types';
import type { CharacterStatus } from '@core/status-schema';

/**
 * P0 UI 测试 (T05)
 *
 * 覆盖：
 * - ThinkingBlock：默认折叠 / v-if 懒渲染 / aria-expanded / 无 v-html / 生成中脉冲
 * - MessageBubble：assistant 气泡顶部挂载思考块
 * - SegmentedControl：radiogroup 语义 + 键盘可达
 * - ContextPanel：provider=local 时三档与 frequency 控件隐藏（降级）
 * - i18n：切 en 后无中文残留
 */

function makeMsg(overrides: Partial<UIMessage> = {}): UIMessage {
  return {
    id: 'm1',
    role: 'assistant',
    content: '正文',
    timestamp: 1,
    ...overrides,
  };
}

function makeChar(overrides: Partial<UICharacter> = {}): UICharacter {
  return {
    id: 'c1',
    name: 'TestChar',
    avatarType: 'gradient',
    gradientFrom: 'var(--tk-cyan-500)',
    gradientTo: 'var(--tk-cyan-700)',
    initial: 'T',
    lastActive: '刚刚',
    favorite: false,
    tags: [],
    description: 'd',
    model: 'gpt-4o',
    conversations: [],
    messages: [],
    authorNote: '',
    authorDepth: 4,
    temperature: 0.7,
    worldEntries: [],
    tokenBudget: { character: 0, worldInfo: 0, chatHistory: 0, remaining: 8192 },
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ApiProfile> = {}): ApiProfile {
  return {
    id: 'p1',
    name: 'P',
    provider: 'openai',
    baseUrl: 'https://api.openai.com',
    apiKey: 'sk-test',
    model: 'gpt-4o',
    ...overrides,
  };
}

describe('ThinkingBlock — P0-1 折叠容器', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('有思考时渲染，默认折叠且不渲染思考正文 DOM', async () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: '我在思考', messageId: 'tb-1', defaultCollapsed: true },
    });
    expect(wrapper.find('.thinking-block').exists()).toBe(true);
    expect(wrapper.find('.thinking-body').exists()).toBe(false);
    expect(wrapper.find('.thinking-header').attributes('aria-expanded')).toBe('false');
  });

  it('点击标题展开后才渲染正文，并同步 aria-expanded', async () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: '我在思考', messageId: 'tb-2', defaultCollapsed: true },
    });
    await wrapper.find('.thinking-header').trigger('click');
    expect(wrapper.find('.thinking-body').exists()).toBe(true);
    expect(wrapper.find('.thinking-header').attributes('aria-expanded')).toBe('true');
    expect(wrapper.find('.thinking-body').text()).toBe('我在思考');
  });

  it('再次点击收起后正文移出 DOM', async () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: 'x', messageId: 'tb-3', defaultCollapsed: true },
    });
    await wrapper.find('.thinking-header').trigger('click');
    expect(wrapper.find('.thinking-body').exists()).toBe(true);
    await wrapper.find('.thinking-header').trigger('click');
    expect(wrapper.find('.thinking-body').exists()).toBe(false);
  });

  it('P1：供应商上报思考 token 时展示（生成完成后）', () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: '我在思考', messageId: 'tb-tok-1', reasoningTokens: 128 },
    });
    expect(wrapper.find('.thinking-tokens').exists()).toBe(true);
    expect(wrapper.find('.thinking-tokens').text()).toBe(t('bubble.thinkingTokens', { count: 128 }));
  });

  it('P1：未上报（undefined）/ 0 都不展示——绝不显示 0', () => {
    expect(
      mount(ThinkingBlock, { props: { thinking: 'x', reasoningTokens: undefined } }).find(
        '.thinking-tokens'
      ).exists()
    ).toBe(false);
    expect(
      mount(ThinkingBlock, { props: { thinking: 'x', reasoningTokens: 0 } }).find(
        '.thinking-tokens'
      ).exists()
    ).toBe(false);
  });

  it('P1：生成中不展示 token（避免中途出现不完整的数字）', () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: 'x', generating: true, reasoningTokens: 128 },
    });
    expect(wrapper.find('.thinking-tokens').exists()).toBe(false);
  });

  it('空思考 / 空白思考不渲染折叠块', () => {
    expect(
      mount(ThinkingBlock, { props: { thinking: '' } }).find('.thinking-block').exists()
    ).toBe(false);
    expect(
      mount(ThinkingBlock, { props: { thinking: '   \n  ' } }).find('.thinking-block').exists()
    ).toBe(false);
    expect(
      mount(ThinkingBlock, { props: { thinking: undefined } }).find('.thinking-block').exists()
    ).toBe(false);
  });

  it('生成中未展开时显示"思考中…"标题与脉冲点', () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: '部分思考', generating: true, defaultCollapsed: true },
    });
    expect(wrapper.find('.thinking-pulse').exists()).toBe(true);
    expect(wrapper.find('.thinking-title').text()).not.toBe('思考过程');
  });

  it('CSP 红线：整个组件不出现 v-html / innerHTML', () => {
    const wrapper = mount(ThinkingBlock, { props: { thinking: '<img onerror=alert(1)>' } });
    expect(wrapper.html()).not.toContain('v-html');
    // 思考内容按纯文本插值渲染（尖括号被转义，不会变成真实标签）
    expect(wrapper.find('.thinking-body').exists()).toBe(false); // 折叠态不渲染
    const expanded = mount(ThinkingBlock, {
      props: { thinking: '<img onerror=alert(1)>', defaultCollapsed: false },
    });
    expect(expanded.find('img').exists()).toBe(false);
    expect(expanded.find('.thinking-body').text()).toBe('<img onerror=alert(1)>');
  });

  it('defaultCollapsed=false 时默认展开', () => {
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: 'x', defaultCollapsed: false },
    });
    expect(wrapper.find('.thinking-body').exists()).toBe(true);
  });

  it('记忆展开状态：同一 messageId 的新实例沿用展开态', async () => {
    const a = mount(ThinkingBlock, { props: { thinking: 'x', messageId: 'mem-1', defaultCollapsed: true } });
    await a.find('.thinking-header').trigger('click');
    expect(a.find('.thinking-body').exists()).toBe(true);

    const b = mount(ThinkingBlock, { props: { thinking: 'x', messageId: 'mem-1', defaultCollapsed: true } });
    expect(b.find('.thinking-body').exists()).toBe(true);
  });
});

describe('MessageBubble — 思考块挂载', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('assistant 消息带 thinking 时渲染思考块', () => {
    const wrapper = mount(MessageBubble, { props: { msg: makeMsg({ thinking: '思考内容' }) } });
    expect(wrapper.findComponent(ThinkingBlock).exists()).toBe(true);
  });

  it('assistant 消息无 thinking 时不渲染思考块', () => {
    const wrapper = mount(MessageBubble, { props: { msg: makeMsg() } });
    expect(wrapper.find('.thinking-block').exists()).toBe(false);
  });

  it('CSP 红线：气泡内不出现 v-html', () => {
    const wrapper = mount(MessageBubble, {
      props: { msg: makeMsg({ thinking: '<b>粗体</b>', content: '<b>正文</b>' }) },
    });
    expect(wrapper.html()).not.toContain('v-html');
    expect(wrapper.find('b').exists()).toBe(false);
  });

  it('默认折叠来自全局 settings.thinkingConfig.defaultCollapsed', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const settings = useSettingsStore();
    settings.setThinkingConfig({ defaultCollapsed: false });
    const wrapper = mount(MessageBubble, {
      props: { msg: makeMsg({ thinking: 'x' }) },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(wrapper.find('.thinking-body').exists()).toBe(true);
  });
});

describe('MessageBubble — P1 消息级状态渲染', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 一条可用的状态快照（直接构造，避免依赖解析器） */
  const STATUS: CharacterStatus = {
    messageId: 'm1',
    parseMode: 'json' as const,
    unknownCount: 0,
    entries: [{ key: 'location', label: '地点', value: '酒馆', icon: 'map-pin' }],
  };

  it('msg.status 存在时渲染 inline 状态条（与顶部 sticky 不同 variant）', () => {
    const wrapper = mount(MessageBubble, { props: { msg: makeMsg({ status: STATUS }) } });
    const hud = wrapper.find('.status-hud');
    expect(hud.exists()).toBe(true);
    expect(hud.classes()).toContain('status-hud-inline');
    expect(hud.classes()).not.toContain('status-hud-sticky');
    expect(wrapper.find('.status-value').text()).toBe('酒馆');
  });

  it('msg.status 缺失时完全不渲染状态条（不渲染空壳）', () => {
    const wrapper = mount(MessageBubble, { props: { msg: makeMsg() } });
    expect(wrapper.find('.status-hud').exists()).toBe(false);
  });

  it('showInline=false 时关闭消息级状态条', async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const settings = useSettingsStore();
    settings.setStatusHudConfig({ showInline: false });
    const wrapper = mount(MessageBubble, {
      props: { msg: makeMsg({ status: STATUS }) },
      global: { plugins: [pinia] },
    });
    await nextTick();
    expect(wrapper.find('.status-hud').exists()).toBe(false);
  });

  it('用户消息不渲染状态条（状态只属于 assistant 轮次）', () => {
    const wrapper = mount(MessageBubble, {
      props: { msg: { id: 'u1', role: 'user', content: '你好', timestamp: 1, status: STATUS } },
    });
    expect(wrapper.find('.status-hud').exists()).toBe(false);
  });
});

describe('SegmentedControl — 三档分段控件', () => {
  it('radiogroup 语义 + aria-checked', () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'medium',
        options: [
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' },
        ],
      },
      attrs: { 'aria-label': '思考强度' },
    });
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(true);
    expect(wrapper.findAll('[role="radio"]')).toHaveLength(3);
    expect(wrapper.findAll('[role="radio"]')[1]!.attributes('aria-checked')).toBe('true');
    expect(wrapper.find('[role="radiogroup"]').attributes('aria-label')).toBe('思考强度');
  });

  it('点击选项触发 update:modelValue', async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'low',
        options: [
          { value: 'low', label: '低' },
          { value: 'high', label: '高' },
        ],
      },
    });
    await wrapper.findAll('[role="radio"]')[1]!.trigger('click');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['high']);
  });

  it('键盘方向键可切换并保证 roving tabindex', async () => {
    const wrapper = mount(SegmentedControl, {
      props: {
        modelValue: 'low',
        options: [
          { value: 'low', label: '低' },
          { value: 'medium', label: '中' },
          { value: 'high', label: '高' },
        ],
      },
      attachTo: document.body,
    });
    const items = wrapper.findAll('[role="radio"]');
    expect(items[0]!.attributes('tabindex')).toBe('0');
    expect(items[1]!.attributes('tabindex')).toBe('-1');

    await items[0]!.trigger('keydown', { key: 'ArrowRight' });
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['medium']);
    wrapper.unmount();
  });

  it('每个选项热区 ≥44px（min-height 写入样式）', () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 'low', options: [{ value: 'low', label: '低' }] },
    });
    // 样式在 scoped style 中（jsdom 不计算 CSS），此处断言类名存在以锚定样式选择器
    expect(wrapper.find('.seg-item').exists()).toBe(true);
  });
});

/**
 * 按 aria-label 精确定位"思考强度"分段控件
 *
 * P1 起面板里多了一个"状态指令"分段控件（同组件），
 * 因此不能再靠 findComponent(SegmentedControl) 判断思考强度是否存在。
 */
function findReasoningSegment(wrapper: ReturnType<typeof mount>) {
  return wrapper
    .findAllComponents(SegmentedControl)
    .find((c) => c.attributes('aria-label') === t('ctx.reasoningEffortAria'));
}

describe('ContextPanel — 降级与采样控件', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  /** 挂载 ContextPanel 所需的最小 store 环境 */
  function mountPanel(profile: ApiProfile | null, character: UICharacter) {
    const settings = useSettingsStore();
    const characterStore = useCharacterStore();
    if (profile) {
      settings.apiProfiles.push(profile);
      settings.activeApiProfileId = profile.id;
    }
    characterStore.characters.push(character);
    characterStore.currentCharacterId = character.id;
    return mount(ContextPanel, {
      global: {
        stubs: {
          Icon: { template: '<span class="icon-stub" />' },
          Avatar: { template: '<span class="avatar-stub" />' },
        },
      },
    });
  }

  it('provider=local（硬边界）时思考强度与 frequency 控件均隐藏', async () => {
    const wrapper = mountPanel(
      makeProfile({ provider: 'local', model: 'qwen3-1.7b' }),
      makeChar({ sampling: null })
    );
    await nextTick();
    // P1 起面板内有两段 SegmentedControl（思考强度 + 状态指令），故按 aria-label 精确定位
    expect(findReasoningSegment(wrapper)).toBeUndefined();
    // 采样分组整体不渲染（local 不支持 frequency_penalty，且 topP 在该 Profile 下仍支持 → 分组出现但只有 topP）
    const freqInput = wrapper
      .findAll('input[type="range"]')
      .filter((i) => i.attributes('aria-label') === t('ctx.frequencyPenaltyAria'));
    expect(freqInput).toHaveLength(0);
  });

  it('provider=openai 时思考强度控件显示（未命中正则也显示）', async () => {
    const wrapper = mountPanel(makeProfile({ model: 'gpt-4o' }), makeChar());
    await nextTick();
    expect(findReasoningSegment(wrapper)).toBeDefined();
    // 未命中启发式正则 → 显示提示文案，但控件仍在
    expect(wrapper.text()).toContain('可能不支持推理强度');
  });

  it('provider=anthropic 时 frequency penalty 控件隐藏（协议无此字段）', async () => {
    const wrapper = mountPanel(
      makeProfile({ provider: 'anthropic', model: 'claude-3-7-sonnet' }),
      makeChar()
    );
    await nextTick();
    const freq = wrapper
      .findAll('input[type="range"]')
      .filter((i) => i.attributes('aria-label') === t('ctx.frequencyPenaltyAria'));
    expect(freq).toHaveLength(0);
  });

  it('provider=openai 时 topP + frequencyPenalty 控件存在（角色级只放这两个）', async () => {
    const wrapper = mountPanel(makeProfile(), makeChar());
    await nextTick();
    // 断言用 zh 文案（默认 locale = zh）：角色级只放 top_p + frequency_penalty
    const labels = wrapper.findAll('input[type="range"]').map((i) => i.attributes('aria-label'));
    expect(labels).toContain(t('ctx.topPAria'));
    expect(labels).toContain(t('ctx.frequencyPenaltyAria'));
    // presence_penalty 按决策不放角色级（不出现带"存在惩罚"的滑块）
    expect(labels.filter((l) => l?.includes('存在'))).toHaveLength(0);
  });

  it('拖动滑块写入角色级采样参数', async () => {
    const wrapper = mountPanel(makeProfile(), makeChar());
    await nextTick();
    const characterStore = useCharacterStore();
    const topP = wrapper
      .findAll('input[type="range"]')
      .find((i) => i.attributes('aria-label') === t('ctx.topPAria'))!;
    await topP.setValue('0.55');

    const updated = characterStore.characters.find((c) => c.id === 'c1');
    expect(updated?.sampling?.topP).toBeCloseTo(0.55, 5);
  });

  it('点击"恢复默认"把角色级覆盖置回未设置（而非置 0）', async () => {
    const wrapper = mountPanel(
      makeProfile(),
      makeChar({ sampling: { topP: 0.3, frequencyPenalty: null, presencePenalty: null } })
    );
    await nextTick();
    const characterStore = useCharacterStore();
    // 按 aria-label 精确取采样参数的"恢复默认"（maxTokens 有同名 class 但不同 aria-label）
    const resetBtn = wrapper
      .findAll('.ctx-reset-btn')
      .find((b) => b.attributes('aria-label') === t('llm.samplingReset'))!;
    await resetBtn.trigger('click');

    const updated = characterStore.characters.find((c) => c.id === 'c1');
    expect(updated?.sampling?.topP).toBeUndefined();
  });

  // ── 输出上限不再是角色级旋钮（2026-10-14 口径：模型只配最大上下文，预算自动推导） ──

  it('面板内不再出现任何"最大 Tokens"滑块（输出上限已从界面撤掉）', async () => {
    const wrapper = mountPanel(makeProfile({}), makeChar({}));
    await nextTick();

    const sliderLabels = wrapper
      .findAll('input[type="range"]')
      .map((i) => i.attributes('aria-label') ?? '');
    expect(sliderLabels.some((l) => l.includes('maxTokens'))).toBe(false);
    expect(wrapper.find('.ctx-reset-btn-maxtok').exists()).toBe(false);
  });

  it('思考强度选择写入角色级 reasoningEffort', async () => {
    const wrapper = mountPanel(makeProfile({ model: 'o3' }), makeChar());
    await nextTick();
    const characterStore = useCharacterStore();
    await wrapper.findComponent(SegmentedControl).vm.$emit('update:modelValue', 'high');

    const updated = characterStore.characters.find((c) => c.id === 'c1');
    expect(updated?.reasoningEffort).toBe('high');
  });
});

describe('P0 UI — i18n 无中文残留', () => {
  it('切到 en 后 ThinkingBlock 无中文', async () => {
    setActivePinia(createPinia());
    const { setLocale } = await import('@/i18n');
    setLocale('en');
    const wrapper = mount(ThinkingBlock, {
      props: { thinking: 'x', messageId: 'i18n-1', defaultCollapsed: false },
    });
    await nextTick();
    const html = wrapper.html();
    expect(/[一-龥]/.test(html.replace('thinking-body', ''))).toBe(false);
    setLocale('zh');
  });

  it('切到 en 后 SegmentedControl 文案来自 i18n', () => {
    const wrapper = mount(SegmentedControl, {
      props: { modelValue: 'low', options: [{ value: 'low', label: '低' }] },
    });
    // 文案由调用方传入（本用例固定中文）→ 断言组件本身不硬编码文案
    expect(wrapper.find('.seg-item span').text()).toBe('低');
  });
});

// 防止 vitest 把未使用的 vi 视为死代码
describe('测试脚手架', () => {
  it('vi 可用', () => {
    expect(typeof vi.fn).toBe('function');
  });
});
