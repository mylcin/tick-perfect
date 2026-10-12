import { describe, expect, it } from 'vitest';

import { LANGUAGES } from '../i18n';
import { NOTICES, type Block, type Notice, type NoticeFacts } from './notice';

const ONLINE: NoticeFacts = {
  controller: 'Ada Lovelace',
  email: 'privacy@example.com',
  online: true,
  repository: 'https://github.com/example/tick-perfect',
};
const OFFLINE: NoticeFacts = {
  controller: null,
  email: null,
  online: false,
  repository: ONLINE.repository,
};

function textOf(notice: Notice): string {
  const blocks = (list: readonly Block[]) =>
    list.map(block =>
      typeof block === 'string' ? block : block.list.join('\n')
    );
  return [
    notice.title,
    notice.updated,
    ...blocks(notice.intro),
    ...notice.sections.flatMap(section => [
      section.title,
      ...blocks(section.blocks),
    ]),
  ].join('\n');
}

describe('the privacy notice', () => {
  it.each(LANGUAGES)('says the same things in %s', language => {
    for (const facts of [ONLINE, OFFLINE]) {
      const ids = (notice: Notice) =>
        notice.sections.map(section => section.id);
      expect(ids(NOTICES[language](facts))).toEqual(ids(NOTICES.en(facts)));
    }
  });

  it.each(LANGUAGES)(
    'covers what the GDPR and the KVKK ask for, online, in %s',
    language => {
      expect(
        NOTICES[language](ONLINE).sections.map(section => section.id)
      ).toEqual([
        'controller',
        'playing',
        'reports',
        'account',
        'recipients',
        'retention',
        'rights',
        'children',
        'changes',
      ]);
    }
  );

  it.each(LANGUAGES)(
    'names the controller and how to reach them in %s',
    language => {
      const text = textOf(NOTICES[language](ONLINE));
      expect(text).toContain('Ada Lovelace');
      expect(text).toContain(
        '[privacy@example.com](mailto:privacy@example.com)'
      );
    }
  );

  it.each(LANGUAGES)(
    'leaves sign-in and reports out of an offline build in %s',
    language => {
      const notice = NOTICES[language](OFFLINE);
      expect(notice.sections.map(section => section.id)).not.toContain(
        'account'
      );
      const text = textOf(notice);
      expect(text).not.toMatch(/Supabase|Google|GitHub, Inc\./);
      expect(text).toContain(OFFLINE.repository);
    }
  );

  it.each(LANGUAGES)('writes only safe, finished links in %s', language => {
    for (const facts of [ONLINE, OFFLINE]) {
      const text = textOf(NOTICES[language](facts));
      for (const [, href] of text.matchAll(/\]\(([^)]+)\)/g)) {
        expect(href).toMatch(/^(https:\/\/|mailto:)/);
      }
      expect(text).not.toMatch(/\bnull\b|\bundefined\b|\$\{/);
    }
  });

  it('dates itself in each language', () => {
    expect(NOTICES.en(ONLINE).updated).toBe('Last updated 11 October 2026');
    expect(NOTICES.tr(ONLINE).updated).toBe('Son güncelleme: 11 Ekim 2026');
  });

  it('says what is public, and how long things are kept', () => {
    const text = textOf(NOTICES.en(ONLINE));
    expect(text).toContain('Your display name and best scores are public');
    expect(text).toContain('Error reports: 30 days.');
    expect(text).toContain('The taps of a ranked round: 30 days.');
    expect(text).toContain('Vercel’s request logs: up to a day.');
    expect(text).toContain('until you delete your account');
  });

  it.each(LANGUAGES)(
    'promises no answer in a build that names no one, in %s',
    language => {
      const text = textOf(NOTICES[language](OFFLINE));
      expect(text).not.toMatch(/We answer within|ücretsiz olarak yanıtlanır/);
      expect(text).not.toMatch(/mailto:/);
    }
  );

  it.each(LANGUAGES)(
    'claims no transfer safeguard that isn’t in place, in %s',
    language => {
      const text = textOf(NOTICES[language](ONLINE));
      expect(text).toMatch(
        /Article 9 of the KVKK applies|9\. maddesi uygulanır/
      );
      expect(text).not.toMatch(/appropriate safeguards|uygun güvence/);
    }
  );

  it('says progress is uploaded on sign-in, and settings never are', () => {
    const text = textOf(NOTICES.en(ONLINE));
    expect(text).toContain('copied to your account when you sign in');
    expect(text).toContain('Your settings stay on your device.');
    expect(textOf(NOTICES.tr(ONLINE))).toContain(
      'Ayarlarınız cihazınızda kalır.'
    );
  });

  it.each(LANGUAGES)(
    'says a backup is a file kept on the player’s device, in %s',
    language => {
      for (const facts of [ONLINE, OFFLINE]) {
        expect(textOf(NOTICES[language](facts))).toMatch(
          /backup of your progress, made in the settings, is a file saved on your device|ilerleme yedeği, cihazınıza kaydedilen bir dosyadır/
        );
      }
    }
  );
});
