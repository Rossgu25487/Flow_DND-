import { useEffect, useState } from 'react';
import { emberAudio } from '../game/audio';
import { localize, uiCopy } from '../game/i18n';
import type { D20Result } from '../game/rules';
import type { Locale, StoryChoice } from '../game/types';

interface DiceCheckOverlayProps {
  choice: StoryChoice;
  result: D20Result;
  success: boolean;
  locale: Locale;
  onFinish: () => void;
}

export function DiceCheckOverlay({ choice, result, success, locale, onFinish }: DiceCheckOverlayProps) {
  const [phase, setPhase] = useState<'rolling' | 'resolved'>('rolling');
  const [face, setFace] = useState(1);
  const check = choice.check!;
  const copy = uiCopy[locale];

  useEffect(() => {
    const ticker = window.setInterval(() => setFace(Math.floor(Math.random() * 20) + 1), 90);
    const reveal = window.setTimeout(() => {
      window.clearInterval(ticker);
      setFace(result.chosen);
      setPhase('resolved');
      emberAudio.play(result.natural20 ? 'crit' : result.natural1 ? 'defeat' : 'dice');
    }, 1420);
    return () => {
      window.clearInterval(ticker);
      window.clearTimeout(reveal);
    };
  }, [result.chosen, result.natural1, result.natural20]);

  return (
    <div className="check-overlay" role="dialog" aria-live="assertive">
      <div className={`check-card ${phase} ${success ? 'success' : 'failure'} ${result.natural20 ? 'natural-twenty' : ''} ${result.natural1 ? 'natural-one' : ''}`}>
        <span className="eyebrow">{copy.roll} · {localize(check.ability, locale)}</span>
        <div className="dice-stage">
          <div className="dice-rings" />
          <div className="d20-shape"><span>{face}</span></div>
          <small>{phase === 'rolling' ? (locale === 'zh-CN' ? '命运正在落定…' : 'Fate is still turning…') : `D20 · ${result.chosen}`}</small>
        </div>
        <div className="check-resolution" aria-hidden={phase === 'rolling'}>
          <h2>{result.natural20 ? (locale === 'zh-CN' ? '自然 20' : 'NATURAL 20') : result.natural1 ? (locale === 'zh-CN' ? '自然 1' : 'NATURAL 1') : success ? copy.success : copy.failure}</h2>
          <div className="check-math">
            <span><small>D20</small>{result.chosen}</span><b>+</b><span><small>MOD</small>{result.modifier}</span><b>=</b><strong>{result.total}</strong><em>{copy.dc} {check.dc}</em>
          </div>
          <p>{localize(success ? check.successText : check.failureText, locale)}</p>
          <button className="primary-button" onClick={onFinish}>{copy.continue}</button>
        </div>
      </div>
    </div>
  );
}
