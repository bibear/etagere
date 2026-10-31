import { ERROR_CODES, type ErrorCode } from '@etagere/shared';

import type { TFunction } from '../i18n/I18nProvider';
import { ApiError } from './client';

/** A user-facing sentence for any failure: the translated server code, else a generic one. */
export function errorMessage(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'network') return t('errors.network');
    if ((ERROR_CODES as readonly string[]).includes(error.code)) {
      return t(`errors.${error.code as ErrorCode}`);
    }
  }
  return t('common.error');
}
