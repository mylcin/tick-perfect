import { useState, type ReactNode } from 'react';

import { FOCUS_WITHIN, IconButton } from '../components/buttons';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import type { Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { useAppState } from '../state/app';
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
 * Perfect share underneath. Opened from the title, under Settings.
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
      </div>
    </Modal>
  );
}

/** Mounted afresh each time the panel opens, on the watch on show. */
function Readings({ t }: { t: Dictionary }) {
  const timing = useAppState(state => state.timing);
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
    </>
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
