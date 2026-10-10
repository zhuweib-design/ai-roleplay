/**
 * 对话框级说明的覆盖台账（M8-c → M9-d）
 *
 * `Modal` 的 `describedBy` 是裸字符串引用，静态守卫只能保证"源码里那个 id 存在"，
 * 不能保证**运行时真的解析得到**（说明段落带 `v-if`、或 id 被别处重复注册时，
 * 界面上一切正常，读屏只是安静地少念一句）。
 *
 * 所以每条引用都必须在下面登记一个归宿：
 * - `e2e`：`e2e/ux-modal-describedby*.spec.ts` 里真的把它点开验过（`spec` 写用例名）；
 * - `blocked`：当前造不出那个界面状态，`why` 必须写清缺什么（不许写"以后再说"）。
 *
 * M11-c 之后 **23 条全部是 `e2e`，`blocked` 清零**。回头看，原先 7 条"造不出"里有
 * 6 条其实是"没去查数据怎么造"：图片在独立的 `ai-roleplay-images` 库、故事/文档/角色
 * 直接写 IndexedDB、版本页的分支与合并全都有界面。剩下那条（消息删除）也只是需要
 * 一条带历史的角色。教训写进设计文档 M11 节。
 *
 * `tests/accessibility/modal-describedby-wired.test.ts` 会核对三方一致：
 * 源码里的引用集合 == 台账的键集合；标 `e2e` 的 id 必须真的出现在它声明的那份 spec 里；
 * 标 `blocked` 的必须带原因。新增引用而不登记 ⇒ 门禁直接红。
 */

export type Coverage =
  | { status: 'e2e'; spec: string }
  | { status: 'blocked'; why: string };

export const MODAL_DESCRIBED_BY_COVERAGE: Record<string, Coverage> = {
  // ── 已点开验过 ──
  'onboarding-desc': { status: 'e2e', spec: 'ux-modal-describedby' },
  'char-unsaved-desc': { status: 'e2e', spec: 'ux-modal-describedby' },
  'char-list-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby' },
  'char-list-delete-warning': { status: 'e2e', spec: 'ux-modal-describedby' },
  'char-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'char-delete-warning': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'wb-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'mpm-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'audit-clear-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'group-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'add-member-hint': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'npc-hint': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'profile-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'profile-delete-warning': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'char-generate-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },
  'wb-generate-desc': { status: 'e2e', spec: 'ux-modal-describedby-more' },

  // ── 当前造不出界面状态，逐条写清缺什么 ──
  'msg-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-seeded' },
  'story-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-seeded' },
  'db-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-seeded' },
  'img-delete-desc': { status: 'e2e', spec: 'ux-modal-describedby-seeded' },
  'img-clear-desc': { status: 'e2e', spec: 'ux-modal-describedby-seeded' },
  'cv-commit-desc': { status: 'e2e', spec: 'ux-modal-describedby-version' },
  'cv-conflict-desc': { status: 'e2e', spec: 'ux-modal-describedby-version' },
};
