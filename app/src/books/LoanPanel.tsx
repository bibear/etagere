import { type BookDetail, LIMITS } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { bookChanged } from '../api/books';
import { ApiError } from '../api/client';
import { errorMessage } from '../api/errors';
import { lendBook, returnBook } from '../api/loans';
import { queryKeys } from '../api/queryKeys';
import { Button } from '../components/Button';
import { useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Lend / return of a book (book detail). An available book can be lent to someone outside the
 * household (inline form asking the borrower's name); a lent book shows "It's back". The status
 * box above already tells who has it since when.
 */
export function LoanPanel({ book, disabled = false }: { book: BookDetail; disabled?: boolean }) {
  const { colors, fonts, radii } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const [borrower, setBorrower] = useState<string | null>(null);

  const onError = (error: unknown) => {
    // The book changed meanwhile (someone started it, or it was already lent): show the truth.
    if (error instanceof ApiError && error.status === 409) {
      return queryClient.invalidateQueries({ queryKey: queryKeys.book(book.id) });
    }
  };
  const lend = useMutation({
    mutationFn: (name: string) => lendBook(api, book.id, name),
    onSuccess: async (updated) => {
      setBorrower(null);
      await bookChanged(queryClient, updated);
    },
    onError,
  });
  const giveBack = useMutation({
    mutationFn: () => returnBook(api, book.id),
    onSuccess: (updated) => bookChanged(queryClient, updated),
    onError,
  });
  const failure = lend.error ?? giveBack.error;
  const state = book.availability.state;

  if (state === 'reading') return null;

  if (state === 'lent') {
    return (
      <View style={styles.panel}>
        <Button
          label={t('loan.returned')}
          onPress={() => giveBack.mutate()}
          busy={giveBack.isPending}
          disabled={disabled}
        />
        {failure != null && <ErrorLine message={errorMessage(t, failure)} />}
      </View>
    );
  }

  if (borrower === null) {
    return (
      <View style={styles.panel}>
        <Button
          variant="secondary"
          label={t('loan.lend')}
          onPress={() => setBorrower('')}
          disabled={disabled}
        />
      </View>
    );
  }

  const name = borrower.trim();
  return (
    <View
      testID="lend-form"
      style={[
        styles.form,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
      ]}
    >
      <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 15 }}>
        {t('loan.borrowerLabel')}
      </Text>
      <TextInput
        accessibilityLabel={t('loan.borrowerLabel')}
        placeholder={t('loan.borrowerPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={borrower}
        onChangeText={setBorrower}
        maxLength={LIMITS.borrower}
        autoFocus
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={() => name !== '' && lend.mutate(name)}
        style={[
          styles.input,
          {
            color: colors.text,
            borderColor: colors.border,
            borderRadius: radii.md,
            fontFamily: fonts.body,
          },
        ]}
      />
      <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
        {t('loan.hint')}
      </Text>
      <View style={styles.formActions}>
        <View style={styles.flex}>
          <Button
            variant="secondary"
            label={t('common.cancel')}
            onPress={() => {
              lend.reset();
              setBorrower(null);
            }}
          />
        </View>
        <View style={styles.flex}>
          <Button
            label={t('loan.confirm')}
            onPress={() => lend.mutate(name)}
            busy={lend.isPending}
            disabled={name === '' || disabled}
          />
        </View>
      </View>
      {failure != null && <ErrorLine message={errorMessage(t, failure)} />}
    </View>
  );
}

function ErrorLine({ message }: { message: string }) {
  const { colors, fonts } = useTheme();
  return (
    <Text
      accessibilityRole="alert"
      style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
    >
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: { gap: 10 },
  form: { gap: 10, padding: 14, borderWidth: 1 },
  input: { borderWidth: 1, minHeight: 48, paddingHorizontal: 12, fontSize: 15 },
  formActions: { flexDirection: 'row', gap: 10 },
});
