import { en } from '../i18n/en';
import { useT } from '../i18n/use-t';
import { WATCHES } from '../watches';

/** The names that stay English in every language, longest first. */
const NAMES = [
  ...Object.values(WATCHES).map(watch => watch.name),
  ...Object.values(en.certificates),
  en.collection.endless,
  en.timegrapher.title,
  'Daily',
].sort((a, b) => b.length - a.length);

/** Splits around the names, keeping them as every other part. */
const NAME_PATTERN = new RegExp(`(${NAMES.join('|')})`);

/**
 * A sentence with the English names in it marked as English, so a screen
 * reader's Turkish voice doesn't read "Chronometer" with Turkish sounds.
 * In English it is the plain text.
 */
export function WithEnglishNames({ children }: { children: string }) {
  const { locale } = useT();
  if (locale === 'en') return children;
  return children.split(NAME_PATTERN).map((part, index) =>
    index % 2 === 1 ? (
      <span key={index} lang="en">
        {part}
      </span>
    ) : (
      part
    )
  );
}
