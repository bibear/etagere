import type { BookDetail, Locale, ReadingItem } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { bookChanged, readingAction } from '../api/books';
import { errorMessage } from '../api/errors';
import { useMyReadings } from '../api/me';
import { BookRow } from '../components/BookRow';
import { Button } from '../components/Button';
import { Cover } from '../components/Cover';
import { Screen, ScreenTitle } from '../components/Screen';
import { SectionLabel } from '../components/SectionLabel';
import { type TFunction, useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';

export type FinishedSort = 'recent' | 'title' | 'author';
const NEXT_SORT: Record<FinishedSort, FinishedSort> = {
  recent: 'title',
  title: 'author',
  author: 'recent',
};

const tag = (locale: Locale) => (locale === 'fr' ? 'fr-FR' : 'en-GB');

/** "12 octobre" (with the year when it is not the current one). */
export function formatDayMonth(iso: string, locale: Locale, now = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(tag(locale), {
    day: 'numeric',
    month: 'long',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** "sept." (with the year when it is not the current one), as in "fini en sept.". */
export function formatMonth(iso: string, locale: Locale, now = new Date()): string {
  const date = new Date(iso);
  const sameYear = date.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(tag(locale), {
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(date);
}

/** Finished books in the chosen order; `recent` keeps the server order (latest finish first). */
export function sortFinished(items: ReadingItem[], sort: FinishedSort, locale: Locale) {
  if (sort === 'recent') return items;
  const collator = new Intl.Collator(tag(locale), { sensitivity: 'base' });
  const key = (item: ReadingItem) =>
    sort === 'title' ? item.book.title : (item.book.authors[0] ?? '');
  return [...items].sort((a, b) => collator.compare(key(a), key(b)));
}

const sortLabel = (t: TFunction, sort: FinishedSort) =>
  sort === 'recent'
    ? t('readings.sortedByRecent')
    : sort === 'title'
      ? t('library.sortedByTitle')
      : t('library.sortedByAuthor');

function CurrentReading({ item }: { item: ReadingItem }) {
  const { colors, fonts, radii } = useTheme();
  const { t, locale } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const { book } = item;

  const action = useMutation({
    mutationFn: (kind: 'finish' | 'putdown') => readingAction(api, book.id, kind),
    onSuccess: (updated: BookDetail) => bookChanged(queryClient, updated),
    // A conflict means the readings changed elsewhere: show the real state.
    onError: () => queryClient.invalidateQueries({ queryKey: ['me'] }),
  });
  const pending = action.isPending ? action.variables : null;

  return (
    <View
      testID="current-reading"
      style={[
        styles.card,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.xl },
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={book.title}
        onPress={() => router.push(`/book/${book.id}`)}
        style={styles.cardTop}
      >
        <Cover
          title={book.title}
          authors={book.authors}
          uri={book.coverUrl ? api.url(book.coverUrl) : null}
          width={72}
          height={108}
          compact
        />
        <View style={styles.cardText}>
          <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 19 }}>
            {book.title}
          </Text>
          {book.authors.length > 0 && (
            <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 14 }}>
              {book.authors.join(', ')}
            </Text>
          )}
          {item.startedAt && (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
              {t('readings.startedOn', { date: formatDayMonth(item.startedAt, locale) })}
            </Text>
          )}
          <Text
            style={[
              styles.badge,
              {
                backgroundColor: colors.busyBg,
                color: colors.busyFg,
                fontFamily: fonts.bodySemiBold,
              },
            ]}
          >
            {t('availability.unavailableForHousehold')}
          </Text>
        </View>
      </Pressable>
      <View style={styles.cardActions}>
        <View style={styles.flex}>
          <Button
            label={t('readings.finished')}
            needsServer
            onPress={() => action.mutate('finish')}
            busy={pending === 'finish'}
            disabled={action.isPending}
          />
        </View>
        <View style={styles.flex}>
          <Button
            variant="secondary"
            label={t('readings.putDown')}
            needsServer
            onPress={() => action.mutate('putdown')}
            busy={pending === 'putdown'}
            disabled={action.isPending}
          />
        </View>
      </View>
      {action.isError && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
        >
          {errorMessage(t, action.error)}
        </Text>
      )}
    </View>
  );
}

function FinishedRow({ item }: { item: ReadingItem }) {
  const { colors, fonts } = useTheme();
  const { t, locale } = useI18n();
  const api = useApi();
  const { book } = item;
  const author = book.authors[0] ?? '';
  const when = item.finishedAt
    ? t('readings.finishedIn', { date: formatMonth(item.finishedAt, locale) })
    : '';
  const reviews =
    item.commentCount > 0
      ? t('readings.reviews', { count: item.commentCount })
      : t('readings.noReviews');
  return (
    <BookRow
      testID={`finished-${book.id}`}
      title={book.title}
      authors={book.authors}
      coverUri={book.coverUrl ? api.url(book.coverUrl) : null}
      subtitle={[author, when].filter(Boolean).join(' · ')}
      accessibilityLabel={t('readings.openBook', { title: book.title, author, when, reviews })}
      onPress={() => router.push(`/book/${book.id}`)}
      trailing={
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 }}>
          {item.commentCount > 0 ? t('readings.reviews', { count: item.commentCount }) : '—'}
        </Text>
      }
    />
  );
}

/** My readings (design screen 5): current reading with its actions, then finished books. */
export function ReadingsScreen() {
  const { colors, fonts } = useTheme();
  const { t, locale } = useI18n();
  const readings = useMyReadings();
  const [sort, setSort] = useState<FinishedSort>('recent');

  const finished = useMemo(
    () => sortFinished(readings.data?.finished ?? [], sort, locale),
    [readings.data, sort, locale],
  );

  const muted = { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 };
  const data = readings.data;

  return (
    <Screen>
      <ScreenTitle
        title={t('readings.title')}
        subtitle={
          data
            ? t('readings.summary', {
                read: t('readings.readCount', { count: data.stats.finishedCount }),
                current: data.current ? 1 : 0,
              })
            : undefined
        }
      />
      {readings.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />
      ) : readings.isError && !data ? (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={{ color: colors.text, fontFamily: fonts.body }}>
            {errorMessage(t, readings.error)}
          </Text>
          <Button
            variant="secondary"
            label={t('common.retry')}
            onPress={() => readings.refetch()}
          />
        </View>
      ) : data ? (
        <>
          <View style={styles.section}>
            <SectionLabel label={t('readings.current')} />
            {data.current ? (
              <CurrentReading item={data.current} />
            ) : (
              <Text style={muted}>{t('readings.noCurrent')}</Text>
            )}
          </View>
          <View style={styles.list}>
            <SectionLabel
              label={t('readings.alreadyRead')}
              action={
                data.finished.length > 1 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('library.sortLabel', { sort: sortLabel(t, sort) })}
                    onPress={() => setSort(NEXT_SORT[sort])}
                    style={styles.sortButton}
                  >
                    <Text
                      style={{ color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: 14 }}
                    >
                      {sort === 'recent' ? t('common.sort') : sortLabel(t, sort)}
                    </Text>
                  </Pressable>
                ) : undefined
              }
            />
            {finished.length === 0 ? (
              <Text style={muted}>{t('readings.noneFinished')}</Text>
            ) : (
              finished.map((item) => <FinishedRow key={item.book.id} item={item} />)
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  section: { gap: 12 },
  list: { gap: 4, paddingBottom: 24 },
  card: { gap: 14, padding: 16, borderWidth: 1 },
  cardTop: { flexDirection: 'row', gap: 14 },
  cardText: { flex: 1, gap: 4 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 4,
    overflow: 'hidden',
    fontSize: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  cardActions: { flexDirection: 'row', gap: 10 },
  sortButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
});
