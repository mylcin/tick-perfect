// Certificates are named after chronometer testing: a watch is Adjusted,
// then a Chronometer, then fit for the Observatory trials. Each is earned
// by a best score on that watch, so they are worked out, never saved.

export type CertificateTier = 'adjusted' | 'chronometer' | 'observatory';

interface Certificate {
  readonly tier: CertificateTier;
  readonly score: number;
}

/** Lowest first. Adjusted is also the score that unlocks the next watch. */
export const CERTIFICATES: readonly [Certificate, ...Certificate[]] = [
  { tier: 'adjusted', score: 15 },
  { tier: 'chronometer', score: 40 },
  { tier: 'observatory', score: 75 },
];

/** The score that unlocks the next watch in the collection. */
export const UNLOCK_SCORE = CERTIFICATES[0].score;

/** The highest certificate a best score has earned, if any. */
export function certificateFor(best: number): CertificateTier | null {
  let earned: CertificateTier | null = null;
  for (const { tier, score } of CERTIFICATES) if (best >= score) earned = tier;
  return earned;
}

/** The next certificate to aim for, or null once all are earned. */
export function nextCertificate(best: number): Certificate | null {
  return CERTIFICATES.find(({ score }) => best < score) ?? null;
}
