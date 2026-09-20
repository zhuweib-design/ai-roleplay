import { describe, it, expect } from 'vitest';
import { getIconPath } from '@/components/common/icons';
import {
  STATUS_FIELD_REGISTRY,
  STATUS_ICON_NAMES,
  STATUS_MAX_FIELDS,
  STATUS_STACK_THRESHOLD,
  STATUS_VALUE_MAX_LEN,
  DEFAULT_STATUS_HUD_CONFIG,
  isStatusIconName,
  isStatusValueType,
  findRegistryPreset,
  normalizeKey,
  normalizeStatusHudConfig,
  normalizeStatusSchema,
  type StatusIconName,
} from '@core/status-schema';

/**
 * P1 状态 schema 契约测试 (T01)
 *
 * 覆盖：
 * - 图标白名单防漂移：每个 registry 图标在 icons.ts 的 PATHS 里都有实际路径
 * - 内置 8 字段的 key/i18nKey/type 契约（源码零中文）
 * - normalizeKey 归一化规则（不含任何语言特判）
 * - normalizeStatusSchema 的 fail-open 校验
 */

describe('STATUS_FIELD_REGISTRY — 内置字段表', () => {
  it('共 8 项，key 与 i18nKey 一一对应且均为 ASCII', () => {
    expect(STATUS_FIELD_REGISTRY).toHaveLength(8);
    for (const p of STATUS_FIELD_REGISTRY) {
      expect(p.key).toMatch(/^[a-z]+$/);
      expect(p.i18nKey).toBe(`status.field.${p.key}`);
      // 源码零中文：key / i18nKey / icon / type 全部不得含 CJK
      expect(/[一-龥]/.test(p.key + p.i18nKey + (p.icon ?? '') + p.type)).toBe(false);
    }
  });

  it('配了图标的字段，其图标都在 icons.ts 白名单里有实际路径（防改名后静默降级为空白）', () => {
    for (const p of STATUS_FIELD_REGISTRY) {
      if (!p.icon) continue;
      expect(getIconPath(p.icon), `icon=${p.icon}`).not.toBe('');
    }
  });

  it('registry 里用到的图标全部落在 StatusIconName 白名单内（防越界常量）', () => {
    const used = STATUS_FIELD_REGISTRY.map((p) => p.icon).filter((i): i is StatusIconName => !!i);
    for (const icon of used) {
      expect(STATUS_ICON_NAMES).toContain(icon);
    }
    expect(new Set(used).size).toBe(used.length); // 图标不重复
  });

  it('mood 刻意不配图标（白名单无情绪类图标，宁缺勿滥）', () => {
    expect(findRegistryPreset('mood')?.icon).toBeUndefined();
  });

  it('thought 用 chat-circle 而非 brain（brain 已归 P0 思维链，避免视觉混淆）', () => {
    expect(findRegistryPreset('thought')?.icon).toBe('chat-circle');
  });

  it('registry 顺序为设计约定的语义顺序（地点/时间/好感/身份/关系/心情/想法/持有）', () => {
    expect(STATUS_FIELD_REGISTRY.map((p) => p.key)).toEqual([
      'location',
      'time',
      'affection',
      'identity',
      'relationship',
      'mood',
      'thought',
      'inventory',
    ]);
  });
});

describe('常量默认值', () => {
  it('注入默认关闭，解析/渲染默认开启（决策 1：不默认改变模型行为）', () => {
    expect(DEFAULT_STATUS_HUD_CONFIG.enabled).toBe(false);
    expect(DEFAULT_STATUS_HUD_CONFIG.showSticky).toBe(true);
    expect(DEFAULT_STATUS_HUD_CONFIG.showInline).toBe(true);
  });

  it('值上限 200 / 字段上限 12 / 竖排阈值 24', () => {
    expect(STATUS_VALUE_MAX_LEN).toBe(200);
    expect(STATUS_MAX_FIELDS).toBe(12);
    expect(STATUS_STACK_THRESHOLD).toBe(24);
  });
});

describe('normalizeKey — 归一化（不得含语言特判）', () => {
  it('trim + 小写 + 去空白/下划线/连字符/冒号（含全角）', () => {
    expect(normalizeKey('Location')).toBe('location');
    expect(normalizeKey('LOCATION')).toBe('location');
    expect(normalizeKey('  location  ')).toBe('location');
    expect(normalizeKey('current_location')).toBe('currentlocation');
    expect(normalizeKey('current-location')).toBe('currentlocation');
    expect(normalizeKey('Current Location')).toBe('currentlocation');
    expect(normalizeKey('location：')).toBe('location');
    expect(normalizeKey('affection:')).toBe('affection');
  });

  it('非英文 key 原样保留字符（不做翻译、不做词表匹配）', () => {
    // 明确取舍：中文 key 不命中内置表，但也不被吞掉（原样透传为展示名）
    expect(normalizeKey('地点')).toBe('地点');
  });
});

describe('类型守卫', () => {
  it('isStatusIconName 只认白名单内的图标名', () => {
    expect(isStatusIconName('map-pin')).toBe(true);
    expect(isStatusIconName('brain')).toBe(false);
    expect(isStatusIconName(undefined)).toBe(false);
    expect(isStatusIconName(42)).toBe(false);
  });

  it('isStatusValueType 只认 string/number/enum', () => {
    expect(isStatusValueType('enum')).toBe(true);
    expect(isStatusValueType('boolean')).toBe(false);
    expect(isStatusValueType(null)).toBe(false);
  });

  it('findRegistryPreset 精确查内置预设', () => {
    expect(findRegistryPreset('location')?.icon).toBe('map-pin');
    expect(findRegistryPreset('LOCATION')?.icon).toBe('map-pin');
    expect(findRegistryPreset('nope')).toBeNull();
  });
});

describe('normalizeStatusSchema — fail-open 校验', () => {
  it('合法 schema 原样归一化（version 固定 1）', () => {
    const out = normalizeStatusSchema({
      version: 1,
      fields: [{ key: 'location', type: 'string', icon: 'map-pin', label: '位置' }],
      unknownKeyPolicy: 'hide',
      maxFields: 5,
    });
    expect(out?.version).toBe(1);
    expect(out?.fields).toHaveLength(1);
    expect(out?.fields[0]?.label).toBe('位置');
    expect(out?.unknownKeyPolicy).toBe('hide');
    expect(out?.maxFields).toBe(5);
  });

  it('剔除非法 type / 非法 icon / 空 key（不抛错）', () => {
    const out = normalizeStatusSchema({
      fields: [
        { key: 'hp', type: 'boolean', icon: 'brain' },
        { key: '   ', type: 'string' },
        { key: 'mood' },
      ],
    });
    expect(out?.fields).toHaveLength(2);
    const hp = out?.fields.find((f) => f.key === 'hp');
    expect(hp?.type).toBeUndefined();
    expect(hp?.icon).toBeUndefined();
  });

  it('重复 key 只保留首个', () => {
    const out = normalizeStatusSchema({
      fields: [{ key: 'mood' }, { key: 'MOOD' }, { key: ' mood ' }],
    });
    expect(out?.fields).toHaveLength(1);
  });

  it('脏输入（null / 数组 / 无 fields / 全非法）返回 undefined', () => {
    expect(normalizeStatusSchema(null)).toBeUndefined();
    expect(normalizeStatusSchema(undefined)).toBeUndefined();
    expect(normalizeStatusSchema('x')).toBeUndefined();
    expect(normalizeStatusSchema([])).toBeUndefined();
    expect(normalizeStatusSchema({})).toBeUndefined();
    expect(normalizeStatusSchema({ fields: [] })).toBeUndefined();
    expect(normalizeStatusSchema({ fields: [{ key: '' }] })).toBeUndefined();
    expect(normalizeStatusSchema({ fields: [null, 1, 'x'] })).toBeUndefined();
  });

  it('maxFields 非正数时丢弃（回落到缺省 12）', () => {
    expect(normalizeStatusSchema({ fields: [{ key: 'mood' }], maxFields: 0 })?.maxFields).toBeUndefined();
    expect(
      normalizeStatusSchema({ fields: [{ key: 'mood' }], maxFields: -3 })?.maxFields
    ).toBeUndefined();
  });

  it('options / aliases 只保留非空字符串', () => {
    const out = normalizeStatusSchema({
      fields: [
        {
          key: 'mood',
          type: 'enum',
          options: ['happy', '', 3],
          aliases: ['心情', '  ', 'mood2'],
        },
      ],
    });
    expect(out?.fields[0]?.options).toEqual(['happy']);
    expect(out?.fields[0]?.aliases).toEqual(['心情', 'mood2']);
  });
});

describe('normalizeStatusHudConfig — 全局偏好校验', () => {
  it('缺字段时回落到默认值', () => {
    expect(normalizeStatusHudConfig(undefined)).toEqual(DEFAULT_STATUS_HUD_CONFIG);
    expect(normalizeStatusHudConfig({})).toEqual(DEFAULT_STATUS_HUD_CONFIG);
    expect(normalizeStatusHudConfig({ enabled: true })).toEqual({
      enabled: true,
      showSticky: true,
      showInline: true,
    });
  });

  it('非布尔字段回落默认值（脏数据不污染）', () => {
    expect(normalizeStatusHudConfig({ enabled: 'yes', showSticky: 0 }).enabled).toBe(false);
    expect(normalizeStatusHudConfig({ enabled: 'yes', showSticky: 0 }).showSticky).toBe(true);
  });
});

describe('StatusIconName 与 IconName 的兼容性', () => {
  it('白名单内的名字都能被 getIconPath 解析（无空白图标）', () => {
    for (const name of STATUS_ICON_NAMES as StatusIconName[]) {
      expect(getIconPath(name).length).toBeGreaterThan(0);
    }
  });
});
