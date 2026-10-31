import type { BookDetail, BookSummary } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { useBook } from '../api/books';
import { createBook, deleteBook, lookupIsbn, updateBook } from '../api/catalog';
import { errorMessage } from '../api/errors';
import { queryKeys } from '../api/queryKeys';
import { BackLink } from '../components/BackLink';
import { Button } from '../components/Button';
import { useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import {
  type BookFormField,
  type BookFormValues,
  type FieldErrors,
  bookInputFromForm,
  bookPatchFromInput,
  emptyBookForm,
  fieldsFromPaths,
  formFromBook,
  mergeCandidate,
} from './bookForm';
import { FormField } from './ui';

const errorCode = (error: unknown) => (error instanceof ApiError ? error.code : 'internal_error');

export interface BookFormScreenProps {
  /** Edit this book; absent → add a new one. */
  bookId?: string;
  /** Prefills the ISBN of a new book (e.g. a scanned code Open Library did not know). */
  initialIsbn?: string;
}

/** Add a book by hand (optionally completed from an ISBN lookup), or edit / delete one. */
export function BookFormScreen({ bookId, initialIsbn }: BookFormScreenProps) {
  const { t } = useI18n();
  return (
    <Frame title={t(bookId ? 'bookForm.editTitle' : 'bookForm.addTitle')}>
      {bookId ? <EditLoader bookId={bookId} /> : <BookForm initialIsbn={initialIsbn} />}
    </Frame>
  );
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: colors.background }]}>
      <View style={styles.header}>
        <BackLink label={t('bookForm.back')} />
        <Text
          accessibilityRole="header"
          style={{ color: colors.text, fontFamily: fonts.display, fontSize: 26 }}
        >
          {title}
        </Text>
      </View>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {children}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EditLoader({ bookId }: { bookId: string }) {
  const { t } = useI18n();
  const { colors, fonts } = useTheme();
  const query = useBook(bookId);
  if (query.data) return <BookForm book={query.data} />;
  if (query.isError) {
    return (
      <View style={styles.centered}>
        <Text style={{ color: colors.text, fontFamily: fonts.body }}>
          {errorMessage(t, query.error)}
        </Text>
        <Button label={t('common.retry')} variant="secondary" onPress={() => query.refetch()} />
      </View>
    );
  }
  return (
    <View style={styles.centered}>
      <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.primary} />
    </View>
  );
}

type Notice = { tone: 'info' | 'error'; text: string; existing?: BookSummary };

function BookForm({ book, initialIsbn }: { book?: BookDetail; initialIsbn?: string }) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const { colors, fonts, fontSizes, radii } = useTheme();

  const [values, setValues] = useState<BookFormValues>(() =>
    book ? formFromBook(book) : emptyBookForm(initialIsbn ?? ''),
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [notice, setNotice] = useState<Notice | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const set = (field: BookFormField) => (text: string) => {
    setValues((current) => ({ ...current, [field]: text }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fail = (error: unknown) => {
    if (error instanceof ApiError && error.code === 'invalid_input') {
      const fields = Array.isArray(error.body.fields) ? error.body.fields.map(String) : [];
      setErrors(fieldsFromPaths(fields));
    }
    if (error instanceof ApiError && error.code === 'invalid_isbn') setErrors({ isbn: 'invalid' });
    const existing =
      error instanceof ApiError && error.code === 'already_in_library'
        ? (error.body.book as BookSummary | undefined)
        : undefined;
    setNotice({ tone: 'error', text: errorMessage(t, error), existing });
  };

  const lookup = useMutation({
    mutationFn: (isbn: string) => lookupIsbn(api, isbn),
    onMutate: () => setNotice(null),
    onSuccess: (candidate) => {
      setValues((current) => mergeCandidate(current, candidate));
      setErrors({});
      setNotice({ tone: 'info', text: t('bookForm.lookupDone') });
    },
    onError: (error) =>
      errorCode(error) === 'not_found'
        ? setNotice({ tone: 'info', text: t('bookForm.lookupNotFound') })
        : fail(error),
  });

  const save = useMutation({
    mutationFn: async () => {
      const result = bookInputFromForm(values);
      if (!result.ok) {
        setErrors(result.errors);
        return null;
      }
      setErrors({});
      return book
        ? updateBook(api, book.id, bookPatchFromInput(result.input))
        : createBook(api, result.input);
    },
    onMutate: () => setNotice(null),
    onSuccess: async (saved) => {
      if (!saved) return;
      queryClient.setQueryData(queryKeys.book(saved.id), saved);
      await queryClient.invalidateQueries();
      if (book && router.canGoBack()) router.back();
      else router.replace(`/book/${saved.id}`);
    },
    onError: fail,
  });

  const remove = useMutation({
    mutationFn: () => deleteBook(api, book!.id),
    onSuccess: async () => {
      queryClient.removeQueries({ queryKey: queryKeys.book(book!.id) });
      await queryClient.invalidateQueries();
      router.dismissTo('/');
    },
    onError: (error) => {
      setConfirmingDelete(false);
      fail(error);
    },
  });

  const fieldError = (field: BookFormField) => {
    const error = errors[field];
    if (!error) return undefined;
    return t(error === 'required' ? 'bookForm.required' : 'bookForm.invalid');
  };

  const field = (name: BookFormField, label: string, extra: object = {}) => (
    <FormField
      label={label}
      value={values[name]}
      onChangeText={set(name)}
      error={fieldError(name)}
      {...extra}
    />
  );

  return (
    <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
      <View style={styles.isbnRow}>
        <View style={styles.flex}>
          {field('isbn', t('bookForm.isbnLabel'), {
            hint: t('bookForm.isbnHint'),
            keyboardType: 'numbers-and-punctuation',
            autoCapitalize: 'characters',
            autoCorrect: false,
          })}
        </View>
      </View>
      <Button
        label={lookup.isPending ? t('bookForm.lookingUp') : t('bookForm.lookup')}
        variant="secondary"
        busy={lookup.isPending}
        disabled={values.isbn.trim() === ''}
        onPress={() => lookup.mutate(values.isbn)}
      />

      {notice && (
        <View
          accessibilityLiveRegion="polite"
          style={[
            styles.notice,
            {
              borderRadius: radii.md,
              backgroundColor: notice.tone === 'error' ? colors.busyBg : colors.availableBg,
            },
          ]}
        >
          <Text
            style={{
              color: notice.tone === 'error' ? colors.busyFg : colors.availableFg,
              fontFamily: fonts.bodyMedium,
              fontSize: fontSizes.small,
            }}
          >
            {notice.text}
          </Text>
          {notice.existing && (
            <Button
              label={t('bookForm.openExisting')}
              variant="link"
              onPress={() => router.replace(`/book/${notice.existing!.id}`)}
            />
          )}
        </View>
      )}

      {field('title', t('bookForm.titleLabel'))}
      {field('authors', t('bookForm.authorsLabel'), { hint: t('bookForm.listHint') })}
      {field('genres', t('bookForm.genresLabel'), { hint: t('bookForm.listHint') })}
      {field('publisher', t('bookForm.publisherLabel'))}
      <View style={styles.row}>
        <View style={styles.flex}>
          {field('year', t('bookForm.yearLabel'), { keyboardType: 'number-pad' })}
        </View>
        <View style={styles.flex}>
          {field('pages', t('bookForm.pagesLabel'), { keyboardType: 'number-pad' })}
        </View>
      </View>
      {field('description', t('bookForm.descriptionLabel'), { multiline: true })}

      <Button
        label={
          save.isPending
            ? t('bookForm.saving')
            : t(book ? 'bookForm.submitSave' : 'bookForm.submitAdd')
        }
        busy={save.isPending}
        onPress={() => save.mutate()}
      />

      {book &&
        (confirmingDelete ? (
          <View
            style={[
              styles.confirm,
              {
                borderRadius: radii.lg,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              },
            ]}
          >
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 16 }}
            >
              {t('bookForm.deleteConfirmTitle', { title: book.title })}
            </Text>
            <Text
              style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.small }}
            >
              {t('bookForm.deleteConfirmBody')}
            </Text>
            <Button
              label={remove.isPending ? t('bookForm.deleting') : t('bookForm.deleteConfirm')}
              variant="dark"
              busy={remove.isPending}
              onPress={() => remove.mutate()}
            />
            <Button
              label={t('common.cancel')}
              variant="secondary"
              disabled={remove.isPending}
              onPress={() => setConfirmingDelete(false)}
            />
          </View>
        ) : (
          <Button
            label={t('bookForm.deleteBook')}
            variant="link"
            onPress={() => setConfirmingDelete(true)}
          />
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: 20, paddingTop: 8, gap: 4 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 20 },
  form: { padding: 20, paddingBottom: 40, gap: 16 },
  isbnRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  row: { flexDirection: 'row', gap: 12 },
  notice: { padding: 12, gap: 4 },
  confirm: { borderWidth: 1, padding: 16, gap: 12 },
});
