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
  'img-delete-desc': {
    status: 'blocked',
    why: '需要一张生成出来的图片；图像端点在 e2e 里没有打桩，本批未补，属"能做但未做"',
  },
  'img-clear-desc': {
    status: 'blocked',
    why: '同上：清空按钮只在已有图片时出现，同样缺图像打桩',
  },
  'cv-commit-desc': {
    status: 'blocked',
    why: '要先让角色进入版本跟踪并攒出一次可提交的差异；链路长度超出本批预算，未验证过能否走通',
  },
  'cv-conflict-desc': {
    status: 'blocked',
    why: '冲突弹窗需要两份分叉的版本记录；本批没有造出该状态的夹具（未验证是否可造）',
  },
};
