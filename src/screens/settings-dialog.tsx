import { useId, useState, type ChangeEvent } from 'react';

import { Button, FOCUS, FOCUS_WITHIN, IconButton } from '../components/buttons';
import { CloseIcon } from '../components/icons';
import { Modal } from '../components/modal';
import { SwitchRow } from '../components/switch-row';
import { canVibrate } from '../feedback/haptics';
import { usePrefersReducedMotion } from '../hooks/use-prefers-reduced-motion';
import { DICTIONARIES, LANGUAGES, type Dictionary } from '../i18n';
import { useT } from '../i18n/use-t';
import { online } from '../online';
import { appStore, useAppState } from '../state/app';
import { cloudSaveOf } from '../state/app-store';
import {
  backupFile,
  MAX_BACKUP_BYTES,
  readBackup,
  type RestoreOutcome,
} from '../state/backup';
import { useSession } from '../state/session';
import { THEME_SETTINGS } from '../state/settings';

/**
 * Sound, vibration, appearance, night mode, motion and language, saved as
 * they change; then backing progress up to a file and restoring it.
 */
export function SettingsDialog() {
  const t = useT();
  const open = useSession(state => state.settingsOpen);
  const setOpen = useSession(state => state.setSettingsOpen);
  const settings = useAppState(state => state.settings);
  const update = useAppState(state => state.updateSettings);
  const systemReducedMotion = usePrefersReducedMotion();
  const vibrationSupported = canVibrate();
  const close = () => {
    setOpen(false);
  };

  return (
    <Modal
      open={open}
      labelledBy="settings-heading"
      onCancel={close}
      testId="settings-dialog"
    >
      <div className="absolute inset-0 bg-surface/60" onClick={close} />
      <div className="absolute inset-y-0 right-0 flex w-full animate-rise flex-col overflow-y-auto border-l border-ink/10 bg-surface pt-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-6 sm:max-w-sm">
        <div className="flex items-center justify-between">
          <h2
            id="settings-heading"
            className="text-xs tracking-[0.4em] text-ink-2 uppercase"
          >
            {t.settings.title}
          </h2>
          <IconButton
            label={t.settings.close}
            data-testid="settings-close"
            data-autofocus
            onClick={close}
          >
            <CloseIcon />
          </IconButton>
        </div>

        <div className="mt-6 divide-y divide-ink/[0.07]">
          <SwitchRow
            label={t.settings.sound}
            checked={settings.sound}
            onChange={sound => {
              update({ sound });
            }}
          />
          <SwitchRow
            label={t.settings.vibration}
            checked={vibrationSupported && settings.vibration}
            disabled={!vibrationSupported}
            {...(!vibrationSupported && {
              description: t.settings.vibrationUnsupported,
            })}
            onChange={vibration => {
              update({ vibration });
            }}
          />
          <ChoiceField
            legend={t.settings.appearance}
            name="theme"
            options={THEME_SETTINGS}
            value={settings.theme}
            label={theme => t.settings.themes[theme]}
            onChange={theme => {
              update({ theme });
            }}
          />
          <SwitchRow
            label={t.settings.night}
            description={t.settings.nightHint}
            checked={settings.night}
            onChange={night => {
              update({ night });
            }}
          />
          <SwitchRow
            label={t.settings.reducedMotion}
            description={
              settings.reducedMotion === null
                ? t.settings.reducedMotionSystem
                : t.settings.reducedMotionHint
            }
            checked={settings.reducedMotion ?? systemReducedMotion}
            // Back to the system's choice, not a copy of it, so a later
            // change there is followed again.
            onChange={reducedMotion => {
              update({
                reducedMotion:
                  reducedMotion === systemReducedMotion ? null : reducedMotion,
              });
            }}
          />
          <SwitchRow
            label={t.settings.batterySaver}
            description={t.settings.batterySaverHint}
            checked={settings.batterySaver}
            onChange={batterySaver => {
              update({ batterySaver });
            }}
          />

          {/* Each language's name in itself, marked as such. */}
          <ChoiceField
            legend={t.settings.language}
            name="language"
            options={LANGUAGES}
            value={settings.language}
            label={language => DICTIONARIES[language].languageName}
            lang={language => language}
            onChange={language => {
              update({ language });
            }}
          />
          <ProgressBackup t={t} />
        </div>

        <p className="mt-auto pt-6 text-xs">
          <a
            href="/privacy"
            className={`rounded-sm text-ink-3 underline underline-offset-2 hover:text-ink ${FOCUS}`}
          >
            {t.settings.privacy}
          </a>
        </p>
      </div>
    </Modal>
  );
}

/** Hands the browser `text` to save as a file called `name`. */
function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'application/json' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  // Long after the browser has taken the file.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}

/** Whether `restore` brought anything in: everything earned, compared. */
function earnedNow(): string {
  return JSON.stringify(cloudSaveOf(appStore.getState()));
}

/**
 * Progress lives in this browser alone, so it can be saved as a file and
 * restored from one, here or on another device. Restoring merges like a
 * sync does: whatever is in the file and not here is added, and nothing
 * here is ever lost to an older file.
 */
function ProgressBackup({ t }: { t: Dictionary }) {
  const id = useId();
  const mergeSaved = useAppState(state => state.mergeSaved);
  // Counts each outcome, so restoring the same file twice is said twice.
  const [outcome, setOutcome] = useState<{
    kind: RestoreOutcome;
    count: number;
  } | null>(null);
  const report = (kind: RestoreOutcome) => {
    setOutcome(current => ({ kind, count: (current?.count ?? 0) + 1 }));
  };

  const backUp = () => {
    const file = backupFile(cloudSaveOf(appStore.getState()), new Date());
    download(file.name, file.text);
  };
  const restore = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared, so picking the same file again restores it again.
    input.value = '';
    if (!file) return;
    if (file.size > MAX_BACKUP_BYTES) {
      report('foreign');
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch {
      report('unreadable');
      return;
    }
    const reading = readBackup(text);
    if (!reading.ok) {
      report(reading.error);
      return;
    }
    const before = earnedNow();
    mergeSaved(reading.saved);
    const changed = earnedNow() !== before;
    // An account takes what the file brought in, too.
    if (changed) online.progressChanged();
    report(changed ? 'restored' : 'unchanged');
  };

  return (
    <div
      role="group"
      aria-labelledby={`${id}-label`}
      aria-describedby={`${id}-hint`}
      className="py-3.5 short:py-2"
    >
      <p id={`${id}-label`} className="text-[0.95rem] text-ink">
        {t.settings.progress}
      </p>
      <p id={`${id}-hint`} className="mt-0.5 text-xs text-ink-3 short:sr-only">
        {t.settings.progressHint}
      </p>
      <div className="mt-3 flex flex-wrap gap-2 short:mt-2">
        <Button className="min-h-11! px-4!" onClick={backUp}>
          {t.settings.backUp}
        </Button>
        {/* The file picker itself is hidden in its label, as a button. */}
        <label
          className={`inline-flex min-h-11 cursor-pointer items-center justify-center rounded-full border border-ink/15 bg-surface/70 px-4 text-sm font-medium tracking-[0.08em] whitespace-nowrap text-ink transition-colors duration-300 hover:border-ink/30 hover:bg-ink/10 ${FOCUS_WITHIN}`}
        >
          <input
            type="file"
            accept=".json,application/json"
            className="sr-only"
            onChange={event => void restore(event)}
          />
          {t.settings.restore}
        </label>
      </div>
      <p
        role="status"
        data-testid="backup-status"
        {...(outcome && { 'data-outcome': outcome.kind })}
        className={`text-xs text-ink-2 ${outcome ? 'mt-2' : ''}`}
      >
        {outcome && t.settings.restoreOutcomes[outcome.kind]}
        {/* A repeated message must change to be announced again. */}
        {outcome && outcome.count % 2 === 0 ? ' ' : ''}
      </p>
    </div>
  );
}

/**
 * One of a few choices, as a row of segments: radios, each hidden in its
 * label, so the group is named by its legend and arrows move along it. A
 * floated legend sits inside the padding like the rows' labels (a plain one
 * is drawn on the border).
 */
function ChoiceField<Option extends string>({
  legend,
  name,
  options,
  value,
  label,
  lang,
  onChange,
}: {
  legend: string;
  name: string;
  options: readonly Option[];
  value: Option;
  label: (option: Option) => string;
  lang?: (option: Option) => string;
  onChange: (option: Option) => void;
}) {
  return (
    <fieldset className="py-3.5 short:py-2">
      <legend className="float-left w-full pb-3 text-[0.95rem] text-ink short:pb-2">
        {legend}
      </legend>
      <div className="clear-left grid auto-cols-fr grid-flow-col gap-1 rounded-full border border-ink/10 p-1">
        {options.map(option => (
          <label
            key={option}
            lang={lang?.(option)}
            className={`relative cursor-pointer rounded-full py-2 text-center text-sm text-ink-3 transition-colors has-checked:bg-ink has-checked:text-surface ${FOCUS_WITHIN}`}
          >
            <input
              type="radio"
              name={name}
              value={option}
              checked={value === option}
              onChange={() => {
                onChange(option);
              }}
              className="sr-only"
            />
            {label(option)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
