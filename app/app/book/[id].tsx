import { type BookDetail, type Comment, LIMITS } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { bookChanged, type ReadingAction, readingAction, useBook } from '../../src/api/books';
import { ApiError } from '../../src/api/client';
import { deleteComment, editComment, postComment, useComments } from '../../src/api/comments';
import { errorMessage } from '../../src/api/errors';
import { queryKeys } from '../../src/api/queryKeys';
import { BackCover } from '../../src/books/BackCover';
import { EnrichAction } from '../../src/books/EnrichAction';
import { LoanPanel } from '../../src/books/LoanPanel';
import { Avatar } from '../../src/components/Avatar';
import { BackLink } from '../../src/components/BackLink';
import { Button } from '../../src/components/Button';
import { Cover } from '../../src/components/Cover';
import { Icon } from '../../src/components/Icon';
import { Screen } from '../../src/components/Screen';
import { formatRelativeDate } from '../../src/i18n/dates';
import { useOffline } from '../../src/offline/ServerStatus';
import { useI18n } from '../../src/i18n/I18nProvider';
import { useApi, useSession } from '../../src/session/SessionProvider';
import { useTheme } from '../../src/theme/ThemeProvider';

const shortDate = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(iso));

/** Status box, primary actions and "already read by" of a book. */
function ReadingPanel({ book }: { book: BookDetail }) {
  const { colors, fonts, radii } = useTheme();
  const { t, locale } = useI18n();
  const api = useApi();
  const { profile } = useSession();
  const queryClient = useQueryClient();

  const action = useMutation({
    mutationFn: (kind: ReadingAction) => readingAction(api, book.id, kind),
    onSuccess: (updated) => bookChanged(queryClient, updated),
    onError: (error) => {
      // Someone else took it meanwhile: show the real state.
      if (error instanceof ApiError && error.status === 409) {
        return queryClient.invalidateQueries({ queryKey: queryKeys.book(book.id) });
      }
    },
  });

  const availability = book.availability;
  const mine = availability.state === 'reading' && availability.by.id === profile?.id;
  const available = availability.state === 'available';

  let title: string;
  let subtitle: string;
  if (availability.state === 'reading') {
    title = mine ? t('book.youReadIt') : t('book.someoneReading', { name: availability.by.name });
    subtitle = mine ? t('book.othersSeeUnavailable') : t('availability.unavailableForHousehold');
  } else if (availability.state === 'lent') {
    title = t('book.lentSince', {
      name: availability.borrower,
      date: shortDate(availability.since, locale),
    });
    subtitle = t('availability.unavailableForHousehold');
  } else {
    title = t('availability.availableAtHome');
    subtitle = book.readByMe ? t('book.youAlreadyReadIt') : t('book.nobodyReading');
  }

  const pending = action.isPending ? action.variables : null;

  return (
    <>
      <View
        testID="status-box"
        accessible
        accessibilityLabel={`${title}${title.endsWith('.') ? '' : '.'} ${subtitle}`}
        style={[
          styles.statusBox,
          {
            borderRadius: radii.lg,
            backgroundColor: available ? colors.availableBg : colors.busyBg,
          },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            { backgroundColor: available ? colors.availableDot : colors.busyDot },
          ]}
        />
        <View style={styles.statusText}>
          <Text
            style={{
              color: available ? colors.availableFg : colors.busyFg,
              fontFamily: fonts.bodySemiBold,
              fontSize: 15,
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              color: available ? colors.availableFg : colors.busyFg,
              fontFamily: fonts.body,
              fontSize: 13,
              opacity: 0.85,
            }}
          >
            {subtitle}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        {available && (
          <Button
            label={t('book.startReading')}
            needsServer
            onPress={() => action.mutate('start')}
            busy={pending === 'start'}
            disabled={action.isPending}
          />
        )}
        {mine && (
          <>
            <Button
              variant="dark"
              label={t('book.finishReading')}
              needsServer
              onPress={() => action.mutate('finish')}
              busy={pending === 'finish'}
              disabled={action.isPending}
            />
            <Button
              variant="secondary"
              label={t('book.putDown')}
              needsServer
              onPress={() => action.mutate('putdown')}
              busy={pending === 'putdown'}
              disabled={action.isPending}
            />
          </>
        )}
        {!book.readByMe && !mine && (
          <Button
            variant="secondary"
            label={t('book.alreadyRead')}
            needsServer
            onPress={() => action.mutate('already-read')}
            busy={pending === 'already-read'}
            disabled={action.isPending}
          />
        )}
        <LoanPanel book={book} />
        {action.isError && (
          <Text
            accessibilityRole="alert"
            style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium, fontSize: 14 }}
          >
            {errorMessage(t, action.error)}
          </Text>
        )}
      </View>

      {book.readBy.length > 0 && (
        <View style={styles.readBy}>
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 }}>
            {t('book.readBy')}
          </Text>
          <View style={styles.avatars}>
            {book.readBy.map((reader, index) => (
              <View key={reader.id} style={{ marginLeft: index === 0 ? 0 : -8 }}>
                <Avatar
                  name={reader.name}
                  color={reader.color}
                  size={32}
                  ringColor={colors.background}
                />
              </View>
            ))}
          </View>
          <Text style={[styles.flex, { color: colors.text, fontFamily: fonts.body, fontSize: 14 }]}>
            {book.readBy.map((reader) => reader.name).join(', ')}
          </Text>
        </View>
      )}
    </>
  );
}

function CommentCard({ comment, bookId }: { comment: Comment; bookId: string }) {
  const { colors, fonts, radii } = useTheme();
  const { t, locale } = useI18n();
  const api = useApi();
  const { profile } = useSession();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const offline = useOffline();
  const own = comment.author.id === profile?.id;

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.bookComments(bookId) }),
      queryClient.invalidateQueries({ queryKey: queryKeys.book(bookId) }),
    ]);

  const save = useMutation({
    mutationFn: (text: string) => editComment(api, comment.id, text),
    onSuccess: async () => {
      setDraft(null);
      await refresh();
    },
  });
  const remove = useMutation({
    mutationFn: () => deleteComment(api, comment.id),
    onSuccess: refresh,
  });
  const failure = save.error ?? remove.error;

  const muted = { color: colors.textMuted, fontFamily: fonts.body, fontSize: 12 };
  const link = { color: colors.primary, fontFamily: fonts.bodyMedium, fontSize: 13 };

  return (
    <View
      testID={`comment-${comment.id}`}
      style={[
        styles.comment,
        { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radii.lg },
      ]}
    >
      <Avatar name={comment.author.name} color={comment.author.color} />
      <View style={styles.commentBody}>
        <View style={styles.commentHeader}>
          <Text style={{ color: colors.text, fontFamily: fonts.bodySemiBold, fontSize: 14 }}>
            {comment.author.name}
          </Text>
          <Text style={muted}>
            {formatRelativeDate(comment.createdAt, Date.now(), locale, t)}
            {comment.updatedAt !== comment.createdAt ? ` · ${t('book.edited')}` : ''}
          </Text>
        </View>
        {draft === null ? (
          <Text
            style={{ color: colors.text, fontFamily: fonts.body, fontSize: 14, lineHeight: 21 }}
          >
            {comment.text}
          </Text>
        ) : (
          <TextInput
            accessibilityLabel={t('book.editLabel')}
            value={draft}
            onChangeText={setDraft}
            multiline
            maxLength={LIMITS.comment}
            style={[
              styles.editInput,
              {
                color: colors.text,
                borderColor: colors.border,
                borderRadius: radii.md,
                fontFamily: fonts.body,
              },
            ]}
          />
        )}
        {failure && (
          <Text accessibilityRole="alert" style={{ color: colors.busyFg, fontSize: 13 }}>
            {errorMessage(t, failure)}
          </Text>
        )}
        {own && (
          <View style={styles.commentActions}>
            {draft !== null ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={draft.trim() === '' || save.isPending || offline}
                  onPress={() => save.mutate(draft)}
                  style={styles.smallAction}
                >
                  <Text style={link}>{t('common.save')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDraft(null)}
                  style={styles.smallAction}
                >
                  <Text style={muted}>{t('common.cancel')}</Text>
                </Pressable>
              </>
            ) : confirming ? (
              <>
                <Pressable
                  accessibilityRole="button"
                  disabled={remove.isPending || offline}
                  onPress={() => remove.mutate()}
                  style={styles.smallAction}
                >
                  <Text style={[link, { color: colors.busyFg }]}>{t('book.confirmDelete')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirming(false)}
                  style={styles.smallAction}
                >
                  <Text style={muted}>{t('common.cancel')}</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setDraft(comment.text)}
                  style={styles.smallAction}
                >
                  <Text style={link}>{t('common.edit')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setConfirming(true)}
                  style={styles.smallAction}
                >
                  <Text style={link}>{t('common.delete')}</Text>
                </Pressable>
              </>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function Reviews({ book }: { book: BookDetail }) {
  const { colors, fonts } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const queryClient = useQueryClient();
  const comments = useComments(book.id);
  const [text, setText] = useState('');

  const publish = useMutation({
    mutationFn: () => postComment(api, book.id, text),
    onSuccess: async () => {
      setText('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.bookComments(book.id) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.book(book.id) }),
      ]);
    },
  });

  const count = comments.data?.length ?? book.commentCount;
  const offline = useOffline();
  const canPublish = text.trim() !== '' && !publish.isPending && !offline;

  return (
    <View style={styles.reviews}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}
      >
        {t('book.householdReviews', { count })}
      </Text>
      {comments.isPending ? (
        <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />
      ) : comments.isError ? (
        <Text accessibilityRole="alert" style={{ color: colors.text, fontFamily: fonts.body }}>
          {errorMessage(t, comments.error)}
        </Text>
      ) : comments.data.length === 0 ? (
        <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 14 }}>
          {t('book.noReviews')}
        </Text>
      ) : (
        comments.data.map((comment) => (
          <CommentCard key={comment.id} comment={comment} bookId={book.id} />
        ))
      )}

      <View style={styles.composer}>
        <View
          style={[
            styles.composerField,
            { backgroundColor: colors.surface, borderColor: colors.border },
          ]}
        >
          <TextInput
            accessibilityLabel={t('book.commentLabel')}
            placeholder={t('book.commentPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={setText}
            maxLength={LIMITS.comment}
            multiline
            style={[styles.composerInput, { color: colors.text, fontFamily: fonts.body }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('book.publishComment')}
          accessibilityState={{ disabled: !canPublish, busy: publish.isPending }}
          disabled={!canPublish}
          onPress={() => publish.mutate()}
          style={[styles.send, { backgroundColor: colors.primary, opacity: canPublish ? 1 : 0.55 }]}
        >
          {publish.isPending ? (
            <ActivityIndicator color={colors.onPrimary} />
          ) : (
            <Icon name="send" size={20} color={colors.onPrimary} />
          )}
        </Pressable>
      </View>
      {publish.isError && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium }}
        >
          {errorMessage(t, publish.error)}
        </Text>
      )}
    </View>
  );
}

/**
 * Book detail (design screen 3): cover, metadata, reading lock, read by, back cover (with
 * "Fill in missing details" when the cover or the text is missing), household reviews.
 */
export default function BookScreen() {
  const { id = '' } = useLocalSearchParams<{ id: string }>();
  const { colors, fonts, fontSizes } = useTheme();
  const { t } = useI18n();
  const api = useApi();
  const book = useBook(id);

  if (book.isPending) {
    return (
      <Screen>
        <BackLink label={t('book.back')} />
        <ActivityIndicator accessibilityLabel={t('common.loading')} color={colors.textMuted} />
      </Screen>
    );
  }
  if (book.isError && !book.data) {
    const missing = book.error instanceof ApiError && book.error.status === 404;
    return (
      <Screen>
        <BackLink label={t('book.back')} />
        <Text
          accessibilityRole="alert"
          style={{ color: colors.text, fontFamily: fonts.bodyMedium }}
        >
          {missing ? t('book.notFound') : errorMessage(t, book.error)}
        </Text>
        {!missing && (
          <Button variant="secondary" label={t('common.retry')} onPress={() => book.refetch()} />
        )}
      </Screen>
    );
  }

  const detail = book.data;
  const metaLines = [
    [detail.genres[0], detail.year].filter((part) => part !== undefined && part !== null),
    [detail.publisher, detail.pages ? t('book.pages', { count: detail.pages }) : null].filter(
      Boolean,
    ),
    [t('book.addedBy', { name: detail.addedBy.name })],
  ]
    .map((parts) => parts.join(' · '))
    .filter((line) => line !== '');

  return (
    <Screen>
      <View style={styles.topBar}>
        <BackLink label={t('book.back')} />
        <Button
          variant="link"
          label={t('bookForm.editTitle')}
          onPress={() => router.push(`/book/edit/${detail.id}`)}
        />
      </View>
      <View style={styles.hero}>
        <Cover
          title={detail.title}
          authors={detail.authors}
          uri={detail.coverUrl ? api.url(detail.coverUrl) : null}
          width={128}
          height={190}
        />
        <View style={styles.heroText}>
          <Text
            accessibilityRole="header"
            style={{
              color: colors.text,
              fontFamily: fonts.display,
              fontSize: detail.title.length > 40 ? 22 : fontSizes.screenTitle,
              letterSpacing: -0.5,
            }}
          >
            {detail.title}
          </Text>
          {detail.authors.length > 0 && (
            <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 15 }}>
              {detail.authors.join(', ')}
            </Text>
          )}
          <Text
            style={{
              color: colors.textMuted,
              fontFamily: fonts.body,
              fontSize: 13,
              lineHeight: 19,
            }}
          >
            {metaLines.join('\n')}
          </Text>
        </View>
      </View>

      <ReadingPanel book={detail} />

      {detail.description ? (
        <>
          <View style={[styles.separator, { backgroundColor: colors.border }]} />
          <BackCover text={detail.description} />
        </>
      ) : null}
      <EnrichAction book={detail} />

      <View style={[styles.separator, { backgroundColor: colors.border }]} />

      <Reviews book={detail} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hero: { flexDirection: 'row', gap: 18, alignItems: 'flex-end' },
  heroText: { flex: 1, gap: 6, paddingBottom: 4 },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { flex: 1, gap: 2 },
  actions: { gap: 10 },
  readBy: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatars: { flexDirection: 'row' },
  separator: { height: 1 },
  reviews: { gap: 14, paddingBottom: 32 },
  comment: { flexDirection: 'row', gap: 12, padding: 14, borderWidth: 1 },
  commentBody: { flex: 1, gap: 4 },
  commentHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  commentActions: { flexDirection: 'row', gap: 16 },
  smallAction: { minHeight: 44, justifyContent: 'center' },
  editInput: { borderWidth: 1, padding: 10, fontSize: 14, minHeight: 64 },
  composer: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  composerField: {
    flex: 1,
    minHeight: 50,
    paddingHorizontal: 14,
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 25,
  },
  composerInput: { fontSize: 15, paddingVertical: 12 },
  send: { width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
});
