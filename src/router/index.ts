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
      path: '/profile',
      name: 'profile',
      component: () => import('@/views/ProfileView.vue'),
      meta: { titleKey: 'router.profile' },
    },
  ],
});

router.afterEach((to) => {
  const key = (to.meta.titleKey as MessageKey | undefined) ?? 'router.chat';
  document.title = `${t('app.name')} — ${t(key)}`;
});

export default router;
