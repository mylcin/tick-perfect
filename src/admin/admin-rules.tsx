import { useEffect, useId, useState } from 'react';

import { Button } from '../components/buttons';
import { checkRules, type GameRules } from '../game';
import { online } from '../online';
import { WATCH_ORDER, WATCHES, type WatchId } from '../watches';
import { failureText } from './failure';

// Rules and seasons: a watch's rule versions, an editor that checks a new
// set and shows how simulated players would score with it, and publishing
// a version as the watch's new season or as an event.

export interface LiveSeasonRow {
  readonly id: number;
  readonly watch: WatchId;
  readonly kind: 'standard' | 'event';
  readonly name: string | null;
  readonly endsAt: string | null;
  readonly ruleset: { readonly id: number; readonly version: number };
  readonly rules: GameRules;
}

interface Version {
  readonly id: number;
  readonly version: number;
  readonly note: string | null;
  readonly createdAt: string;
  readonly author: string | null;
  readonly rules: unknown;
}

interface PreviewRow {
  readonly sigma: number;
  readonly median: number;
  readonly p90: number;
}

/** Simulated players by steadiness, as the balance test names them. */
const PLAYERS: Readonly<Record<number, string>> = {
  12: 'expert',
  18: 'very good',
  25: 'good',
  35: 'casual',
  45: 'first-timer',
};

const INPUT =
  'rounded-xl border border-white/15 bg-neutral-900 px-3 text-neutral-100 outline-none focus-visible:ring-[1.5px] focus-visible:ring-amber-200/60';

export function RulesPanel({
  seasons,
  superAdmin,
  onChanged,
}: {
  seasons: readonly LiveSeasonRow[];
  superAdmin: boolean;
  onChanged: () => void;
}) {
  const [watch, setWatch] = useState<WatchId>('diver');
  const live = seasons.find(season => season.watch === watch) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-wrap items-center gap-3 text-xs text-neutral-400">
        Watch
        <select
          value={watch}
          onChange={event => {
            setWatch(event.target.value as WatchId);
          }}
          className={`${INPUT} min-h-9`}
        >
          {WATCH_ORDER.map(id => (
            <option key={id} value={id}>
              {WATCHES[id].name}
            </option>
          ))}
        </select>
      </label>
      {/* Afresh for each watch, and when its live rules change. */}
      <WatchRules
        key={`${watch}:${String(live?.ruleset.id)}`}
        watch={watch}
        live={live}
        superAdmin={superAdmin}
        onChanged={onChanged}
      />
    </div>
  );
}

function WatchRules({
  watch,
  live,
  superAdmin,
  onChanged,
}: {
  watch: WatchId;
  live: LiveSeasonRow | null;
  superAdmin: boolean;
  onChanged: () => void;
}) {
  const [versions, setVersions] = useState<readonly Version[]>([]);
  const [reads, setReads] = useState(0);
  const [text, setText] = useState(() =>
    live ? JSON.stringify(live.rules, null, 2) : ''
  );
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<readonly PreviewRow[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const editorId = useId();

  useEffect(() => {
    online
      .call<{ rulesets: Version[] }>(`/admin/rulesets?watch=${watch}`)
      .then(value => {
        setVersions(value.rulesets);
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  }, [watch, reads]);
  const reload = () => {
    setReads(count => count + 1);
  };

  /** The editor's rules, checked here before the server checks them again. */
  const parsed = (): GameRules | null => {
    try {
      const check = checkRules(JSON.parse(text));
      if (check.ok) return check.rules;
      setMessage(check.errors.join('\n'));
    } catch {
      setMessage('The rules are not valid JSON.');
    }
    return null;
  };

  const runPreview = () => {
    const rules = parsed();
    if (!rules) return;
    setMessage('Simulating…');
    online
      .call<{ preview: PreviewRow[] }>('/admin/rulesets/preview', {
        method: 'POST',
        body: { rules },
      })
      .then(value => {
        setPreview(value.preview);
        setMessage(null);
      })
      .catch((error: unknown) => {
        setPreview(null);
        setMessage(failureText(error));
      });
  };

  const save = () => {
    const rules = parsed();
    if (!rules) return;
    online
      .call<{ version: number }>('/admin/rulesets', {
        method: 'POST',
        body: { watch, rules, note: note.trim() || null },
      })
      .then(value => {
        setMessage(
          `Saved as version ${String(value.version)}. Publish it to play it.`
        );
        setNote('');
        reload();
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  return (
    <>
      {live && (
        <p data-testid="admin-live-season">
          Live:{' '}
          {live.kind === 'event'
            ? `event “${live.name ?? ''}”`
            : 'standard season'}{' '}
          #{live.id}, rules version {live.ruleset.version}
          {live.endsAt && `, until ${new Date(live.endsAt).toLocaleString()}`}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor={editorId} className="text-xs text-neutral-400">
          Rules (JSON). Windows are in milliseconds and speeds in degrees a
          second; each ramp closes `rate` of the way to its `limit` per hit.
        </label>
        <textarea
          id={editorId}
          data-testid="admin-rules-editor"
          value={text}
          spellCheck={false}
          onChange={event => {
            setText(event.target.value);
            setPreview(null);
          }}
          className={`${INPUT} min-h-80 py-2 font-mono text-xs leading-relaxed`}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={runPreview}>Check and simulate</Button>
          <input
            aria-label="Note for this version"
            placeholder="Note for this version"
            value={note}
            maxLength={500}
            onChange={event => {
              setNote(event.target.value);
            }}
            className={`${INPUT} min-h-12 flex-1`}
          />
          <Button variant="primary" onClick={save}>
            Save as a new version
          </Button>
        </div>
        {message && (
          <p
            role="status"
            className="text-xs whitespace-pre-wrap text-amber-100"
          >
            {message}
          </p>
        )}
        {preview && <PreviewTable rows={preview} />}
      </div>

      <div>
        <h2 className="text-xs tracking-[0.3em] text-neutral-400 uppercase">
          Versions
        </h2>
        <ul data-testid="admin-versions" className="mt-3 flex flex-col gap-2">
          {versions.map(version => (
            <VersionRow
              key={version.id}
              watch={watch}
              version={version}
              live={version.id === live?.ruleset.id}
              superAdmin={superAdmin}
              onEdit={() => {
                setText(JSON.stringify(version.rules, null, 2));
                setPreview(null);
              }}
              onPublished={onChanged}
            />
          ))}
        </ul>
      </div>
    </>
  );
}

function PreviewTable({ rows }: { rows: readonly PreviewRow[] }) {
  return (
    <table
      data-testid="admin-preview"
      className="mt-2 w-full max-w-md text-left text-xs tabular-nums"
    >
      <caption className="pb-2 text-left text-neutral-400">
        Simulated players, 60 rounds each: their median score and the score one
        round in ten beats.
      </caption>
      <thead className="text-neutral-400">
        <tr>
          <th className="py-1 font-normal">Player</th>
          <th className="py-1 font-normal">Timing spread</th>
          <th className="py-1 font-normal">Median</th>
          <th className="py-1 font-normal">Top 10%</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.sigma} className="border-t border-white/10">
            <td className="py-1">{PLAYERS[row.sigma] ?? ''}</td>
            <td className="py-1">±{row.sigma} ms</td>
            <td className="py-1">{row.median}</td>
            <td className="py-1">{row.p90}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VersionRow({
  watch,
  version,
  live,
  superAdmin,
  onEdit,
  onPublished,
}: {
  watch: WatchId;
  version: Version;
  live: boolean;
  superAdmin: boolean;
  onEdit: () => void;
  onPublished: () => void;
}) {
  const [publishing, setPublishing] = useState<'standard' | 'event' | null>(
    null
  );
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-white/10 px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="font-medium">
          v{version.version}
          {live && <span className="ml-2 text-xs text-amber-100">live</span>}
        </span>
        <span className="flex-1 text-xs text-neutral-400">
          {version.note ?? 'No note'} · {version.author ?? 'the game'} ·{' '}
          {new Date(version.createdAt).toLocaleDateString()}
        </span>
        <Button variant="quiet" className="min-h-9! px-3!" onClick={onEdit}>
          Edit a copy
        </Button>
        {superAdmin && (
          <>
            <Button
              className="min-h-9! px-3!"
              onClick={() => {
                setPublishing('standard');
              }}
            >
              Publish
            </Button>
            <Button
              className="min-h-9! px-3!"
              onClick={() => {
                setPublishing('event');
              }}
            >
              Run as event
            </Button>
          </>
        )}
      </div>
      {publishing && (
        <PublishForm
          watch={watch}
          version={version}
          kind={publishing}
          onDone={() => {
            setPublishing(null);
            onPublished();
          }}
          onCancel={() => {
            setPublishing(null);
          }}
        />
      )}
    </li>
  );
}

function PublishForm({
  watch,
  version,
  kind,
  onDone,
  onCancel,
}: {
  watch: WatchId;
  version: Version;
  kind: 'standard' | 'event';
  onDone: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const publish = () => {
    if (kind === 'event' && (!startsAt || !endsAt)) {
      setMessage('An event needs a start and an end.');
      return;
    }
    online
      .call('/admin/seasons', {
        method: 'POST',
        body: {
          watch,
          rulesetId: version.id,
          kind,
          name: name.trim() || null,
          ...(kind === 'event' && {
            startsAt: new Date(startsAt).toISOString(),
            endsAt: new Date(endsAt).toISOString(),
          }),
        },
      })
      .then(onDone)
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  return (
    <form
      data-testid="admin-publish"
      className="flex flex-wrap items-end gap-2 border-t border-white/10 pt-2"
      onSubmit={event => {
        event.preventDefault();
        publish();
      }}
    >
      <p className="w-full text-xs text-neutral-400">
        {kind === 'standard'
          ? `Plays v${String(version.version)} on the ${WATCHES[watch].name} from now on, on a fresh board.`
          : `Plays v${String(version.version)} on its own board between two times (your time zone).`}
      </p>
      <input
        aria-label={kind === 'standard' ? 'Season name' : 'Event name'}
        placeholder={
          kind === 'standard' ? 'Season name (optional)' : 'Event name'
        }
        value={name}
        maxLength={60}
        onChange={event => {
          setName(event.target.value);
        }}
        className={`${INPUT} min-h-10 flex-1`}
      />
      {kind === 'event' && (
        <>
          <input
            type="datetime-local"
            aria-label="Starts"
            value={startsAt}
            onChange={event => {
              setStartsAt(event.target.value);
            }}
            className={`${INPUT} min-h-10`}
          />
          <input
            type="datetime-local"
            aria-label="Ends"
            value={endsAt}
            onChange={event => {
              setEndsAt(event.target.value);
            }}
            className={`${INPUT} min-h-10`}
          />
        </>
      )}
      <Button variant="primary" className="min-h-10!" onClick={publish}>
        Confirm
      </Button>
      <Button variant="quiet" className="min-h-10!" onClick={onCancel}>
        Cancel
      </Button>
      {message && (
        <p role="status" className="w-full text-xs text-amber-100">
          {message}
        </p>
      )}
    </form>
  );
}
