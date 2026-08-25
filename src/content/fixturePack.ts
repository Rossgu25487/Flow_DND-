import type { ContentPack } from '../game/types';

const t = (zh: string, en: string) => ({ 'zh-CN': zh, 'en-US': en } as const);

// This intentionally tiny, non-player-facing pack proves that the contract format
// can add content without changing the rules engine or application shell.
export const fixturePack: ContentPack = {
  manifest: {
    id: 'emberbound.fixture-glass-catacomb',
    version: '0.1.0',
    ruleset: 'emberbound-rules/0.1',
    title: t('测试包：玻璃墓穴', 'Fixture Pack: Glass Catacomb'),
    locales: ['zh-CN', 'en-US'],
    contractIds: ['glass-catacomb-fixture'],
  },
  units: [],
  battles: [],
  contracts: [
    {
      id: 'glass-catacomb-fixture',
      title: t('玻璃墓穴', 'The Glass Catacomb'),
      subtitle: t('内部结构验证', 'Internal structure validation'),
      description: t('用于验证内容包引用与结局闭环。', 'Used to validate content references and ending closure.'),
      estimatedMinutes: 1,
      startNodeId: 'fixture-start',
      story: [
        {
          id: 'fixture-start',
          type: 'narrative',
          eyebrow: t('内部测试', 'Internal test'),
          title: t('玻璃门后传来回声', 'An echo waits beyond the glass door'),
          text: t('第二份契约已经被内容加载器识别。', 'The content loader has recognized a second contract.'),
          next: 'fixture-end',
        },
        {
          id: 'fixture-end',
          type: 'ending',
          endingId: 'fixture-complete',
          eyebrow: t('验证完成', 'Validation complete'),
          title: t('内容包闭环有效', 'The content pack closes correctly'),
          text: t('规则核心无需修改。', 'No rules-engine changes were required.'),
        },
      ],
    },
  ],
};
