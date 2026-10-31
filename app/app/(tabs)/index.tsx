import type { BookCounts, BookFilter, BookSort, BookSummary } from '@etagere/shared';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { useBooks } from '../../src/api/books';
import { errorMessage } from '../../src/api/errors';
import { AvailabilityBadge, useAvailabilityLabel } from '../../src/components/AvailabilityBadge';
import { initialOf } from '../../src/components/Avatar';
import { Button } from '../../src/components/Button';
import { Cover } from '../../src/components/Cover';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { type TFunction, useI18n } from '../../src/i18n/I18nProvider';
import { useApi, useSession } from '../../src/session/SessionProvider';
import { useTheme } from '../../src/theme/ThemeProvider';

/** Delay between the last keystroke and the search request. */
const SEARCH_DEBOUNCE_MS = 250;

type Key = Parameters<TFunction>[0];

const FILTERS: { filter: BookFilter; label: Key; count: keyof BookCounts }[] = [
  { filter: 'all', label: 'library.filterAll', count: 'all' },
  { filter: 'available', label: 'library.filterAvailable', count: 'available' },
  { filter: 'reading', label: 'library.filterReading', count: 'reading' },
  { filter: 'lent', label: 'library.filterLent', count: 'lent' },
  { filter: 'unread_by_me', label: 'library.filterUnreadByMe', count: 'unreadByMe' },
];

const SORTS: BookSort[] = ['added', 'title', 'author'];
const SORT_TITLES: Record<BookSort, Key> = {
  added: 'library.recentlyAdded',
  title: 'library.sortedByTitle',
  author: 'library.sortedByAuthor',
};

const GAP = 12;
const COLUMNS = 3;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function BookTile({ book, width }: { book: BookSummary; width: number }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const status = useAvailabilityLabel()(book.availability);
  const author = book.authors.join(', ');
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('library.openBook', { title: book.title, author, status })}
      onPress={() => router.push(`/book/${book.id}`)}
      style={({ pressed }) => [styles.tile, { width, opacity: pressed ? 0.8 : 1 }]}
    >
      <Cover
        title={book.title}
        authors={book.authors}
        uri={book.coverUrl ? api.url(book.coverUrl) : null}
        width={width}
        height={Math.round(width * 1.25)}
      />
      <Text
        numberOfLines={2}
        style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 13, lineHeight: 16 }}
      >
        {book.title}
      </Text>
      {author !== '' && (
        <Text
          numberOfLines={1}
          style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 12, lineHeight: 15 }}
        >
          {author}
        </Text>
      )}
      <AvailabilityBadge availability={book.availability} />
    </Pressable>
  );
}

/** Library tab (design screen 2): counts, search, filter chips with counts, cover grid. */
export default function LibraryScreen() {
  const { colors, fonts, fontSizes, radii } = useTheme();
  const { t } = useI18n();
  const { profile } = useSession();
  const { width: windowWidth } = useWindowDimensions();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<BookFilter>('all');
  const [sort, setSort] = useState<BookSort>('added');
  const query = useDebounced(search, SEARCH_DEBOUNCE_MS);

  const books = useBooks({ query, filter, sort });
  const counts = books.data?.counts;
  const tileWidth = Math.floor((Math.min(windowWidth, 600) - 40 - GAP * (COLUMNS - 1)) / COLUMNS);
  const nextSort = SORTS[(SORTS.indexOf(sort) + 1) % SORTS.length] as BookSort;

  let body;
  if (books.isPending) {
    body = <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />;
  } else if (books.isError && !books.data) {
    body = (
      <View style={styles.message}>
        <Text
          accessibilityRole="alert"
          style={{ color: colors.text, fontFamily: fonts.bodyMedium, textAlign: 'center' }}
        >
          {errorMessage(t, books.error)}
        </Text>
        <Button variant="secondary" label={t('common.retry')} onPress={() => books.refetch()} />
      </View>
    );
  } else if (books.data.books.length === 0) {
    const emptyLibrary = books.data.counts.all === 0;
    body = (
      <View style={styles.message}>
        <Text
          style={{
            color: colors.textMuted,
            fontFamily: fonts.body,
            fontSize: 15,
            textAlign: 'center',
          }}
        >
          {emptyLibrary ? t('library.empty') : t('library.noResults')}
        </Text>
        {emptyLibrary && <Button label={t('scan.title')} onPress={() => router.push('/scan')} />}
      </View>
    );
  } else {
    body = (
      <View style={styles.grid}>
        {books.data.books.map((book) => (
          <BookTile key={book.id} book={book} width={tileWidth} />
        ))}
      </View>
    );
  }

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontFamily: fonts.display,
              fontSize: fontSizes.screenTitle,
              letterSpacing: -0.5,
            }}
          >
            {t('library.title')}
          </Text>
          {counts && (
            <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 }}>
              {t('library.summary', {
                books: t('library.bookCount', { count: counts.all }),
                reading: counts.reading,
              })}
            </Text>
          )}
        </View>
        {profile && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('library.myProfile', { name: profile.name })}
            onPress={() => router.push('/profile')}
            style={[styles.profileButton, { backgroundColor: profile.color }]}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: fonts.bodySemiBold, fontSize: 16 }}>
              {initialOf(profile.name)}
            </Text>
          </Pressable>
        )}
      </View>

      <View
        style={[
          styles.search,
          { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.md },
        ]}
      >
        <Icon name="search" size={20} color={colors.textMuted} />
        <TextInput
          accessibilityLabel={t('library.searchLabel')}
          placeholder={t('library.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[styles.searchInput, { color: colors.text, fontFamily: fonts.body }]}
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        style={styles.chipsRow}
      >
        {FILTERS.map((option) => {
          const selected = option.filter === filter;
          const label = counts ? `${t(option.label)} · ${counts[option.count]}` : t(option.label);
          return (
            <Pressable
              key={option.filter}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => setFilter(option.filter)}
              hitSlop={{ top: 4, bottom: 4 }}
              style={[
                styles.chip,
                selected
                  ? { backgroundColor: colors.text, borderColor: colors.text }
                  : { backgroundColor: colors.surface, borderColor: colors.border },
              ]}
            >
              <Text
                style={{
                  color: selected ? colors.background : colors.text,
                  fontFamily: fonts.bodyMedium,
                  fontSize: 14,
                }}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <View style={styles.sectionHeader}>
        <Text
          accessibilityRole="header"
          style={{
            color: colors.text,
            fontFamily: fonts.display,
            fontSize: fontSizes.sectionTitle,
          }}
        >
          {t(SORT_TITLES[sort])}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('library.sortLabel', { sort: t(SORT_TITLES[nextSort]) })}
          onPress={() => setSort(nextSort)}
          style={styles.sortButton}
        >
          <Text style={{ color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
            {t('common.sort')}
          </Text>
        </Pressable>
      </View>

      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerText: { flex: 1, gap: 4 },
  profileButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    height: 48,
    paddingHorizontal: 14,
    borderWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 15, height: '100%' },
  chipsRow: { flexGrow: 0, marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20 },
  chip: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: 4,
  },
  sortButton: { minHeight: 44, justifyContent: 'center', paddingLeft: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: GAP, rowGap: 18, paddingBottom: 24 },
  tile: { gap: 6 },
  message: { gap: 16, paddingVertical: 32, alignItems: 'stretch' },
});
