# Emberbound MVP / 余烬契约 MVP

《余烬契约：灰烬信标》是一款浏览器优先的短篇队伍制奇幻战术 RPG。首版用于同时验证三件事：

1. 透明骰点、短篇叙事与小队战斗是否形成完整体验。
2. 新契约能否通过内容包接入，无需改动规则核心。
3. 契约完成率、重玩行为与“下一份契约”意向能否支持商业版本。

## 本地运行

```bash
pnpm install
pnpm dev
```

生产构建与测试：

```bash
pnpm test
pnpm build
pnpm preview
```

## 工程分层

- `src/game/`：纯 TypeScript 规则核心、掷骰、战斗运行时、存档、分析和内容校验。
- `src/content/`：英雄、敌人、战场与剧情契约。`fixturePack.ts` 是第二份无代码内容接入证明。
- `src/ui/`：React 产品外壳与 Phaser 战场表现。
- `src/styles.css`：响应式视觉与可访问性状态。

## MVP内容

- 旅团主页、契约板、英雄名册、结局档案与设置。
- 《灰烬信标》完整契约：三种开局方案、两场战斗、一次探索、一次短休、三种结局。
- 三名三级英雄、四种普通敌人、一名首领、地形、掩体与仪式柱目标。
- 版本化本地存档、声望、老兵难度、结局收集与本地事件漏斗。
- 首次进入的羊皮纸契约签名、可编辑冒险者昵称，以及贯穿旅团档案和叙事的身份显示。
- 英文DM旁白＋当前界面语言字幕；旁白按称呼、标题、叙事、紧急、阴森和回味分段表演，并提供状态与重播控制。
- 自适应旁白混音：火焰、黑潮、山风、仪式与未来巨龙关键词可触发低音量环境声层，BGM自动压低至人声背景。
- BGM与DM人声拥有独立音量控制；菜单与战斗音乐默认响度已重新标定。
- 剧情中央d20演出与战斗棋盘d20检定：滚动、修正值、目标AC/DC、优势骰、成败和自然20/1均可读。
- 简体中文与英语。
- 五张原创厚涂美术资源：主视觉、英雄组三联画、首领插画与两张战场背景。
- 程序化环境声、界面声、骰声、移动、挥砍、箭矢、法术、命中、暴击、治疗、仪式柱和胜负音效。
- 两首CC0正式循环配乐，按菜单／叙事与战斗状态交叉淡入淡出。
- Phaser战斗演出：带预备与结果停留的弹道、近战突进、命中停顿、镜头震动、屏幕闪光、火星、伤害飘字和环境余烬。
- 三名英雄与三类普通敌人的独立透明战场精灵、待机漂移、回合横幅、战斗开场牌与首领专属血条。
- 怪物图集使用独立纹理帧和脚底锚点，逻辑棋格、阴影与模型保持一致。
- 战术可读性层：怪物头顶意图、目标命中率与伤害区间、优势/劣势提示、动作/附赠/移动/反应资源槽。
- 心流保护：安全移动撤销、无合法目标提示、上下文DM战术引导、结束回合推荐状态与1×/1.6×战斗速度。
- 本地体验漏斗记录技能选择、无效目标、移动撤销和速度切换，支持后续定位玩家卡点。

## 内容包原则

内容包提供 manifest、契约、剧情节点、战斗、单位和本地化文本。规则引擎只处理声明式对象、条件、动作和结果。新增契约应先通过 `validateContentPack`，再由应用壳加载。

## License attribution

This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.

All original setting, character, narrative, interface, and code material in this repository is original to this prototype.

美术支柱、资产清单和生成提示词见 [`ART_DIRECTION.md`](./ART_DIRECTION.md)。
音乐来源与许可见 [`MUSIC_CREDITS.md`](./MUSIC_CREDITS.md)。
