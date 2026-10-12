import { Fragment, useEffect, type ReactNode } from 'react';

import { FOCUS } from '../components/buttons';
import { DICTIONARIES, LANGUAGES } from '../i18n';
import { useAppState } from '../state/app';
import { DEPLOYED_FACTS } from './facts';
import { NOTICES, type Block, type NoticeFacts } from './notice';

// The privacy notice at /privacy, in the player's language, with a switch
// to the other. Its own chunk: players who never open it never load it.

const LINK = `rounded-sm text-accent underline decoration-accent/40 underline-offset-2 hover:decoration-accent ${FOCUS}`;

/** Only links the notice itself writes: the web, email, this site. */
const SAFE_HREF = /^(https:\/\/|mailto:|\/)/;

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;

/** A paragraph's text, with its [links](url) and **bold** parts. */
export function Rich({ text }: { text: string }): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of text.matchAll(INLINE)) {
    parts.push(text.slice(last, match.index));
    const [whole, label, href, bold] = match;
    if (bold !== undefined) {
      parts.push(
        <strong key={match.index} className="font-medium text-ink">
          {bold}
        </strong>
      );
    } else if (label !== undefined && href && SAFE_HREF.test(href)) {
      parts.push(
        <a
          key={match.index}
          href={href}
          className={LINK}
          {...(href.startsWith('https://') && { rel: 'noreferrer' })}
        >
          {label}
        </a>
      );
    } else {
      parts.push(whole);
    }
    last = match.index + whole.length;
  }
  parts.push(text.slice(last));
  return parts.map((part, index) => <Fragment key={index}>{part}</Fragment>);
}

function Blocks({ blocks }: { blocks: readonly Block[] }) {
  return blocks.map((block, index) =>
    typeof block === 'string' ? (
      <p key={index} className="mt-3">
        <Rich text={block} />
      </p>
    ) : (
      <ul key={index} className="mt-3 list-disc space-y-2 pl-5">
        {block.list.map(item => (
          <li key={item}>
            <Rich text={item} />
          </li>
        ))}
      </ul>
    )
  );
}

export default function PrivacyPage({
  facts = DEPLOYED_FACTS,
}: {
  facts?: NoticeFacts;
}) {
  const language = useAppState(state => state.settings.language);
  const update = useAppState(state => state.updateSettings);
  const notice = NOTICES[language](facts);

  useEffect(() => {
    document.getElementById('root')?.removeAttribute('data-shell');
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.title = `${notice.title} · Tick Perfect`;
  }, [language, notice.title]);

  return (
    <main
      data-testid="privacy-page"
      className="min-h-dvh px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))] text-[0.95rem] leading-relaxed text-ink-2"
    >
      <article className="mx-auto max-w-2xl">
        <nav className="flex flex-wrap items-center justify-between gap-4 text-sm">
          <a href="/" className={LINK}>
            ← {notice.back}
          </a>
          <div
            role="group"
            aria-label={notice.languages}
            className="flex gap-1 rounded-full border border-ink/10 p-1"
          >
            {LANGUAGES.map(option => (
              <button
                key={option}
                type="button"
                lang={option}
                aria-pressed={option === language}
                onClick={() => {
                  update({ language: option });
                }}
                className={`min-h-9 rounded-full px-4 text-xs ${FOCUS} ${
                  option === language
                    ? 'bg-ink text-surface'
                    : 'text-ink-3 hover:text-ink'
                }`}
              >
                {DICTIONARIES[option].languageName}
              </button>
            ))}
          </div>
        </nav>

        <h1 className="mt-10 text-2xl font-medium text-ink">{notice.title}</h1>
        <p data-testid="privacy-updated" className="mt-1 text-sm text-ink-3">
          {notice.updated}
        </p>
        <Blocks blocks={notice.intro} />

        {notice.sections.map(section => (
          <section
            key={section.id}
            id={section.id}
            data-testid="privacy-section"
            data-section={section.id}
            aria-labelledby={`${section.id}-heading`}
            className="mt-10"
          >
            <h2
              id={`${section.id}-heading`}
              className="text-lg font-medium text-ink"
            >
              {section.title}
            </h2>
            <Blocks blocks={section.blocks} />
          </section>
        ))}
      </article>
    </main>
  );
}
