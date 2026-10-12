import { useEffect, useState } from 'react';

import { Button } from '../components/buttons';
import { online } from '../online';
import { failureText } from './failure';

// The switches a super admin flips without a deploy, and the log of every
// admin action.

export interface AdminSettings {
  readonly 'leaderboard.enabled': boolean;
  readonly 'submissions.enabled': boolean;
  readonly announcement: string | null;
}

const SWITCHES = [
  ['leaderboard.enabled', 'Boards shown and rounds ranked'],
  [
    'submissions.enabled',
    'New ranked rounds taken (off: the boards are read-only)',
  ],
] as const;

export function SettingsPanel({
  settings,
  onChanged,
}: {
  settings: AdminSettings;
  onChanged: () => void;
}) {
  const [announcement, setAnnouncement] = useState(settings.announcement ?? '');
  const [message, setMessage] = useState<string | null>(null);

  const put = (key: keyof AdminSettings, value: unknown) => {
    online
      .call('/admin/settings', { method: 'PUT', body: { key, value } })
      .then(() => {
        setMessage('Saved. Pages pick it up within a minute.');
        onChanged();
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  };

  return (
    <div className="flex max-w-xl flex-col gap-4">
      {SWITCHES.map(([key, label]) => (
        <label key={key} className="flex items-center gap-3">
          <input
            type="checkbox"
            data-testid={`admin-setting-${key}`}
            checked={settings[key]}
            onChange={event => {
              put(key, event.target.checked);
            }}
            className="size-5 accent-amber-200"
          />
          {label}
        </label>
      ))}
      <label className="flex flex-col gap-2">
        Announcement over the boards (empty for none)
        <input
          value={announcement}
          maxLength={200}
          onChange={event => {
            setAnnouncement(event.target.value);
          }}
          className="min-h-12 rounded-xl border border-white/15 bg-neutral-900 px-3 text-neutral-100"
        />
      </label>
      <div>
        <Button
          onClick={() => {
            put('announcement', announcement.trim() || null);
          }}
        >
          Save the announcement
        </Button>
      </div>
      {message && (
        <p role="status" className="text-xs text-amber-100">
          {message}
        </p>
      )}
    </div>
  );
}

interface AuditEntry {
  readonly id: number;
  readonly action: string;
  readonly target: string | null;
  readonly actor: string | null;
  readonly at: string;
  readonly payload: unknown;
}

export function AuditPanel() {
  const [entries, setEntries] = useState<readonly AuditEntry[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    online
      .call<{ entries: AuditEntry[] }>('/admin/audit')
      .then(value => {
        setEntries(value.entries);
      })
      .catch((error: unknown) => {
        setMessage(failureText(error));
      });
  }, []);

  return (
    <div>
      {message && (
        <p role="status" className="text-xs text-amber-100">
          {message}
        </p>
      )}
      <table data-testid="admin-audit" className="w-full text-left text-xs">
        <thead className="text-neutral-400">
          <tr>
            <th className="py-1 font-normal">When</th>
            <th className="py-1 font-normal">Who</th>
            <th className="py-1 font-normal">What</th>
            <th className="py-1 font-normal">On</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(entry => (
            <tr key={entry.id} className="border-t border-white/10 align-top">
              <td className="py-1 pr-3 tabular-nums">
                {new Date(entry.at).toLocaleString()}
              </td>
              <td className="py-1 pr-3">{entry.actor ?? '—'}</td>
              <td className="py-1 pr-3">{entry.action}</td>
              <td className="py-1 break-all">{entry.target ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
