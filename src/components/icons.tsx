import type { SVGProps } from 'react';

// Line icons drawn on a 24 × 24 grid. They are decorative: the button that
// holds one carries the accessible name.

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    />
  );
}

export function PauseIcon() {
  return (
    <Icon>
      <path d="M9 6v12M15 6v12" />
    </Icon>
  );
}

/**
 * A gear: eight tapered teeth round a hub. (A hub with spokes alone reads
 * as a sun.)
 */
export function SettingsIcon() {
  return (
    <Icon>
      <path d="M10.26 5.01L10.53 2.72A9.4 9.4 0 0 1 13.47 2.72L13.74 5.01A7.2 7.2 0 0 1 15.71 5.83L17.53 4.4A9.4 9.4 0 0 1 19.6 6.47L18.17 8.29A7.2 7.2 0 0 1 18.99 10.26L21.28 10.53A9.4 9.4 0 0 1 21.28 13.47L18.99 13.74A7.2 7.2 0 0 1 18.17 15.71L19.6 17.53A9.4 9.4 0 0 1 17.53 19.6L15.71 18.17A7.2 7.2 0 0 1 13.74 18.99L13.47 21.28A9.4 9.4 0 0 1 10.53 21.28L10.26 18.99A7.2 7.2 0 0 1 8.29 18.17L6.47 19.6A9.4 9.4 0 0 1 4.4 17.53L5.83 15.71A7.2 7.2 0 0 1 5.01 13.74L2.72 13.47A9.4 9.4 0 0 1 2.72 10.53L5.01 10.26A7.2 7.2 0 0 1 5.83 8.29L4.4 6.47A9.4 9.4 0 0 1 6.47 4.4L8.29 5.83A7.2 7.2 0 0 1 10.26 5.01Z" />
      <circle cx="12" cy="12" r="3" />
    </Icon>
  );
}

export function CloseIcon() {
  return (
    <Icon>
      <path d="M6 6l12 12M18 6 6 18" />
    </Icon>
  );
}

export function RetryIcon() {
  return (
    <Icon>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" />
      <path d="M4.5 4.5v3.7h3.7" />
    </Icon>
  );
}

export function LockIcon() {
  return (
    <Icon width="16" height="16">
      <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </Icon>
  );
}

/** A timegrapher's screen: a frame with a trace of dots across it. */
export function TimegrapherIcon() {
  return (
    <Icon>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path
        d="M6.5 13h.01M9 11.5h.01M11.5 12.5h.01M14 11h.01M16.5 12h.01"
        strokeWidth="2.2"
      />
    </Icon>
  );
}

/** A cup on a stand: the boards. */
export function LeaderboardIcon() {
  return (
    <Icon>
      <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
      <path d="M8 6H5.5v1.5A3 3 0 0 0 8.5 10.5M16 6h2.5v1.5a3 3 0 0 1-3 3" />
      <path d="M12 13v3.5M8.5 20h7M9.5 20l.5-3.5h4l.5 3.5" />
    </Icon>
  );
}

/** A question mark in a ring: how to play. */
export function HelpIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.6a2.5 2.5 0 1 1 3.6 2.24c-.75.37-1.2.98-1.2 1.76v.4" />
      <path d="M12 16.9h.01" strokeWidth="2.2" />
    </Icon>
  );
}

/** A caseback: the back's rim, its centre and a line engraved across it. */
export function CasebackIcon() {
  return (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="5.5" />
      <path d="M9.5 11h5M10.5 13.5h3" />
    </Icon>
  );
}
