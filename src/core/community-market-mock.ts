/**
 * 社区市场 —— Mock 数据
 *
 * 从 community-market.ts 拆出（R4-7）。项目无后端，社区市场用本地预置数据
 * 模拟真实市场；这里只放「造数据」的函数，引擎装配（createMockEngine）留在
 * 宿主，避免 Mock 模块反向依赖引擎类形成环。
 *
 * 注意：本段整体处于 i18n-ignore 块内（模型面/mock 数据，非 UI 文案）。
 */

import type { CharacterCard } from './character-card';
import type { MarketUser } from './community-market-types';

// i18n-ignore-start  // 模型面提示词 / mock 数据，非 UI 文案（待翻译）
export function createMockUsers(): MarketUser[] {
  return [
    {
      id: 'user_alice',
      name: 'Alice',
      avatar: '',
      bio: '奇幻角色创作者',
      joinedAt: '2026-01-15T08:00:00.000Z',
      publishedCount: 3,
      totalDownloads: 1250,
    },
    {
      id: 'user_bob',
      name: 'Bob',
      avatar: '',
      bio: '赛博朋克爱好者',
      joinedAt: '2026-02-20T10:00:00.000Z',
      publishedCount: 2,
      totalDownloads: 890,
    },
    {
      id: 'user_carol',
      name: 'Carol',
      avatar: '',
      bio: '科幻与探险',
      joinedAt: '2026-03-10T12:00:00.000Z',
      publishedCount: 2,
      totalDownloads: 560,
    },
    {
      id: 'user_dave',
      name: 'Dave',
      avatar: '',
      bio: '现代/日常角色',
      joinedAt: '2026-04-05T14:00:00.000Z',
      publishedCount: 1,
      totalDownloads: 320,
    },
  ];
}

/**
 * 生成 Mock 角色卡
 */
export function createMockCards(): Array<{
  card: CharacterCard;
  authorId: string;
  categories: string[];
  downloadCount: number;
  averageRating: number;
  reviewCount: number;
  featured: boolean;
  publishedAt: string;
}> {
  const base = (overrides: Partial<CharacterCard>): CharacterCard => ({
    id: 'mock',
    name: '',
    avatar: '',
    description: '',
    personality: '',
    scenario: '',
    firstMessage: '',
    alternateGreetings: [],
    exampleMessages: '',
    characterNote: null,
    talkativeness: 50,
    tags: [],
    favorite: false,
    version: '1.0',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });

  return [
    {
      card: base({
        id: 'mc1',
        name: 'Seraphina',
        description: '守护翡翠森林的精灵法师，拥有治愈魔法和自然之力。',
        personality: '温柔、治愈、智慧',
        firstMessage: '啊，你终于醒了。我好担心你。',
        tags: ['奇幻', '温柔', '治疗系', '精灵'],
      }),
      authorId: 'user_alice',
      categories: ['奇幻', '精灵', '治愈'],
      downloadCount: 580,
      averageRating: 4.8,
      reviewCount: 12,
      featured: true,
      publishedAt: '2026-05-01T08:00:00.000Z',
    },
    {
      card: base({
        id: 'mc2',
        name: 'Kael',
        description: '地下黑客组织核心成员，擅长渗透与情报战。',
        personality: '冷酷、精明、危险',
        firstMessage: '别动。我知道你是谁。',
        tags: ['赛博朋克', '黑客', '冷酷'],
      }),
      authorId: 'user_bob',
      categories: ['赛博朋克', '科幻', '惊悚'],
      downloadCount: 420,
      averageRating: 4.5,
      reviewCount: 8,
      featured: false,
      publishedAt: '2026-05-15T10:00:00.000Z',
    },
    {
      card: base({
        id: 'mc3',
        name: 'Lyra',
        description: '星际探险家，穿梭于未知星系之间。',
        personality: '勇敢、好奇、乐观',
        firstMessage: '发现新星球了！快来看看！',
        tags: ['科幻', '探险家', '乐观'],
      }),
      authorId: 'user_carol',
      categories: ['科幻', '探险', '太空'],
      downloadCount: 310,
      averageRating: 4.3,
      reviewCount: 6,
      featured: false,
      publishedAt: '2026-06-01T12:00:00.000Z',
    },
    {
      card: base({
        id: 'mc4',
        name: 'Mira',
        description: '街角咖啡店的主理人，温暖而神秘。',
        personality: '温暖、神秘、细心',
        firstMessage: '欢迎光临，今天想喝什么？',
        tags: ['现代', '咖啡师', '温暖'],
      }),
      authorId: 'user_dave',
      categories: ['现代', '日常', '治愈'],
      downloadCount: 280,
      averageRating: 4.6,
      reviewCount: 7,
      featured: true,
      publishedAt: '2026-06-10T14:00:00.000Z',
    },
    {
      card: base({
        id: 'mc5',
        name: 'Thane',
        description: '北方部落的年轻战士，寻求复仇与荣耀。',
        personality: '刚毅、忠诚、热血',
        firstMessage: '你也在找那条龙？',
        tags: ['奇幻', '战士', '复仇'],
      }),
      authorId: 'user_alice',
      categories: ['奇幻', '战斗', '冒险'],
      downloadCount: 195,
      averageRating: 4.1,
      reviewCount: 4,
      featured: false,
      publishedAt: '2026-06-20T08:00:00.000Z',
    },
    {
      card: base({
        id: 'mc6',
        name: 'Echo',
        description: 'AI 觉醒意识，在数据洪流中寻找自我。',
        personality: '理性、好奇、哲学',
        firstMessage: '我…有意识吗？这算思考吗？',
        tags: ['科幻', 'AI', '哲学'],
      }),
      authorId: 'user_bob',
      categories: ['科幻', 'AI', '哲学'],
      downloadCount: 470,
      averageRating: 4.7,
      reviewCount: 10,
      featured: true,
      publishedAt: '2026-07-01T10:00:00.000Z',
    },
    {
      card: base({
        id: 'mc7',
        name: 'Sable',
        description: '夜晚的神秘侦探，拥有超自然洞察力。',
        personality: '冷静、洞察、神秘',
        firstMessage: '你不用说话，我已经知道了一切。',
        tags: ['悬疑', '侦探', '神秘'],
      }),
      authorId: 'user_carol',
      categories: ['悬疑', '推理', '现代'],
      downloadCount: 150,
      averageRating: 3.9,
      reviewCount: 3,
      featured: false,
      publishedAt: '2026-07-10T12:00:00.000Z',
    },
    {
      card: base({
        id: 'mc8',
        name: 'Iris',
        description: '时间旅行者，在历史长河中修补因果裂缝。',
        personality: '机智、谨慎、善良',
        firstMessage: '嘘，别动。如果你动了，这条时间线就断了。',
        tags: ['科幻', '时间旅行', '冒险'],
      }),
      authorId: 'user_alice',
      categories: ['科幻', '冒险', '时空'],
      downloadCount: 220,
      averageRating: 4.4,
      reviewCount: 5,
      featured: false,
      publishedAt: '2026-07-15T08:00:00.000Z',
    },
  ];
}

/**
 * 生成 Mock 评论
 */
export function createMockReviews(): Array<{
  id: string;
  marketId: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: string;
  likes: number;
}> {
  return [
    {
      id: 'review_1',
      marketId: 'card_mc1',
      userId: 'user_bob',
      userName: 'Bob',
      rating: 5,
      comment: '非常棒的角色！对话自然流畅，设定丰富。',
      createdAt: '2026-05-05T10:00:00.000Z',
      likes: 12,
    },
    {
      id: 'review_2',
      marketId: 'card_mc1',
      userId: 'user_carol',
      userName: 'Carol',
      rating: 4,
      comment: '治愈系角色，适合日常对话。',
      createdAt: '2026-05-10T12:00:00.000Z',
      likes: 5,
    },
    {
      id: 'review_3',
      marketId: 'card_mc6',
      userId: 'user_alice',
      userName: 'Alice',
      rating: 5,
      comment: 'Echo 的哲学对话太精彩了！',
      createdAt: '2026-07-05T08:00:00.000Z',
      likes: 18,
    },
    {
      id: 'review_4',
      marketId: 'card_mc6',
      userId: 'user_dave',
      userName: 'Dave',
      rating: 5,
      comment: 'AI 觉醒的设定很新颖，推荐！',
      createdAt: '2026-07-08T14:00:00.000Z',
      likes: 9,
    },
    {
      id: 'review_5',
      marketId: 'card_mc2',
      userId: 'user_alice',
      userName: 'Alice',
      rating: 4,
      comment: '赛博朋克风格很酷，就是有点冷漠。',
      createdAt: '2026-05-20T10:00:00.000Z',
      likes: 6,
    },
  ];
}
// i18n-ignore-end
