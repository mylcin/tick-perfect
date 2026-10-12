import { CERTIFICATES, type CertificateTier } from '../state/certificates';

/**
 * Three small diamonds, filled up to the certificate earned. Shape and fill
 * carry it, not colour; screen readers get `label`.
 */
export function CertificatePips({
  tier,
  label,
  className = '',
}: {
  tier: CertificateTier | null;
  label: string;
  className?: string;
}) {
  const earned = tier ? CERTIFICATES.findIndex(c => c.tier === tier) + 1 : 0;
  return (
    <span
      role="img"
      aria-label={label}
      // A certificate's name is English in every language.
      {...(tier && { lang: 'en' })}
      data-testid="certificate-pips"
      data-tier={tier ?? 'none'}
      className={`inline-flex items-center gap-1 ${className}`}
    >
      {CERTIFICATES.map(({ tier: pip }, index) => (
        <span
          key={pip}
          className={`size-1.5 rotate-45 border ${
            index < earned
              ? 'border-accent bg-accent'
              : 'border-ink/30 bg-transparent'
          }`}
        />
      ))}
    </span>
  );
}
