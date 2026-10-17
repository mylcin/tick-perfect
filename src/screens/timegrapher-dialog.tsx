import { useState, type ReactNode } from 'react';

import { FOCUS_WITHIN, IconButton } from '../components/buttons';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { useToday } from '../hooks/use-today';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { useAppState } from '../state/app';
import { runOfDays } from '../state/daily-archive';
import {
  latestRounds,
  summarize,
  type RoundLine,
  type Summary,
} from '../state/history';
import { useSession } from '../state/session';
import {
  perfectShare,
  rate,
  RECENT_ERRORS,
  roundStats,
  spread,
  wholeRate,
  type TimingRecord,
} from '../state/timegrapher';
import { WATCH_ORDER, WATCHES, type WatchId } from '../watches';

/** The trace's reach either side of the zero; errors past it sit on the edge. */
const RANGE_MS = 80;
const GRID_MS = 10;
const LABEL_MS = 40;

// The trace's drawing, in SVG units: one unit per ms upright.
const WIDTH = 320;
/** Room for the widest label, "−80", at the labels' size. */
const LEFT = 34;
/** Labels about as big as the panel's small text. */
const LABEL_SIZE = 11;
const RIGHT = WIDTH - 8;
const TOP = 8;
const BOTTOM = TOP + 2 * RANGE_MS;
const HEIGHT = BOTTOM + 8;
const SLOT = (RIGHT - LEFT) / RECENT_ERRORS;

const yOf = (ms: number) =>
  TOP + RANGE_MS - Math.min(Math.max(ms, -RANGE_MS), RANGE_MS);

/**
 * The player's timing on each watch they have played, the way a
 * timegrapher shows a movement's: a trace of the latest hits' errors, late
 * above the zero and early below, with the rate, the spread and the
 * Perfect share underneath; then the latest rounds against those before,
 * and the recent Dailies. Opened from the title, under Settings.
 */
export function TimegrapherDialog() {
  const t = useT();
  const open = useSession(state => state.timegrapherOpen);
  const setOpen = useSession(state => state.setTimegrapherOpen);
  const close = () => {
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      labelledBy="timegrapher-heading"
      onCancel={close}
      testId="timegrapher-dialog"
    >
      <div className="absolute inset-0 bg-surface/60" onClick={close} />
      <div className="absolute inset-y-0 right-0 flex w-full animate-rise flex-col overflow-y-auto border-l border-ink/10 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-6 sm:max-w-sm">
        <div className="flex items-center justify-between">
          {/* Its name is English in every language (and keeps its dotless
              I when Turkish rules uppercase it). */}
          <h2
            id="timegrapher-heading"
            lang="en"
            className="text-xs tracking-[0.4em] text-ink-2 uppercase"
          >
            {t.timegrapher.title}
          </h2>
          <IconButton
            label={t.timegrapher.close}
            data-testid="timegrapher-close"
            data-autofocus
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        </div>
        <Readings t={t} />
        <DailyArchive t={t} />
      </div>
    </Modal>
  );
}

/** Mounted afresh each time the panel opens, on the watch on show. */
function Readings({ t }: { t: Dictionary }) {
  const timing = useAppState(state => state.timing);
  const history = useAppState(state => state.history);
  const shown = useSession(state => state.watch);
  const watches = WATCH_ORDER.filter(id => (timing[id]?.count ?? 0) > 0);
  const [picked, setPicked] = useState<WatchId | undefined>(() =>
    watches.includes(shown) ? shown : watches[0]
  );
  const record = picked && timing[picked];

  const intro = (
    <p className="mt-3 text-xs leading-relaxed text-ink-3 short:hidden">
      {t.timegrapher.intro}
    </p>
  );

  // Nothing played yet: what the trace will look like, still blank.
  if (!picked || !record) {
    return (
      <>
        {intro}
        <TracePaper t={t} />
        <p data-testid="timegrapher-empty" className="mt-4 text-sm text-ink-2">
          {t.timegrapher.empty}
        </p>
      </>
    );
  }

  const readouts = [
    [
      'rate',
      t.timegrapher.rate,
      t.timegrapher.rateValue(wholeRate(rate(record))),
    ],
    [
      'spread',
      t.timegrapher.spread,
      t.timegrapher.spreadValue(Math.round(spread(record))),
    ],
    [
      'perfect',
      t.timegrapher.perfect,
      t.timegrapher.perfectValue(perfectShare(record)),
    ],
    ['hits', t.timegrapher.hits, t.timegrapher.hitsValue(record.count)],
  ] as const;

  return (
    <>
      {intro}

      <fieldset className="mt-5 short:mt-2">
        <legend className="sr-only">{t.timegrapher.watches}</legend>
        {/* One scrolling row where the screen is short, so a record on
            every watch never pushes the readouts out of view. */}
        <div className="flex flex-wrap gap-1.5 short:-mx-1 short:[scrollbar-width:none] short:flex-nowrap short:overflow-x-auto short:[mask-image:linear-gradient(to_right,black_calc(100%-1.5rem),transparent)] short:px-1 short:py-0.5">
          {watches.map(id => (
            <label
              key={id}
              lang="en"
              className={`relative shrink-0 cursor-pointer rounded-full border border-ink/10 px-3 py-1.5 text-xs tracking-[0.08em] text-ink-3 transition-colors hover:text-ink has-checked:border-transparent has-checked:bg-ink has-checked:text-surface ${FOCUS_WITHIN}`}
            >
              <input
                type="radio"
                name="timegrapher-watch"
                value={id}
                checked={picked === id}
                onChange={() => {
                  setPicked(id);
                }}
                className="sr-only"
              />
              {WATCHES[id].name}
            </label>
          ))}
        </div>
      </fieldset>

      <Trace t={t} record={record} />

      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 short:mt-3 short:grid-cols-4 short:gap-x-3">
        {readouts.map(([key, label, value]) => (
          <div key={key}>
            <dt className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase short:tracking-[0.15em]">
              {label}
            </dt>
            <dd
              data-testid="timegrapher-readout"
              data-readout={key}
              className="mt-0.5 text-lg font-light text-ink tabular-nums short:text-base"
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Remounted per watch, so each starts on its latest few rounds. */}
      <LatestRounds key={picked} t={t} lines={history[picked] ?? []} />
    </>
  );
}

/** How many of the latest rounds can be summed up. */
const WINDOWS = [10, 25, 100] as const;

const signed = (value: number, digits: number) => {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '±0';
  return `${rounded > 0 ? '+' : '−'}${Math.abs(rounded).toFixed(digits)}`;
};

/**
 * The latest rounds on a watch, summed up, each figure beside its change on
 * as many rounds before (once there are that many). The note says how each
 * is worked out: nothing here is a score of skill beyond what it says.
 */
function LatestRounds({
  t,
  lines,
}: {
  t: Dictionary;
  lines: readonly RoundLine[];
}) {
  const [count, setCount] = useState<(typeof WINDOWS)[number]>(WINDOWS[0]);
  const { latest, before } = latestRounds(lines, count);
  const now = summarize(latest);
  if (!now) return null;
  const then = before && summarize(before);

  const change = (
    of: (summary: Summary) => number | null,
    show: (difference: number) => string
  ) => {
    const a = of(now);
    const b = then ? of(then) : null;
    return a === null || b === null ? null : show(a - b);
  };
  const readouts = [
    [
      'average',
      t.timegrapher.averageScore,
      t.timegrapher.averageScoreValue(now.averageScore),
      change(
        summary => summary.averageScore,
        difference => signed(difference, 1)
      ),
    ],
    [
      'perfect',
      t.timegrapher.perfect,
      now.perfectShare === null
        ? '–'
        : t.timegrapher.perfectValue(now.perfectShare),
      change(
        summary => summary.perfectShare,
        difference => `${signed(difference * 100, 0)} pt`
      ),
    ],
    [
      'rate',
      t.timegrapher.rate,
      now.rate === null ? '–' : t.timegrapher.rateValue(wholeRate(now.rate)),
      null,
    ],
    [
      'spread',
      t.timegrapher.spread,
      now.spread === null
        ? '–'
        : t.timegrapher.spreadValue(Math.round(now.spread)),
      change(
        summary => summary.spread,
        difference => `${signed(difference, 0)} ms`
      ),
    ],
  ] as const;

  return (
    <section
      aria-labelledby="timegrapher-latest"
      data-testid="timegrapher-latest"
      className="mt-6 border-t border-ink/10 pt-4 short:mt-4"
    >
      <h3
        id="timegrapher-latest"
        className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase"
      >
        {t.timegrapher.latest}
      </h3>
      <fieldset className="mt-2">
        <legend className="sr-only">{t.timegrapher.latest}</legend>
        <div className="flex flex-wrap gap-1.5">
          {WINDOWS.map(option => (
            <label
              key={option}
              className={`relative cursor-pointer rounded-full border border-ink/10 px-3 py-1 text-xs tracking-[0.08em] text-ink-3 tabular-nums transition-colors hover:text-ink has-checked:border-transparent has-checked:bg-ink has-checked:text-surface ${FOCUS_WITHIN}`}
            >
              <input
                type="radio"
                name="timegrapher-latest"
                value={option}
                checked={count === option}
                onChange={() => {
                  setCount(option);
                }}
                className="sr-only"
              />
              {t.timegrapher.lastRounds(option)}
            </label>
          ))}
        </div>
      </fieldset>
      {latest.length < count && (
        <p className="mt-2 text-xs text-ink-3">
          {t.timegrapher.roundsSoFar(latest.length)}
        </p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 short:grid-cols-4 short:gap-x-3">
        {readouts.map(([key, label, value, difference]) => (
          <div key={key}>
            <dt className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase short:tracking-[0.15em]">
              {label}
            </dt>
            <dd
              data-testid="latest-readout"
              data-readout={key}
              className="mt-0.5 text-lg font-light text-ink tabular-nums short:text-base"
            >
              {value}
              {difference !== null && (
                <span
                  data-testid="latest-change"
                  className="ml-1.5 text-xs text-ink-3"
                >
                  <span aria-hidden="true">{difference}</span>
                  <span className="sr-only">
                    {t.timegrapher.change(difference, count)}
                  </span>
                </span>
              )}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[0.7rem] leading-relaxed text-ink-3 short:hidden">
        {t.timegrapher.latestNote}
      </p>
    </section>
  );
}

/** How many days the Daily strip looks back, today included. */
const DAYS_SHOWN = 14;

/**
 * The last fortnight of Dailies, a cell a day with its best, the run of
 * days played and how many were. Nothing shows before the first Daily.
 */
function DailyArchive({ t }: { t: Dictionary }) {
  const dailies = useAppState(state => state.dailies);
  const today = useToday();
  if (Object.keys(dailies).length === 0) return null;
  const days = Array.from(
    { length: DAYS_SHOWN },
    (_, index) => today - DAYS_SHOWN + 1 + index
  ).filter(day => day >= 1);
  const bestOn = (day: number) => dailies[String(day)] ?? null;
  const played = days.filter(day => bestOn(day) !== null).length;

  return (
    <section
      aria-labelledby="timegrapher-daily"
      data-testid="daily-archive"
      className="mt-6 border-t border-ink/10 pt-4 short:mt-4"
    >
      <h3
        id="timegrapher-daily"
        lang="en"
        className="text-[0.65rem] tracking-[0.3em] text-ink-3 uppercase"
      >
        {t.timegrapher.daily}
      </h3>
      <ol className="mt-3 grid grid-cols-7 gap-1.5">
        {days.map(day => {
          const best = bestOn(day);
          return (
            <li
              key={day}
              data-testid="daily-archive-day"
              data-played={best !== null}
              aria-label={t.timegrapher.dailyDay(day, best)}
              className={`flex aspect-square items-center justify-center rounded-md text-xs tabular-nums ${
                best === null
                  ? 'border border-dashed border-ink/10 text-ink-4'
                  : 'bg-accent/20 text-ink'
              } ${day === today ? 'ring-1 ring-ink/40' : ''}`}
            >
              {best ?? ''}
            </li>
          );
        })}
      </ol>
      <p className="mt-3 text-xs text-ink-2">
        {t.timegrapher.dailyRun(runOfDays(dailies, today))} ·{' '}
        {t.timegrapher.dailyPlayed(played, days.length)}
      </p>
    </section>
  );
}

/**
 * The latest errors as a paper trace, oldest on the left, on a fine grid
 * with the zero marked. There is no Perfect band: the Perfect zone narrows
 * and the hand speeds up as a round goes on, so no one band in ms is true.
 */
function Trace({ t, record }: { t: Dictionary; record: TimingRecord }) {
  const { recent } = record;
  const drawn = roundStats(recent);
  return (
    <TracePaper
      t={t}
      label={t.timegrapher.trace(
        recent.length,
        wholeRate(drawn.rate),
        Math.round(drawn.spread)
      )}
    >
      <g className="fill-accent stroke-accent">
        {recent.map((ms, index) => {
          const clamped = Math.abs(ms) > RANGE_MS;
          return (
            <circle
              key={index}
              data-testid="timegrapher-dot"
              data-clamped={clamped}
              cx={LEFT + (index + 0.5) * SLOT}
              cy={yOf(ms)}
              r={clamped ? 2 : 1.4}
              fillOpacity={clamped ? 0 : 0.9}
              strokeWidth={clamped ? 0.8 : 0}
            />
          );
        })}
      </g>
    </TracePaper>
  );
}

/**
 * The trace's grid, zero line and scale, with whatever is drawn on it.
 * Without a `label` it is only a picture: the text beside it says it all.
 */
function TracePaper({
  t,
  label,
  children,
}: {
  t: Dictionary;
  label?: string;
  children?: ReactNode;
}) {
  const lines = Array.from(
    { length: (2 * RANGE_MS) / GRID_MS + 1 },
    (_, index) => index * GRID_MS - RANGE_MS
  );
  const columns = Array.from(
    { length: RECENT_ERRORS / 10 + 1 },
    (_, index) => LEFT + index * 10 * SLOT
  );

  return (
    <svg
      {...(label
        ? { role: 'img', 'aria-label': label }
        : { 'aria-hidden': true })}
      data-testid="timegrapher-trace"
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className="mt-5 w-full shrink-0 rounded-lg border border-ink/10 bg-ink/[0.02] short:mx-auto short:mt-3 short:h-[34dvh] short:w-auto"
      style={{ aspectRatio: `${String(WIDTH)} / ${String(HEIGHT)}` }}
    >
      <g className="stroke-ink" strokeWidth="0.5" shapeRendering="crispEdges">
        {lines.map(ms => (
          <line
            key={ms}
            x1={LEFT}
            x2={RIGHT}
            y1={yOf(ms)}
            y2={yOf(ms)}
            strokeOpacity={ms % LABEL_MS === 0 ? 0.14 : 0.05}
          />
        ))}
        {columns.map(x => (
          <line
            key={x}
            x1={x}
            x2={x}
            y1={TOP}
            y2={BOTTOM}
            strokeOpacity={0.05}
          />
        ))}
      </g>
      <line
        x1={LEFT}
        x2={RIGHT}
        y1={yOf(0)}
        y2={yOf(0)}
        className="stroke-accent"
        strokeOpacity={0.55}
        strokeWidth="0.75"
      />
      <g className="fill-ink-3" fontSize={LABEL_SIZE} textAnchor="end">
        {lines
          .filter(ms => ms % LABEL_MS === 0)
          .map(ms => (
            <text key={ms} x={LEFT - 4} y={yOf(ms) + LABEL_SIZE * 0.35}>
              {ms > 0 ? `+${String(ms)}` : ms < 0 ? `−${String(-ms)}` : '0'}
            </text>
          ))}
        <text x={RIGHT - 3} y={TOP + LABEL_SIZE + 1}>
          {t.timegrapher.late}
        </text>
        <text x={RIGHT - 3} y={BOTTOM - 4}>
          {t.timegrapher.early}
        </text>
      </g>
      {children}
    </svg>
  );
}
