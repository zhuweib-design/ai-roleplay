/**
 * gen-style-docs.mjs —— 为四套风格生成设计文档
 *
 * 文档中的色值、字体、形状、阴影、组件开关全部从 css/theme-*.css 实时解析，
 * 保证文档与实现一致；风格定位与设计意图为人工撰写。
 *
 * 运行： node tools/gen-style-docs.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { ROOT, THEMES } from './site.mjs';

const Q = String.fromCharCode(96);
const c = (s) => Q + s + Q;

function parseTokens(css) {
  const groups = [];
  let current = { title: '未分组', items: [] };
  for (const line of css.split('\n')) {
    const g = line.match(/\/\*\s*-+\s*(.+?)\s*-+\s*\*\//);
    if (g) {
      if (current.items.length) groups.push(current);
      current = { title: g[1].trim(), items: [] };
      continue;
    }
    const t = line.match(/^\s*(--[a-z0-9-]+)\s*:\s*(.+?);\s*$/);
    if (t) current.items.push({ name: t[1], value: t[2] });
  }
  if (current.items.length) groups.push(current);
  return groups;
}

const META = {
  a: {
    file: '07-风格A-极光夜曲.md',
    title: '07 风格 A：极光夜曲 Aurora Nocturne',
    tagline: '深色沉浸 · 玻璃拟态 · 极光光晕',
    keywords: '深夜、极光、玻璃、光晕、陪伴、沉浸',
    scene: '夜间长时间角色扮演、情感陪伴、沉浸式剧情推进',
    intent: [
      '把原图的深色基调推向更精致的玻璃拟态：以靛黑夜色为底，面板之间靠 1px 弱边框与轻微底色差区分，而不是靠重阴影。',
      '主色采用极光紫（#8B7CF6），辅色青绿（#4FD1C5），并把原图的玫红（#F2568C）降级为点缀色，只出现在角色头像色调与少量强调处。这样既保留原图的情绪记忆，又避免大面积玫红带来的视觉疲劳。',
      '环境层使用三层径向渐变模拟极光，叠加在应用最底层，不干扰任何文字对比度。',
      '卡片与输入框使用半透明底 + 背景模糊，让极光在玻璃下透出，这是本风格最核心的质感来源。'
    ],
    a11y: '主文字 #ECEEF7 在底色 #0A0B14 上对比度约 16:1，远超 WCAG AAA。紫、青、玫红三色仅用于强调与状态，不承担正文可读性。玻璃层的模糊半径 18px，在低端设备上可降级为纯色底（把 --component-glass-blur 设为 0px）。'
  },
  b: {
    file: '08-风格B-墨纸.md',
    title: '08 风格 B：墨纸 Ink and Paper',
    tagline: '浅色阅读 · 直角细线 · 近乎无动效',
    keywords: '纸、墨、印章、阅读、克制、专注',
    scene: '长文本角色扮演、写作辅助、白天办公环境、需要长时间阅读的场景',
    intent: [
      '把对话界面还原成「读书」的体验。底色是暖纸白（#FAF8F3）而非纯白，减少屏幕反光与刺眼感。',
      '形状语言是直角系：圆角最大只到 10px，卡片与输入框基本是 4-6px。边框用 1px 实线，取消所有模糊与光晕，取消卡片悬停抬升（--component-card-lift 为 0）。',
      '强调色只有一个：朱砂红（#B23A2F）。它像印章一样克制地出现在主按钮、选中态与焦点环上。',
      '动效被压缩到近乎瞬时：过渡时长保持 140ms 但位移量为零，仅做颜色与边框的切换，符合「纸不会动」的直觉。',
      '标题使用衬线字体（Noto Serif SC 回退到宋体），正文使用无衬线，形成书籍式的层级对比。'
    ],
    a11y: '墨黑 #1C1A17 在纸白 #FAF8F3 上对比度约 15.6:1，达到 WCAG AAA。所有状态不依赖颜色单一维度：选中态同时改变底色与边框色，禁用态同时降低透明度并禁用指针事件。'
  },
  c: {
    file: '09-风格C-新终端.md',
    title: '09 风格 C：新终端 Neo Terminal',
    tagline: '纯黑 HUD · 全等宽字形 · 扫描线',
    keywords: '终端、HUD、扫描线、等宽、信号、机械感',
    scene: '技术用户、高密度信息浏览、键盘流操作、极客审美偏好者',
    intent: [
      '纯黑底（#05070A）配荧光青（#38F2C8）与信号绿（#7CFF6B），字形全部为等宽字体，中英文同宽，形成终端般的栅格感。',
      '形状语言是彻底的直角：所有圆角为 0-4px。层级不靠阴影表达，而靠 1px 细线与辉光（box-shadow 的光晕形态）。',
      '环境层是一条 3px 周期的横向扫描线纹理（repeating-linear-gradient），透明度极低（0.045），只提供质感不干扰阅读。',
      '标题使用 0.10em 字距并强制大写，模拟终端标签的排版。',
      '分隔线使用虚线（--component-divider-style: dashed），呼应终端的分节符。'
    ],
    a11y: '荧光青 #38F2C8 在纯黑上对比度约 13.4:1。但需注意两点：一是全等宽中文字形偏窄，长文阅读舒适度低于其他三套，建议仅用于短文本场景；二是荧光色在高亮度屏幕上可能产生眩光，建议提供亮度调节。'
  },
  d: {
    file: '10-风格D-樱雾玻璃.md',
    title: '10 风格 D：樱雾玻璃 Sakura Glass',
    tagline: '明亮柔和 · 超大圆角 · 彩色投影',
    keywords: '樱花、雾、玻璃、圆润、轻盈、温柔',
    scene: '轻量陪伴对话、女性向产品、白天使用、对信息压迫感敏感的用户',
    intent: [
      '浅紫粉雾底（#F6F3FB）配白色玻璃卡片，主色樱花粉（#E5678F），辅色鸢尾紫（#8B7CF6），点缀暖橙（#F0A73C）。',
      '圆角阶梯被整体放大：小到 8px，大到 36px，按钮与胶囊全部为 999px 全圆。这是本风格最强的识别特征。',
      '阴影不使用黑色，而是低透明度的紫灰色（rgba(120,100,170,...)），形成柔和的彩色投影，避免浅色界面上的脏灰感。',
      '导航项的左侧指示条宽度设为 0（--component-nav-indicator-w: 0px），选中态完全依靠圆角胶囊底色表达，与整体圆润语言一致。',
      '环境层是三层柔和径向渐变（粉、紫、橙），让白色卡片下方透出淡彩。'
    ],
    a11y: '深紫文字 #2C2740 在白底上对比度约 12.9:1。但弱文字 #948EAC 在白底上对比度约 3.1:1，仅可用于 14px 以上的辅助信息，不建议用于正文。所有可点元素使用 999px 圆角，需确保焦点环在圆角边缘仍然可见（已通过 outline-offset 处理）。'
  },
  e: {
    file: '11-风格E-新粗野.md',
    title: '11 风格 E：新粗野 Neo Brutal',
    tagline: '硬边框 · 硬阴影 · 零圆角 · 高饱和撞色',
    keywords: '粗野、印刷、硬边框、硬阴影、高饱和、直白、贴纸感',
    scene: '游戏化对话、年轻向社区、需要强视觉记忆点的产品、内容量中低的场景',
    intent: [
      '用 2px 墨黑描边与 4px 无模糊硬阴影建立「印刷品」般的物理感，元素像贴纸一样压在纸面上，而不是浮在背景之上。',
      '全部圆角归零，包括按钮、卡片、头像、输入框与标签。这是本风格最强的识别特征，也是它与另外四套最直接的区隔。',
      '导航栏整块使用亮黄（#FFE94A），选中项反转为黄底黑字，形成强烈的区域标识；这一做法牺牲了克制感，换取了极高的可发现性。',
      '主色电光蓝（#2B5BFF）承担主操作与焦点，辅色品红（#FF5C8A）用于角色头像色调，点缀黄用于强调底色。三个颜色饱和度都在 80% 以上，互不调和。',
      '阴影的模糊半径为 0（4px 4px 0），按下时元素向阴影方向位移、阴影收缩，模拟真实的按压反馈，这是本风格唯一「动」的部分。',
      '环境层是 45 度斜纹，模拟印刷网点，只在留白处可见，不干扰文字。'
    ],
    a11y: '墨黑 #111111 在米白 #EFE9DC 上对比度约 15.8:1，亮黄底 #FFE94A 上的墨黑文字对比度约 14.2:1，均达到 WCAG AAA。硬阴影不带模糊，不会造成文字边缘发虚。需要注意两点：一是 2px 全包围描边在高信息密度界面中会增加视觉噪声，建议仅用于中低密度场景；二是电光蓝主按钮上的白字对比度约 5.1:1，满足 AA 但未达 AAA。'
  },
  f: {
    file: '12-风格F-赛璐璐.md',
    title: '12 风格 F：赛璐璐 Cel Shade',
    tagline: '动画平涂 · 双色硬切 · 网点纸',
    keywords: '赛璐璐、平涂、硬边分界、网点、动画描线、明暗两段',
    scene: 'ACG 角色扮演、动画改编产品、需要强动画质感的年轻向应用',
    intent: [
      '把动画的赛璐璐上色技法直接映射到 UI：底色大面积平涂，明暗之间是硬边分界而不是渐变过渡。',
      '主按钮采用上下双色硬切分（46% 处断开），上半是受光面、下半是阴影面，是全项目唯一用「两段式平涂」表达按钮的风格。',
      '描线使用深蓝紫（#2A2438）而不是纯黑。动画描线很少用纯黑，深蓝紫能让画面更透气，这一点直接照搬到边框上。',
      '卡片与按钮顶部带一条白色高光（inset 阴影），对应动画角色的高光区，让平面色块产生「上亮下暗」的体积暗示。',
      '环境层是 12px 周期的网点纸，对应赛璐璐动画里用网点表现阴影的工艺。'
    ],
    a11y: '深蓝紫 #2A2438 在暖白 #FFF6EC 上对比度约 14.2:1，达到 WCAG AAA。主按钮白字在 #3468D1 上约 4.7:1、在 #1E4FA8 上约 6.5:1，双色分界处最不利情况仍满足 AA。2px 描边在浅色底上提供了强轮廓，对低视力用户友好。'
  },
  g: {
    file: '13-风格G-魔法少女.md',
    title: '13 风格 G：魔法少女 Magical Girl',
    tagline: '粉紫渐变 · 发光光晕 · 全圆角',
    keywords: '魔法少女、渐变、发光、星光、全圆角、高饱和',
    scene: '情感陪伴、女性向产品、轻量社交、需要强情绪感染力的场景',
    intent: [
      '高饱和粉紫双主色，主按钮使用 135 度粉紫渐变，是全项目唯一使用渐变按钮的风格。',
      '圆角阶梯整体放大到 10-40px，导航项、按钮、标签、输入框全部使用全圆（999px），形成彻底的圆润语言。',
      '发光代替阴影：卡片与头像的光晕来自主色的低透明度扩散，而不是黑色投影，这让浅色界面不会出现脏灰。',
      '环境层是粉、紫、金三层径向渐变，模拟魔法阵的光晕，为纯白卡片提供彩色底衬。',
      '导航项的左侧指示条宽度设为 0，选中态完全依靠圆角胶囊底色表达，与整体圆润语言一致。'
    ],
    a11y: '深紫 #4A2B5C 在浅粉白 #FDF2FF 上对比度约 12.4:1。主按钮白字在渐变两端分别约 4.6:1 与 5.2:1，满足 AA。弱文字 #9E85B4 在白底上约 3.4:1，仅可用于 14px 以上的辅助信息。全圆角元素需确保焦点环在弧形边缘仍可见，已通过 outline-offset 处理。'
  },
  h: {
    file: '14-风格H-霓虹东京.md',
    title: '14 风格 H：霓虹东京 Neon Tokyo',
    tagline: '深蓝紫夜 · 霓虹粉青 · 赛博网格',
    keywords: '霓虹、赛博、夜城、粉青撞色、光晕、网格',
    scene: '赛博题材角色扮演、夜猫子用户、需要强氛围感与未来感的场景',
    intent: [
      '深蓝紫夜色底（#0A0A1F）配霓虹粉（#FF2E88）与霓虹青（#00E5FF），模拟雨夜里霓虹招牌的撞色。',
      '发光代替阴影：所有层级由主色的多层光晕（10px / 30px / 60px 递进）表达，全文件没有一处黑色投影。',
      '主按钮用亮粉底配深色字（#0A0A1F），既保住霓虹的亮度，又把对比度拉到 5.4:1，避免了白字在霓虹粉上只有 3.7:1 的问题。',
      '环境层是 44px 周期的青色网格加两团霓虹光斑，网格提供赛博质感，光斑提供纵深。',
      '卡片使用半透明底加内侧青色辉光，让背景网格透出来，形成「玻璃幕墙」的观感。'
    ],
    a11y: '主文字 #EDE9FF 在底色 #0A0A1F 上对比度约 16.8:1，达到 AAA。霓虹粉底配深色字约 5.4:1，满足 AA。需注意两点：一是大面积高饱和霓虹在暗环境下可能造成眩光，建议提供亮度调节；二是青色边框在深底上的对比度约 2.6:1，属于装饰性描边，不承担信息传达。'
  },
  i: {
    file: '15-风格I-机甲机库.md',
    title: '15 风格 I：机甲机库 Mecha Hangar',
    tagline: '枪灰金属 · 警示黄 · 工业硬边',
    keywords: '机甲、工业、警示条、HUD、金属灰、窄体字',
    scene: '机甲题材、硬核科幻、需要「装备感」与仪表盘质感的场景',
    intent: [
      '枪灰金属底（#15181C）配警示黄（#FFB000）与 HUD 青（#4FC3F7），模拟机库维修面板的配色。',
      '卡片顶部有一条 3px 实心警示黄条（inset 阴影实现），是工业设备「危险区域」标记的 UI 化，也是本风格最强的识别特征。',
      '全部圆角归零或极小（0-6px），标题字体使用 Barlow Condensed 窄体并强制大写、加 0.06em 字距，模拟仪表盘刻字。',
      '主按钮用黄底深色字（#1A1400），对比度约 11:1，符合工业场景的高可视性要求。',
      '环境层是 45 度黄黑警示斜纹，透明度仅 0.055，只提供质感不干扰阅读。'
    ],
    a11y: '主文字 #DCE2E8 在底色 #15181C 上对比度约 12.6:1，达到 AAA。警示黄底配深色字约 11:1。需注意：Barlow Condensed 是窄体，中文会回退到系统字体，因此中文阅读体验与其他风格一致，窄体效果主要体现在拉丁字母与数字上。'
  },
  j: {
    file: '16-风格J-大正浪漫.md',
    title: '16 风格 J：大正浪漫 Taisho Roman',
    tagline: '和纸纹样 · 朱红描金 · 衬线标题',
    keywords: '大正、和纸、朱红、金、七宝纹、衬线、复古',
    scene: '和风题材、历史向角色扮演、需要书籍感与仪式感的场景',
    intent: [
      '和纸米色底配墨绿深色导航栏，朱红作主色、金作点缀，标题与正文统一使用衬线体，这是全项目唯一通篇衬线的风格。',
      '导航栏是项目里第一套深色侧栏（墨绿 #2A3B33），通过新引入的 --component-rail-* Token 组实现，文字色、悬停底色、分隔线全部独立于内容区。',
      '边框改用金色（rgba(168,135,31,0.35)）替代常规灰黑描边，呼应大正时期的莳绘与金箔工艺。',
      '环境层是两组 45 度交叉斜线构成的七宝纹，周期 7px，透明度 0.055，模拟和纸纤维与织物纹样。',
      '圆角压到 2-12px，按钮不带阴影，靠 1px 金边与底色区分层级。'
    ],
    a11y: '墨褐 #2E2620 在和纸米色 #F5EDE0 上对比度约 12.9:1。深色导航栏内浅色文字 #C4BAA2 在墨绿 #2A3B33 上约 7.4:1，达到 AAA。朱红主按钮白字约 5.2:1，满足 AA。'
  },
  k: {
    file: '17-风格K-水彩治愈.md',
    title: '17 风格 K：水彩治愈 Watercolor Healing',
    tagline: '淡彩晕染 · 柔和漫反射 · 纸纹',
    keywords: '水彩、治愈、淡彩、晕染、纸面、柔和、手绘',
    scene: '轻小说向、日常治愈题材、长时间阅读、需要降低视觉压力的场景',
    intent: [
      '水彩纸白底配四团柔和径向晕染（蓝、橙、绿、紫），模拟颜料在湿纸上扩散的边界模糊感。',
      '主色是低饱和的水彩蓝 #4A7C96，辅色水彩橙、点缀水彩绿，三色都刻意压过饱和度，避免数码感。',
      '阴影全部带大模糊半径与低透明度（0 8px 24px / 0.12），模拟纸面漫反射，全文件没有硬边阴影。',
      '圆角中等偏大（8-32px），按钮与标签为全圆，整体柔和但不像魔法少女那样甜腻。',
      '标题使用圆体，正文使用无衬线，兼顾手绘感与长文可读性。'
    ],
    a11y: '主文字 #4A4A44 在水彩纸白 #FAF7F0 上对比度约 10.4:1，达到 AAA。主按钮白字在 #4A7C96 上约 4.6:1，满足 AA。四团晕染的透明度都控制在 0.10-0.16，不会干扰文字可读性。'
  },
  l: {
    file: '18-风格L-蒸汽波.md',
    title: '18 风格 L：蒸汽波 Vaporwave',
    tagline: '深紫霓虹 · 透视网格 · 90 年代',
    keywords: '蒸汽波、复古、网格地平线、粉青渐变、朦胧、90 年代',
    scene: '复古未来题材、氛围向社区、追求强烈复古审美的用户',
    intent: [
      '深紫底配荧光粉与青，主按钮使用 135 度粉到青的渐变，配合深色字以获得足够对比度。',
      '环境层分三层：底部向上的粉青渐变（模拟地平线）、34px 周期的双向青色网格（模拟透视地面）。',
      '与霓虹东京的区别：蒸汽波的光晕更柔、更宽（34-64px），并叠加了青色内辉光，追求朦胧的复古感而非锐利的赛博感。',
      '标题字距放宽到 0.04em，配合中等圆角（4-28px），对应 90 年代海报的排版语言。',
      '饱和度提升到 1.6，是所有风格里最高的一档，对应蒸汽波的浓艳审美。'
    ],
    a11y: '主文字 #F0E6FF 在底色 #1A0B2E 上对比度约 14.2:1，达到 AAA。渐变按钮配深色字 #1A0B2E，在粉色端约 5.5:1、青色端约 9:1。需注意：网格纹理叠加大面积渐变可能导致背景亮度不均，重要文本应放在卡片内而非直接置于背景之上。'
  },
  m: {
    file: '19-风格M-学园制服.md',
    title: '19 风格 M：学园制服 School Uniform',
    tagline: '藏青领巾红 · 苏格兰格 · 清爽',
    keywords: '学园、制服、藏青、领巾红、苏格兰格、清爽、学生证',
    scene: '校园题材、青春向角色扮演、需要干净利落观感的场景',
    intent: [
      '清爽白底配藏青深色导航栏（#1F2E4A），领巾红（#C0392B）作主色、徽章金（#B8941F）作点缀。',
      '导航栏是项目里第二套深色侧栏，复用 --component-rail-* Token 组，与内容区的配色完全解耦。',
      '环境层是 15px 周期的双向下格子纹，对应制服裙的苏格兰格。',
      '圆角压到 3-14px、按钮不带阴影，靠 1px 边框与底色区分层级，整体干净利落。',
      '头像与卡片使用小圆角方形（6px）配藏青描边，对应学生证照片的观感。'
    ],
    a11y: '主文字 #232B38 在清爽白 #F4F6F9 上对比度约 13.8:1，达到 AAA。深色导航栏内浅色文字 #B8C2CE 在藏青 #1F2E4A 上约 7.8:1，达到 AAA。领巾红主按钮白字约 5.0:1，满足 AA。'
  }
};

const write = [];

for (const t of THEMES) {
  const css = fs.readFileSync(path.join(ROOT, 'css', 'theme-' + t.id + '.css'), 'utf8');
  const groups = parseTokens(css);
  const m = META[t.id];
  const out = [];
  const P = (s) => out.push(s === undefined ? '' : s);

  P('# ' + m.title);
  P('');
  P('> ' + m.tagline);
  P('');
  P('| 项目 | 内容 |');
  P('|---|---|');
  P('| 风格 ID | ' + c(t.id) + '（对应 ' + c('[data-theme="' + t.id + '"]') + '） |');
  P('| 英文名 | ' + t.en + ' |');
  P('| 关键词 | ' + m.keywords + ' |');
  P('| 适用场景 | ' + m.scene + ' |');
  P('| Token 文件 | ' + c('css/theme-' + t.id + '.css') + ' |');
  P('| 完整页面 | ' + c('style-' + t.id + '.html') + ' |');
  P('');
  P('## 1. 设计意图');
  P('');
  for (const p of m.intent) { P('- ' + p); }
  P('');
  P('## 2. 色彩系统');
  P('');
  P('本风格的色值**只在本文件中定义**，组件层通过 ' + c('var()') + ' 引用。');
  P('');
  for (const g of groups) {
    if (!g.title.startsWith('L2')) continue;
    P('### ' + g.title);
    P('');
    P('| Token | 值 |');
    P('|---|---|');
    for (const it of g.items) P('| ' + c(it.name) + ' | ' + c(it.value.split('|').join('\\|')) + ' |');
    P('');
  }
  P('## 3. 字体系统');
  P('');
  const fontKeys = ['--font-family-sans', '--font-family-display', '--font-family-mono', '--font-feature-settings'];
  const themeMap = new Map();
  for (const g of groups) for (const it of g.items) themeMap.set(it.name, it.value);
  P('| 用途 | 字体栈 |');
  P('|---|---|');
  P('| 正文 ' + c('--font-family-sans') + ' | ' + c(themeMap.get('--font-family-sans')) + ' |');
  P('| 标题 ' + c('--font-family-display') + ' | ' + c(themeMap.get('--font-family-display')) + ' |');
  P('| 等宽 ' + c('--font-family-mono') + ' | ' + c(themeMap.get('--font-family-mono')) + ' |');
  P('');
  P('字号、行高、字重阶梯为全站共享（定义在 ' + c('css/tokens.base.css') + '），本风格只覆写字体族与字距。');
  P('');
  P('## 4. 形状、描边与质感');
  P('');
  P('| Token | 值 |');
  P('|---|---|');
  const shapeKeys = ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl',
    '--size-border-thin', '--size-border-thick', '--effect-blur', '--effect-saturate',
    '--component-backdrop-image', '--component-backdrop-opacity', '--component-divider-style',
    '--component-title-letter-spacing', '--component-title-transform', '--component-focus-offset'];
  for (const k of shapeKeys) {
    if (!themeMap.has(k)) continue;
    P('| ' + c(k) + ' | ' + c(themeMap.get(k).split('|').join('\\|')) + ' |');
  }
  P('');
  P('## 5. 阴影与光效');
  P('');
  P('| Token | 值 |');
  P('|---|---|');
  for (const k of ['--shadow-xs', '--shadow-sm', '--shadow-md', '--shadow-lg', '--shadow-xl', '--shadow-glow', '--shadow-focus']) {
    if (!themeMap.has(k)) continue;
    P('| ' + c(k) + ' | ' + c(themeMap.get(k).split('|').join('\\|')) + ' |');
  }
  P('');
  P('## 6. 组件级表现开关（L3）');
  P('');
  P('下表是本风格在组件层面的全部差异。组件 CSS 不做任何风格分支判断，只读取这些开关。');
  P('');
  for (const g of groups) {
    if (!g.title.startsWith('L3')) continue;
    P('| Token | 值 |');
    P('|---|---|');
    for (const it of g.items) P('| ' + c(it.name) + ' | ' + c(it.value.split('|').join('\\|')) + ' |');
    P('');
  }
  P('## 7. 动效');
  P('');
  P('时长与曲线阶梯全站共享，定义在 ' + c('css/tokens.base.css') + '：');
  P('');
  P('| 场景 | 时长 Token | 曲线 Token |');
  P('|---|---|---|');
  P('| 颜色 / 边框切换 | ' + c('--duration-fast') + '（140ms） | ' + c('--ease-standard') + ' |');
  P('| 底色 / 阴影 / 位移 | ' + c('--duration-normal') + '（220ms） | ' + c('--ease-standard') + ' |');
  P('| 进度条填充 | ' + c('--duration-slow') + '（360ms） | ' + c('--ease-standard') + ' |');
  P('| 加载指示器 | ' + c('--duration-slower') + '（600ms） | ' + c('--ease-linear') + ' |');
  P('| 环境呼吸动画 | ' + c('--duration-ambient') + '（12s） | ' + c('--ease-standard') + ' |');
  P('');
  P('本风格的动效强度特征：位移幅度由 ' + c('--component-card-lift') + ' 控制，当前值为 ' + c(themeMap.get('--component-card-lift') || '—') + '。');
  P('开启 ' + c('prefers-reduced-motion: reduce') + ' 后，全部时长降为 ' + c('--duration-motion-off') + '（0.01ms）。');
  P('');
  P('## 8. 无障碍评估');
  P('');
  P(m.a11y);
  P('');
  P('## 9. 如何切换到本风格');
  P('');
  P('完整页面（已内置）：直接打开 ' + c('style-' + t.id + '.html') + '。');
  P('');
  P('接入自有页面：在 ' + c('html') + ' 或 ' + c('body') + ' 上设置 ' + c('data-theme="' + t.id + '"') + '，并引入样式：');
  P('');
  P(Q + Q + Q + 'html');
  P('  <link rel="stylesheet" href="css/reset.css">');
  P('  <link rel="stylesheet" href="css/tokens.base.css">');
  P('  <link rel="stylesheet" href="css/theme-' + t.id + '.css">');
  P('  <link rel="stylesheet" href="css/layout.css">');
  P('  <link rel="stylesheet" href="css/components.css">');
  P('</html>');
  P(Q + Q + Q);
  P('');
  P('> 本文件由 ' + c('tools/gen-style-docs.mjs') + ' 生成，第 2 至 7 节的数值实时取自 ' + c('css/theme-' + t.id + '.css') + '，请勿手工修改数值。');
  P('');

  const target = path.join(ROOT, 'docs', m.file);
  fs.writeFileSync(target, out.join('\n'), 'utf8');
  write.push(m.file + ' (' + out.length + ' 行)');
}

console.log('已生成风格文档：');
for (const f of write) console.log('  - ' + f);
