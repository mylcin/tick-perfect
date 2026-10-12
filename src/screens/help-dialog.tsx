import type { ReactNode } from 'react';

import { IconButton } from '../components/buttons';
import { WithEnglishNames } from '../components/english';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import type { ScoringConfig } from '../game';
import { useWatchRules } from '../hooks/use-watch-rules';
import { listOf } from '../i18n/format';
import { useT } from '../i18n/use-t';
import { useSession } from '../state/session';
import { WATCHES } from '../watches';

/**
 * How to play, on four cards: tap as the hand meets the marker, the bright
 * core is a Perfect, Perfects in a row multiply the score, and the rule of
 * the watch on show, by the rules it is played by now. Opened from the
 * title's top-left corner.
 */
export function HelpDialog() {
  const t = useT();
  const open = useSession(state => state.helpOpen);
  const setOpen = useSession(state => state.setHelpOpen);
  const watch = useSession(state => state.watch);
  const { name } = WATCHES[watch];
  const { scoring } = useWatchRules(watch);
  const close = () => {
    setOpen(false);
  };
  const tiers = listOf(
    t,
    scoring.multipliers.map(tier => t.help.tier(tier.streak, tier.factor))
  );

  return (
    <Modal
      open={open}
      labelledBy="help-heading"
      onCancel={close}
      testId="help-dialog"
    >
      <div className="absolute inset-0 bg-surface/60" onClick={close} />
      <div className="absolute inset-y-0 right-0 flex w-full animate-rise flex-col overflow-y-auto border-l border-ink/10 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-6 sm:max-w-sm">
        <div className="flex items-center justify-between">
          <h2
            id="help-heading"
            className="text-xs tracking-[0.4em] text-ink-2 uppercase"
          >
            {t.help.title}
          </h2>
          <IconButton
            label={t.help.close}
            data-testid="help-close"
            data-autofocus
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        </div>

        <ol className="mt-6 flex flex-col gap-3 short:mt-3 short:gap-2">
          <Card title={t.help.tapTitle} picture={<TapPicture />}>
            {t.help.tap}
          </Card>
          <Card
            title={t.help.perfectTitle}
            picture={<PerfectPicture scoring={scoring} />}
          >
            {t.help.perfect(scoring.perfectPoints, scoring.goodPoints)}
          </Card>
          <Card
            title={t.help.streakTitle}
            picture={<StreakPicture scoring={scoring} />}
          >
            {t.help.streak(tiers)}
          </Card>
          <Card
            title={
              <WithEnglishNames>{t.help.watchTitle(name)}</WithEnglishNames>
            }
            picture={<WatchPicture />}
          >
            <WithEnglishNames>{t.rules[watch]}</WithEnglishNames>
          </Card>
        </ol>
      </div>
    </Modal>
  );
}

/** One rule: its picture, then a heading and a sentence or two. */
function Card({
  title,
  picture,
  children,
}: {
  title: ReactNode;
  picture: ReactNode;
  children: ReactNode;
}) {
  return (
    <li className="flex items-center gap-4 rounded-2xl border border-ink/10 bg-ink/[0.02] py-3 pr-4 pl-3 short:py-2">
      {picture}
      <div className="min-w-0">
        <h3 className="text-[0.95rem] text-ink">{title}</h3>
        <p className="mt-0.5 text-xs leading-relaxed text-balance text-ink-3">
          {children}
        </p>
      </div>
    </li>
  );
}

/**
 * A card's picture, drawn in the studio's own colours (ink for the watch,
 * the accent for the marker) so it reads in every studio, with the Perfect
 * core white, as it glows on every dial. Decoration: the card's words say
 * it all.
 */
function Picture({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 64 48"
      aria-hidden="true"
      focusable="false"
      className="h-12 w-16 shrink-0"
      fill="none"
      strokeLinecap="round"
    >
      {children}
    </svg>
  );
}

// The dial's pictures: an arc of the minute track round a centre below the
// picture, the marker on it a few degrees right of 12, and the hand coming
// in from the left. Points are on a circle of radius 34 round (32, 44).

/** The hand closing in on the marker. */
function TapPicture() {
  return (
    <Picture>
      <path
        d="M4.15 24.5A34 34 0 0 1 59.85 24.5"
        className="stroke-ink/25"
        strokeWidth="1"
      />
      <path
        d="M37.32 10.42A34 34 0 0 1 49.51 14.86"
        className="stroke-accent/60"
        strokeWidth="7"
        strokeLinecap="butt"
      />
      <path
        d="M42.22 11.57A34 34 0 0 1 45.01 12.59"
        className="stroke-accent"
        strokeWidth="7.6"
        strokeLinecap="butt"
      />
      <path
        d="M42.51 11.66A34 34 0 0 1 44.74 12.48"
        className="stroke-white"
        strokeWidth="6"
        strokeLinecap="butt"
      />
      {/* Where the hand was a moment ago, fading, then where it is. */}
      <path
        d="M32 44 27.96 15.28"
        className="stroke-ink/20"
        strokeWidth="1.4"
      />
      <path d="M32 44 35.03 15.16" className="stroke-ink" strokeWidth="1.6" />
      <circle cx="32" cy="44" r="2.2" className="fill-ink" />
    </Picture>
  );
}

/** The marker close up: a plain hit either side, the Perfect core between. */
function PerfectPicture({ scoring }: { scoring: ScoringConfig }) {
  return (
    <Picture>
      <rect
        x="6"
        y="20"
        width="52"
        height="11"
        rx="2"
        className="fill-accent/60"
      />
      <rect
        x="26"
        y="20"
        width="12"
        height="11"
        className="fill-white stroke-accent"
        strokeWidth="1"
      />
      <path d="M32 46V34" className="stroke-ink" strokeWidth="1.6" />
      <g fontSize="9" textAnchor="middle" className="fill-ink-3">
        <text x="14" y="14">
          +{scoring.goodPoints}
        </text>
        <text x="50" y="14">
          +{scoring.goodPoints}
        </text>
        <text x="32" y="14" className="fill-ink" fontWeight="600">
          +{scoring.perfectPoints}
        </text>
      </g>
    </Picture>
  );
}

/** The first multiplier's run of Perfects, lit as the HUD lights them. */
function StreakPicture({ scoring }: { scoring: ScoringConfig }) {
  const [first] = scoring.multipliers;
  // As many diamonds as fit beside the badge.
  const count = Math.min(first.streak, 4);
  return (
    <Picture>
      {Array.from({ length: count }, (_, index) => (
        <rect
          key={index}
          x={6 + index * 9}
          y="21"
          width="5.5"
          height="5.5"
          transform={`rotate(45 ${String(8.75 + index * 9)} 23.75)`}
          className="fill-accent stroke-accent"
          strokeWidth="1"
        />
      ))}
      <rect
        x={8 + count * 9}
        y="16"
        width="20"
        height="15"
        rx="7.5"
        className="stroke-accent/70"
        strokeWidth="1"
      />
      <text
        x={18 + count * 9}
        y="26.5"
        fontSize="9"
        fontWeight="600"
        textAnchor="middle"
        className="fill-accent"
      >
        ×{first.factor}
      </text>
    </Picture>
  );
}

/** A watch seen from the front: lugs, case, crown, the hour marks, hands. */
function WatchPicture() {
  const marks = Array.from({ length: 12 }, (_, index) => {
    const angle = (index * Math.PI) / 6;
    const [inner, outer] = index % 3 === 0 ? [10.5, 13] : [11.5, 13];
    return {
      key: index,
      x1: 32 + inner * Math.sin(angle),
      y1: 24 - inner * Math.cos(angle),
      x2: 32 + outer * Math.sin(angle),
      y2: 24 - outer * Math.cos(angle),
    };
  });
  return (
    <Picture>
      <path
        d="M25 9.5 26 3h12l1 6.5M25 38.5 26 45h12l1-6.5"
        className="stroke-ink-3"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <rect
        x="48"
        y="21.5"
        width="3.5"
        height="5"
        rx="1"
        className="fill-ink-3"
      />
      <circle
        cx="32"
        cy="24"
        r="16"
        className="fill-surface stroke-ink-2"
        strokeWidth="1.4"
      />
      <g className="stroke-ink-3" strokeWidth="1">
        {marks.map(({ key, ...line }) => (
          <line key={key} {...line} />
        ))}
      </g>
      {/* The marker on the track, lit. */}
      <path
        d="M36.1 11.65A13 13 0 0 1 39.65 13.47"
        className="stroke-accent"
        strokeWidth="3"
        strokeLinecap="butt"
      />
      <path
        d="M32 24 28.3 19.6M32 24l2.33-8.69"
        className="stroke-ink"
        strokeWidth="1.4"
      />
      <circle cx="32" cy="24" r="1.4" className="fill-ink" />
    </Picture>
  );
}
