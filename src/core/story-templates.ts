/**
 * 故事引擎模板库 (T-08 故事引擎产品化 · 模板库)
 *
 * 提供 4 类题材模板（奇幻/科幻/现代/末日）+ 通用模板：
 * - 为小说结构化分析提供题材相关的世界类型/人物原型/场景类型/事件类型候选
 * - 为深度模式的脚本生成注入题材写作风格引导
 * - name/description 为 UI 文案（走 i18n）；其余为模型面提示词内容（不参与翻译）
 *
 * 用法：
 * - STORY_TEMPLATES：UI 渲染题材选择器
 * - getTemplateMeta(id?)：分析/脚本 Prompt 构建时获取题材元数据（缺省回退 generic）
 */

import { t } from '@/i18n';

/** 题材模板 ID */
export type StoryTemplateId =
  | 'generic'
  | 'fantasy'
  | 'sci-fi'
  | 'modern'
  | 'apocalypse';

/** 题材模板 */
export interface StoryTemplate {
  /** 模板 ID */
  id: StoryTemplateId;
  /** UI 名称（i18n key 解析后的文案） */
  name: string;
  /** UI 描述（i18n key 解析后的文案） */
  description: string;
  /** 题材特征描述（注入分析/脚本 Prompt，模型面内容） */
  styleGuide: string;
  /** 推荐世界类型候选 */
  worldTypes: string[];
  /** 推荐人物原型 */
  characterArchetypes: string[];
  /** 推荐场景类型 */
  sceneTypes: string[];
  /** 推荐事件类型 */
  eventTypes: string[];
}

// i18n-ignore-start  // 模型面题材内容（世界类型/人物原型/风格引导），非 UI 文案（待翻译）

/** 通用模板（未选择题材时的默认回退） */
const genericTemplate: StoryTemplate = {
  id: 'generic',
  name: t('storyTemplate.generic'),
  description: t('storyTemplate.genericDesc'),
  styleGuide: '题材不限',
  worldTypes: ['奇幻', '科幻', '现代', '末日', '历史', '其他'],
  characterArchetypes: [],
  sceneTypes: ['城市', '野外', '室内', '地下', '其他'],
  eventTypes: ['战斗', '对话', '探索', '转折', '其他'],
};

/**
 * 4 类题材模板 + 通用模板
 */
export const STORY_TEMPLATES: readonly StoryTemplate[] = [
  {
    id: 'fantasy',
    name: t('storyTemplate.fantasy'),
    description: t('storyTemplate.fantasyDesc'),
    styleGuide:
      '剑与魔法、魔法体系、种族与王国、古老遗迹与神祇、龙与魔兽、勇者冒险的奇幻世界',
    worldTypes: ['剑与魔法', '史诗奇幻', '高魔世界', '低魔世界', '东方玄幻', '黑暗奇幻'],
    characterArchetypes: ['勇者', '法师', '骑士', '盗贼', '游侠', '牧师', '贤者', '刺客', '吟游诗人'],
    sceneTypes: ['王国', '城堡', '城镇', '村庄', '森林', '山脉', '地下城', '遗迹', '神殿', '战场'],
    eventTypes: ['战斗', '冒险', '探索', '任务', '背叛', '结盟', '预言', '魔法事故', '劫难'],
  },
  {
    id: 'sci-fi',
    name: t('storyTemplate.sciFi'),
    description: t('storyTemplate.sciFiDesc'),
    styleGuide:
      '太空歌剧、硬科幻、赛博朋克、人工智能、星际殖民、外星文明、时间旅行、反乌托邦的科幻世界',
    worldTypes: ['太空歌剧', '赛博朋克', '硬科幻', '反乌托邦', '星际殖民', '近未来', '时间旅行'],
    characterArchetypes: ['舰长', '科学家', '黑客', '人工智能', '基因改造人', '星际商人', '特工', '工程师', '佣兵'],
    sceneTypes: ['星舰', '空间站', '外星殖民地', '实验室', '数据中心', '轨道空间', '矿区', '废土都市', '跃迁门'],
    eventTypes: ['探索', '危机', '叛乱', '突袭', '实验事故', '发现', '政变', '追捕', '谈判'],
  },
  {
    id: 'modern',
    name: t('storyTemplate.modern'),
    description: t('storyTemplate.modernDesc'),
    styleGuide:
      '现代都市、悬疑推理、刑侦、职场、校园、都市异能、心理与人性博弈的现实世界',
    worldTypes: ['都市', '悬疑推理', '刑侦', '校园', '职场', '都市异能', '家庭伦理'],
    characterArchetypes: ['侦探', '警察', '记者', '律师', '医生', '教师', '学生', '白领', '心理医生'],
    sceneTypes: ['城市', '公寓', '办公楼', '警局', '医院', '学校', '咖啡馆', '车站', '街区', '郊区别墅'],
    eventTypes: ['调查', '对话', '冲突', '转折', '阴谋', '意外', '审讯', '追逐', '谈判'],
  },
  {
    id: 'apocalypse',
    name: t('storyTemplate.apocalypse'),
    description: t('storyTemplate.apocalypseDesc'),
    styleGuide:
      '丧尸末日、核战废土、自然灾害、病毒疫情、外星入侵、末世秩序与人性极限的生存世界',
    worldTypes: ['丧尸末日', '核战废土', '自然灾害', '病毒疫情', '外星入侵', '末世重建'],
    characterArchetypes: ['幸存者', '军人', '医生', '工程师', '猎手', '领导者', '独行者', '技师', '流浪者'],
    sceneTypes: ['废土', '避难所', '城市废墟', '废墟', '超市', '公路', '军事基地', '地下设施', '营地'],
    eventTypes: ['战斗', '求生', '搜刮', '逃亡', '冲突', '救援', '背叛', '疫病', '决战'],
  },
  genericTemplate,
] as const;

/** 获取题材模板元数据（缺省/未知时回退到通用模板） */
export function getTemplateMeta(
  templateId?: StoryTemplateId
): StoryTemplate {
  if (!templateId) return genericTemplate;
  return (
    STORY_TEMPLATES.find((tmpl) => tmpl.id === templateId) ?? genericTemplate
  );
}
// i18n-ignore-end
