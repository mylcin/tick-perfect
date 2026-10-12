import { ONLINE } from '../online/config';
import type { NoticeFacts } from './notice';

const REPOSITORY = 'https://github.com/mylcin/tick-perfect';

function envText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/**
 * This deployment's facts for the privacy notice, from its build settings
 * (docs/BACKEND.md). vite.config.ts refuses an online build without a
 * controller and an email.
 */
export const DEPLOYED_FACTS: NoticeFacts = {
  controller: envText(import.meta.env['VITE_PRIVACY_CONTROLLER']),
  email: envText(import.meta.env['VITE_PRIVACY_EMAIL']),
  online: ONLINE !== null,
  repository: REPOSITORY,
};
