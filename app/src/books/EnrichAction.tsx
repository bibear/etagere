import type { BookDetail } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { bookChanged, enrichBook } from '../api/books';
import { errorMessage } from '../api/errors';
import { Button } from '../components/Button';
import { useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';

/** The book has an ISBN to look up and lacks a cover or a back-cover text. */
export const canEnrich = (book: BookDetail): boolean =>
  book.isbn13 !== null && (book.coverUrl === null || !book.description);

const filledSomething = (before: BookDetail, after: BookDetail): boolean =>
  (['coverUrl', 'description', 'publisher', 'year', 'pages'] as const).some(
    (field) => before[field] !== after[field],
  ) || before.genres.length !== after.genres.length;

/**
 * Discreet "Fill in missing details" link of the book detail: looks the ISBN up again and
 * fills only what the book lacks (the server never overwrites what the household typed).
 */
export function EnrichAction({ book }: { book: BookDetail }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();

  // The variables keep the book as it was before, to tell whether anything was found.
  const enrich = useMutation({
    mutationFn: (before: BookDetail) => enrichBook(api, before.id),
    onSuccess: (updated) => bookChanged(queryClient, updated),
  });

  const outcome = enrich.isSuccess
    ? filledSomething(enrich.variables, enrich.data)
      ? t('book.enrichDone')
      : t('book.enrichNothing')
    : null;
  if (!canEnrich(book) && outcome === null) return null;

  const muted = { color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 };
  return (
    <View style={styles.row}>
      {enrich.isPending ? (
        <View style={styles.pending} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.textMuted} />
          <Text style={muted}>{t('book.enriching')}</Text>
        </View>
      ) : (
        canEnrich(book) &&
        !enrich.isSuccess && (
          <Button
            variant="link"
            label={t('book.enrich')}
            needsServer
            onPress={() => enrich.mutate(book)}
          />
        )
      )}
      {outcome !== null && (
        <Text accessibilityLiveRegion="polite" style={muted}>
          {outcome}
        </Text>
      )}
      {enrich.isError && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
        >
          {errorMessage(t, enrich.error)}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', gap: 4 },
  pending: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
});
