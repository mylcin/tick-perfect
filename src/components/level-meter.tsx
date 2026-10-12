import type { Dictionary } from '../i18n';
import { levelFor } from '../state/levels';

/**
 * The watchmaker's level: its number, a bar filled with the points towards
 * the next one, and the points themselves. Read as one sentence.
 */
export function LevelMeter({
  t,
  points,
  className = '',
}: {
  t: Dictionary;
  points: number;
  className?: string;
}) {
  const { level, from, next } = levelFor(points);
  const share = next === null ? 1 : (points - from) / (next - from);
  return (
    <p
      role="img"
      aria-label={t.level.summary(level, points, next)}
      data-testid="level-meter"
      data-level={level}
      data-points={points}
      className={`flex items-center justify-center gap-2 text-[0.65rem] tracking-[0.2em] text-ink-3 uppercase tabular-nums ${className}`}
    >
      <span className="text-ink-2">{t.level.name(level)}</span>
      <span className="relative h-1 w-16 overflow-hidden rounded-full bg-ink/15 max-[23.5rem]:w-10">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent"
          style={{ width: `${String(Math.round(share * 100))}%` }}
        />
      </span>
      <span className="tracking-normal normal-case">
        {t.level.points(points, next)}
      </span>
    </p>
  );
}
