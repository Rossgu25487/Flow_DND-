# 《余烬契约》美术方向与游戏感基线

## 一句话主张

一册被山火烧焦、仍由活体余烬续写的冒险手抄本：低压页面用厚涂插画建立世界，高压战斗用清楚轮廓、炭黑石材与分级声画反馈保护战术判断。

## 美术支柱

### 焦黑的守望遗产

- 目标体验：世界经历过长期守望、磨损和牺牲。
- 视觉证据：焦黑玄武岩、刮花铜件、灰尘、厚织物、旧皮革与边缘烧蚀。
- 应用位置：菜单框体、战场、契约卡、首领与结算。
- 禁区：洁净玻璃、霓虹、光滑科幻材质。

### 余烬只为因果发光

- 目标体验：每次重要操作都像重新点燃一小段故事。
- 视觉证据：橙色承担可操作、命中、仪式和重大结果；紫色只属于奥林的塑能魔法；绿色承担移动和恢复。
- 应用位置：按钮焦点、弹道、火星、伤害、仪式柱和奖励。
- 禁区：全屏持续高饱和、所有控件同时发光。

### 人物先于职业图标

- 目标体验：玩家操控有历史和性格的旅团成员。
- 视觉证据：入口、名册和HUD持续出现米拉、塞布尔、奥林的统一肖像；战场保留大轮廓与职业符号。
- 应用位置：名册、HUD、叙事与结算。
- 禁区：只有颜色圆点、角色脸型同质化、华丽时装化装备。

### 沉重、短促的战术反馈

- 目标体验：输入立即被接受，命中有重量，等待不拖慢回合。
- 视觉证据：60–170ms前摇或弹道、短命中停顿、105–190ms震屏、火星爆发、伤害数字和同步音效。
- 应用位置：移动、近战、远程、法术、暴击、仪式柱与胜负。
- 禁区：长镜头演出、持续遮挡、每个按钮弹跳。

## 生成资产

全部使用内置 ImageGen 生成并保存在 `src/assets/`：

- `key-art.png`：山口信标与三人旅团主视觉。
- `hero-triptych.png`：米拉、塞布尔、奥林三联画。
- `boss-warden.png`：信标守望者首领介绍。
- `battle-outer.png`：外环庭院俯视背景。
- `battle-core.png`：信标核心首领战背景。
- `sprites/mira.png`：米拉透明全身战斗精灵。
- `sprites/sable.png`：塞布尔透明全身战斗精灵。
- `sprites/orin.png`：奥林透明全身战斗精灵。
- `sprites/enemies.png`：灰烬尸兵、余火弓手、烬牙猎犬透明三联精灵。

## 最终提示词组

### key-art.png

> Cinematic wide painterly fantasy game key art of a lonely mountain beacon tower whose brazier burns with an inverted black-orange flame; three small original adventurer silhouettes approach through windblown ash: armored woman fighter, elven rogue with bow, short gnome wizard with violet fire. Jagged northern mountain pass at dusk, charcoal, bruised plum, oxidized bronze and ember orange, weathered basalt and worn equipment, strong readable silhouettes, dark edge negative space for UI. No text, logo, watermark, modern objects or recognizable copyrighted characters.

### battle-outer.png

> Strict overhead, gridless hand-painted tactical RPG battlefield of a ruined basalt beacon courtyard: cracked flagstones, broken walls, scorched wooden barricades, two readable cover positions and ember trails flowing toward the tower entrance. Empty environment, clear walkable center, dark edges, charcoal stone and restrained ember orange. No units, UI, grid, text, watermark or perspective tilt.

### battle-core.png

> Strict overhead, gridless hand-painted boss arena inside an ancient mountain beacon: octagonal basalt chamber, concentric cracked floor rings, central black-flame socket, north and south ritual pylon platforms, broken bronze inlays and ash spiraling inward. Empty readable arena, charcoal, tarnished bronze and burnt orange. No units, grid, UI, text, watermark or sci-fi machinery.

### hero-triptych.png

> Cohesive painterly triptych with three equal vertical waist-up panels: Mira, a battle-worn human woman champion in practical dark steel armor with round shield; Sable, an androgynous elven rogue in weathered green-black leather with shortbow; Orin, an older short gnome evoker in layered plum robes holding violet flame. Shared ember rim light and cold mountain fill, grounded worn materials, distinct faces and silhouettes. Exactly three characters, no text, watermark, glamour costumes or glossy 3D rendering.

### boss-warden.png

> Wide cinematic painterly boss art of the Beacon Warden, one towering undead guardian fused into layered basalt-black armor and tarnished bronze, holding a weathered glaive in a scorched ritual chamber with two pylons and an inverted black flame. Center-right composition with dark negative space on the left, black-orange backlight, drifting ash, grounded anatomy. No heroes, text, watermark, demon cliché, sci-fi or glossy 3D rendering.

### sprites/mira.png

> Transparent full-body tactical sprite of Mira, a battle-worn human woman champion in scratched dark-steel armor, rust-red scarf, round shield and longsword. Three-quarter top-down camera, facing screen-right, warm ember rim light, clear silhouette, clean alpha, readable at 70 pixels tall.

### sprites/sable.png

> Transparent full-body tactical sprite of Sable, an androgynous elf thief in weathered green-black leather with shortbow half drawn. Three-quarter top-down camera, facing screen-right, grounded anatomy, clean alpha and distinct mobile silhouette.

### sprites/orin.png

> Transparent full-body tactical sprite of Orin, an older short gnome evoker in layered plum robes holding violet-orange flame and a bronze-capped wand. Three-quarter top-down camera, facing screen-right, clean alpha, visibly shorter stature.

### sprites/enemies.png

> Transparent three-column enemy sprite sheet: Ash Thrall with rusted curved blade, Cinder Archer with scorched hood and bow, Ember Hound with charcoal hide and ember cracks. Equal columns, full bodies, facing screen-left, shared rim light, clean alpha and no overlap.

## 动效与声音语法

- 移动：165–180ms收敛位移＋低频脚步噪声。
- 近战：72ms突进＋32ms命中停顿＋火星＋短震屏。
- 远程／法术：145ms弹道＋接触爆发；法术使用双层音高扫频。
- 暴击：更长停顿、更大火星、金色伤害数字、强震屏与复合音效。
- 治疗：绿色扩散环＋正向双音。
- 仪式柱：260ms坍缩、旋转、橙色碎片与低频下坠音。
- 胜利：镜头轻推近＋四音上行；失败：低频下坠。
- 环境：47Hz低频、五度泛音和带通风声，音量保持在反馈之下。
- 战斗开场：地图名与目标短暂压暗展示，约760ms后退场。
- 玩家回合：角色名横幅150ms进入、320ms停留、150ms退出。
- 魔法飞弹：三枚错时弹道；雷鸣波：双层扩散环；钢铁攻击：斜向刀光；首领：独立长血条与仪式柱计数。
