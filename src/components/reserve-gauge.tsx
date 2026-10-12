import { RESERVE_DAYS } from '../state/reserve';

/**
 * A power reserve indicator: a segment for each day the watch can hold,
 * lit up to the days in reserve. Decorative: the text beside it, or the
 * control holding it, says how many.
 */
export function ReserveGauge({
  days,
  className = '',
}: {
  days: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      data-testid="reserve-gauge"
      data-days={days}
      className={`inline-flex items-end gap-0.5 ${className}`}
    >
      {Array.from({ length: RESERVE_DAYS }, (_, index) => (
        <span
          key={index}
          // Rising like the reserve's arc on a dial, and lit by fill as
          // well as colour.
          style={{ height: `${String(6 + index)}px` }}
          className={`w-1 rounded-[1px] ${
            index < days ? 'bg-accent' : 'border border-ink/30'
          }`}
        />
      ))}
    </span>
  );
}
