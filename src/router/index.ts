import { createRouter, createWebHistory } from 'vue-router';
import { t, type MessageKey } from '@/i18n';

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
      meta: { titleKey: 'router.chat' },
    },
    {
      path: '/character',
      name: 'character-list',
      component: () => import('@/views/CharactersView.vue'),
      meta: { titleKey: 'router.characterList' },
    },
    {
      path: '/character/new',
      name: 'character-new',
      component: () => import('@/views/CharacterEditorView.vue'),
      meta: { titleKey: 'router.characterNew' },
    },
    {
      path: '/character/:id/edit',
      name: 'character-edit',
      component: () => import('@/views/CharacterEditorView.vue'),
      props: true,
      meta: { titleKey: 'router.characterEdit' },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/views/SettingsView.vue'),
      meta: { titleKey: 'router.settings' },
    },
    {
      path: '/worldbook',
      name: 'worldbook',
      component: () => import('@/views/WorldBookView.vue'),
      meta: { titleKey: 'router.worldbook' },
    },
    {
      path: '/group',
      name: 'group',
      component: () => import('@/views/GroupChatView.vue'),
      meta: { titleKey: 'router.group' },
    },
    {
      path: '/databank',
      name: 'databank',
      component: () => import('@/views/DataBankView.vue'),
      meta: { titleKey: 'router.databank' },
    },
    {
      path: '/archives',
      name: 'archives',
      component: () => import('@/views/ArchivesView.vue'),
      meta: { titleKey: 'router.archives' },
    },
    {
      path: '/story',
      name: 'story',
      component: () => import('@/views/StoryEngineView.vue'),
      meta: { titleKey: 'router.story' },
    },
    {
      path: '/random-events',
      name: 'random-events',
      component: () => import('@/views/RandomEventsView.vue'),
      meta: { titleKey: 'router.randomEvents' },
    },
    {
      path: '/local-model',
      name: 'local-model',
      component: () => import('@/views/LocalModelView.vue'),
      meta: { titleKey: 'router.localModel' },
    },
    {
      path: '/image-gen',
      name: 'image-gen',
      component: () => import('@/views/ImageGeneratorView.vue'),
      meta: { titleKey: 'router.imageGen' },
    },
    {
      path: '/character-version',
      name: 'character-version',
      component: () => import('@/views/CharacterVersionView.vue'),
      meta: { titleKey: 'router.characterVersion' },
    },
    {
      path: '/community-market',
      name: 'community-market',
      component: () => import('@/views/CommunityMarketView.vue'),
      meta: { titleKey: 'router.market' },
    },
    {
      // D-B 后半：/profile 上唯一的内容（本地用户 + "扮演身份在世界书"）已并入设置→关于。
      // 旧链接、脚本与收藏夹继续可用，只是落到那一类；页面级 profile.* 文案键保留。
      path: '/profile',
      redirect: { path: '/settings', query: { cat: 'about' } },
    },
    {
      // G-11：移动端"更多"聚合页（数据银行/记录/故事引擎等二级入口的统一跳转页）
      path: '/more',
      name: 'more',
      component: () => import('@/views/MoreView.vue'),
      meta: { titleKey: 'router.more' },
    },
    {
      // G 层：任务中心（关键任务的分步引导，完成态读真实数据）
      path: '/guide',
      name: 'guide',
      component: () => import('@/views/GuideView.vue'),
      meta: { titleKey: 'router.guide' },
    },
  ],
});

router.afterEach((to) => {
  const key = (to.meta.titleKey as MessageKey | undefined) ?? 'router.chat';
  document.title = `${t('app.name')} — ${t(key)}`;
});

export default router;
