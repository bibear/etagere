import type { BookDetail, BookSummary, BuyIdea, Reason, Reco } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Fragment, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { bookChanged, readingAction } from '../api/books';
import { errorMessage } from '../api/errors';
import { useMyReadings, useRecommendations } from '../api/me';
import { useAvailabilityLabel } from '../components/AvailabilityBadge';
import { BookRow } from '../components/BookRow';
import { Button } from '../components/Button';
import { Cover } from '../components/Cover';
import { Screen, ScreenTitle } from '../components/Screen';
import { SectionLabel } from '../components/SectionLabel';
import { type TFunction, useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';

const MAX_BECAUSE = 2;

/** Titles of my books behind the author / genre reasons, without duplicates (2 at most). */
export function becauseTitles(reasons: Reason[]): string[] {
  const titles: string[] = [];
  for (const reason of reasons) {
    if (reason.kind === 'household') continue;
    for (const title of reason.because ?? []) {
      if (!titles.includes(title)) titles.push(title);
    }
  }
  return titles.slice(0, MAX_BECAUSE);
}

/** "Dune et Fondation" / "Dune, Fondation and Hyperion". */
export function joinTitles(titles: string[], t: TFunction): string {
  if (titles.length <= 1) return titles.join('');
  return `${titles.slice(0, -1).join(', ')} ${t('recos.and')} ${titles[titles.length - 1]}`;
}

/** The sentence of one reason without book titles. */
export function reasonSentence(reason: Reason, t: TFunction): string {
  switch (reason.kind) {
    case 'author':
      return t('recos.reasonAuthor', { name: reason.ref });
    case 'genre':
      return t('recos.reasonGenre', { genre: reason.ref });
    case 'household':
      return t('recos.reasonHousehold', { name: reason.ref });
  }
}

const quoteText = (quote: NonNullable<Reco['quote']>, t: TFunction) =>
  t('recos.quote', { name: quote.author.name, text: quote.text });

/** Second line of an "also on the shelf" row, as in the design. */
export function shelfLine(reco: Reco, t: TFunction): string {
  const titles = becauseTitles(reco.reasons);
  if (titles.length > 0) return t('recos.becauseYouRead', { books: joinTitles(titles, t) });
  if (reco.quote) return quoteText(reco.quote, t);
  const first = reco.reasons[0];
  return first ? reasonSentence(first, t) : t('recos.notReadYet');
}

function useStartReading() {
  const api = useApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (book: BookSummary) => readingAction(api, book.id, 'start'),
    onSuccess: async (updated: BookDetail) => {
      await bookChanged(queryClient, updated);
      router.push(`/book/${updated.id}`);
    },
  });
}

/** "Parce que tu as aimé **Dune** et **Fondation**" with the titles emphasised. */
function BecauseYouLiked({
  titles,
  color,
  strong,
}: {
  titles: string[];
  color: string;
  strong: string;
}) {
  const { fonts } = useTheme();
  const { t } = useI18n();
  // Build the sentence from the translation so the word order stays the language's.
  const marker = '\u0000';
  const template = t('recos.becauseYouLiked', { books: marker });
  const [before = '', after = ''] = template.split(marker);
  const parts: ReactNode[] = [];
  titles.forEach((title, index) => {
    if (index > 0) {
      parts.push(index === titles.length - 1 ? ` ${t('recos.and')} ` : ', ');
    }
    parts.push(
      <Text key={title} style={{ color: strong, fontFamily: fonts.bodySemiBold }}>
        {title}
      </Text>,
    );
  });
  return (
    <Text style={{ color, fontFamily: fonts.body, fontSize: 13, lineHeight: 19 }}>
      {before}
      {parts.map((part, index) => (
        <Fragment key={index}>{part}</Fragment>
      ))}
      {after}
    </Text>
  );
}

function FeaturedCard({ reco }: { reco: Reco }) {
  const { colors, fonts, radii, scheme } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const availabilityLabel = useAvailabilityLabel();
  const start = useStartReading();
  const { book } = reco;
  const dark = scheme === 'dark';
  // The design's dark card; in dark mode a raised surface keeps it distinct from the background.
  const card = {
    background: dark ? colors.surface : colors.inverse,
    text: dark ? colors.text : colors.onInverse,
    muted: dark ? colors.textMuted : '#D3DAD6',
    quote: dark ? colors.background : '#26302C',
  };
  const available = book.availability.state === 'available';
  const titles = becauseTitles(reco.reasons);
  const fallbackReason = reco.reasons.find((reason) => reason.kind !== 'household');

  return (
    <View
      testID="featured-reco"
      style={[
        styles.featured,
        {
          backgroundColor: card.background,
          borderRadius: radii.xl,
          borderWidth: dark ? 1 : 0,
          borderColor: colors.border,
        },
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={[book.title, book.authors[0]].filter(Boolean).join(', ')}
        onPress={() => router.push(`/book/${book.id}`)}
        style={styles.featuredTop}
      >
        <Cover
          title={book.title}
          authors={book.authors}
          uri={book.coverUrl ? api.url(book.coverUrl) : null}
          width={84}
          height={126}
          compact
        />
        <View style={styles.featuredText}>
          <Text
            style={[
              styles.pill,
              {
                backgroundColor: available ? colors.availableBg : colors.busyBg,
                color: available ? colors.availableFg : colors.busyFg,
                fontFamily: fonts.bodySemiBold,
              },
            ]}
          >
            {available ? t('availability.availableAtHome') : availabilityLabel(book.availability)}
          </Text>
          <Text style={{ color: card.text, fontFamily: fonts.display, fontSize: 24 }}>
            {book.title}
          </Text>
          {book.authors.length > 0 && (
            <Text style={{ color: card.muted, fontFamily: fonts.body, fontSize: 14 }}>
              {book.authors.join(', ')}
            </Text>
          )}
          {titles.length > 0 ? (
            <BecauseYouLiked titles={titles} color={card.muted} strong={card.text} />
          ) : fallbackReason ? (
            <Text style={{ color: card.muted, fontFamily: fonts.body, fontSize: 13 }}>
              {reasonSentence(fallbackReason, t)}
            </Text>
          ) : null}
        </View>
      </Pressable>
      {reco.quote && (
        <Text
          style={[
            styles.quote,
            {
              backgroundColor: card.quote,
              color: card.muted,
              borderRadius: radii.md,
              fontFamily: fonts.body,
            },
          ]}
        >
          {quoteText(reco.quote, t)}
        </Text>
      )}
      {available && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('book.startReading')}
          accessibilityState={{ busy: start.isPending, disabled: start.isPending }}
          disabled={start.isPending}
          onPress={() => start.mutate(book)}
          style={({ pressed }) => [
            styles.cta,
            {
              backgroundColor: colors.scannerAccent,
              borderRadius: radii.md,
              opacity: pressed || start.isPending ? 0.8 : 1,
            },
          ]}
        >
          {start.isPending ? (
            <ActivityIndicator color={colors.scannerBackground} />
          ) : (
            <Text
              style={{
                color: colors.scannerBackground,
                fontFamily: fonts.bodySemiBold,
                fontSize: 15,
              }}
            >
              {t('book.startReading')}
            </Text>
          )}
        </Pressable>
      )}
      {start.isError && (
        <Text accessibilityRole="alert" style={{ color: card.text, fontFamily: fonts.bodyMedium }}>
          {errorMessage(t, start.error)}
        </Text>
      )}
    </View>
  );
}

function StatusPill({ reco }: { reco: Reco }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const label = useAvailabilityLabel();
  const available = reco.book.availability.state === 'available';
  return (
    <Text
      numberOfLines={1}
      style={[
        styles.pill,
        styles.rowPill,
        {
          backgroundColor: available ? colors.availableBg : colors.busyBg,
          color: available ? colors.availableFg : colors.busyFg,
          fontFamily: fonts.bodySemiBold,
        },
      ]}
    >
      {available ? t('recos.available') : label(reco.book.availability)}
    </Text>
  );
}

function BuyIdeaRow({ idea }: { idea: BuyIdea }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const add = idea.isbn13
    ? () => router.push(`/book/new?isbn=${encodeURIComponent(idea.isbn13 ?? '')}`)
    : undefined;
  return (
    <BookRow
      testID="buy-idea"
      title={idea.title}
      authors={idea.authors}
      // Generated cover: the phone never calls Open Library itself (everything stays at home).
      coverUri={null}
      inlineAuthor={idea.authors[0]}
      subtitle={reasonSentence(idea.reason, t)}
      onPress={add}
      accessibilityLabel={add ? t('recos.addBoughtLabel', { title: idea.title }) : undefined}
      trailing={
        add ? (
          <Text style={{ color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: 14 }}>
            {t('recos.addBought')}
          </Text>
        ) : undefined
      }
    />
  );
}

/** Recommendations (design screen 6): featured book, also on the shelf, ideas to buy. */
export function RecosScreen() {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const recos = useRecommendations();
  const readings = useMyReadings();
  const finishedCount = readings.data?.stats.finishedCount ?? 0;
  const data = recos.data;
  const muted = { color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 };

  return (
    <Screen>
      <ScreenTitle
        title={t('recos.title')}
        subtitle={
          finishedCount > 0
            ? t('recos.subtitle', { count: finishedCount })
            : t('recos.subtitleNoReadings')
        }
      />
      {recos.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />
      ) : recos.isError && !data ? (
        <View style={styles.section}>
          <Text accessibilityRole="alert" style={{ color: colors.text, fontFamily: fonts.body }}>
            {errorMessage(t, recos.error)}
          </Text>
          <Button variant="secondary" label={t('common.retry')} onPress={() => recos.refetch()} />
        </View>
      ) : data ? (
        <>
          {data.featured && <FeaturedCard reco={data.featured} />}
          {!data.featured && data.onShelf.length === 0 && (
            <Text style={muted}>{t('recos.empty')}</Text>
          )}
          {data.onShelf.length > 0 && (
            <View style={styles.list}>
              <SectionLabel label={t('recos.alsoOnShelf')} />
              {data.onShelf.map((reco) => (
                <BookRow
                  key={reco.book.id}
                  testID={`reco-${reco.book.id}`}
                  title={reco.book.title}
                  authors={reco.book.authors}
                  coverUri={reco.book.coverUrl ? api.url(reco.book.coverUrl) : null}
                  inlineAuthor={reco.book.authors[0]}
                  subtitle={shelfLine(reco, t)}
                  onPress={() => router.push(`/book/${reco.book.id}`)}
                  accessibilityLabel={[reco.book.title, reco.book.authors[0], shelfLine(reco, t)]
                    .filter(Boolean)
                    .join(', ')}
                  trailing={<StatusPill reco={reco} />}
                />
              ))}
            </View>
          )}
          <View style={styles.list}>
            <SectionLabel label={t('recos.toBuy')} />
            {data.toBuyError ? (
              <Text style={muted}>{t('recos.toBuyUnavailable')}</Text>
            ) : data.toBuy.length === 0 ? (
              <Text style={muted}>{t('recos.toBuyEmpty')}</Text>
            ) : (
              <>
                <Text style={[muted, { fontSize: 13 }]}>{t('recos.toBuyHint')}</Text>
                {data.toBuy.map((idea, index) => (
                  <BuyIdeaRow key={`${idea.isbn13 ?? idea.title}-${index}`} idea={idea} />
                ))}
              </>
            )}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { gap: 12 },
  list: { gap: 4, paddingBottom: 8 },
  featured: { gap: 14, padding: 18 },
  featuredTop: { flexDirection: 'row', gap: 16 },
  featuredText: { flex: 1, gap: 6 },
  pill: {
    alignSelf: 'flex-start',
    overflow: 'hidden',
    fontSize: 11,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  rowPill: { alignSelf: 'center', maxWidth: 110 },
  quote: { fontSize: 13, lineHeight: 19, padding: 12, overflow: 'hidden' },
  cta: { height: 48, alignItems: 'center', justifyContent: 'center' },
});
