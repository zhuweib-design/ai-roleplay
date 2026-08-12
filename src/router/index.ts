import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/chat',
    },
    {
      path: '/chat',
      name: 'chat',
      component: () => import('@/views/ChatView.vue'),
      meta: { title: '对话' },
    },
    {
      path: '/character',
      name: 'character-list',
      component: () => import('@/views/CharactersView.vue'),
      meta: { title: '角色管理' },
    },
    {
      path: '/character/new',
      name: 'character-new',
      component: () => import('@/views/CharacterEditorView.vue'),
      meta: { title: '新建角色' },
    },
    {
      path: '/character/:id/edit',
      name: 'character-edit',
      component: () => import('@/views/CharacterEditorView.vue'),
      props: true,
      meta: { title: '编辑角色' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { title: '设置' },
    },
    {
      path: '/worldbook',
      name: 'worldbook',
      component: () => import('@/views/WorldBookView.vue'),
      meta: { title: '世界书' },
    },
    {
      path: '/group',
      name: 'group',
      component: () => import('@/views/GroupChatView.vue'),
      meta: { title: '群聊' },
    },
    {
      path: '/databank',
      name: 'databank',
      component: () => import('@/views/DataBankView.vue'),
      meta: { title: '数据银行' },
    },
    {
      path: '/archives',
      name: 'archives',
      component: () => import('@/views/ArchivesView.vue'),
      meta: { title: '对话记录' },
    },
    {
      path: '/story',
      name: 'story',
      component: () => import('@/views/StoryEngineView.vue'),
      meta: { title: '故事引擎' },
    },
    {
      path: '/random-events',
      name: 'random-events',
      component: () => import('@/views/RandomEventsView.vue'),
      meta: { title: '随机事件' },
    },
    {
      path: '/local-model',
      name: 'local-model',
      component: () => import('@/views/LocalModelView.vue'),
      meta: { title: '本地模型' },
    },
    {
      path: '/image-gen',
      name: 'image-gen',
      component: () => import('@/views/ImageGeneratorView.vue'),
      meta: { title: '图像生成' },
    },
    {
      path: '/character-version',
      name: 'character-version',
      component: () => import('@/views/CharacterVersionView.vue'),
      meta: { title: '角色卡版本管理' },
    },
    {
      path: '/community-market',
      name: 'community-market',
      component: () => import('@/views/CommunityMarketView.vue'),
      meta: { title: '社区市场' },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { title: '个人中心' },
    },
  ],
});

router.afterEach((to) => {
  const title = (to.meta.title as string) || 'AI 酒馆';
  document.title = `AI 酒馆 — ${title}`;
});

export default router;
