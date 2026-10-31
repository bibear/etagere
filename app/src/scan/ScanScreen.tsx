import { type BookCandidate, type BookSummary, normalizeIsbn } from '@etagere/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { createBook, inputFromCandidate, lookupIsbn } from '../api/catalog';
import { errorMessage } from '../api/errors';
import { queryKeys } from '../api/queryKeys';
import { Button } from '../components/Button';
import { Cover } from '../components/Cover';
import { Icon } from '../components/Icon';
import { useI18n } from '../i18n/I18nProvider';
import { useApi } from '../session/SessionProvider';
import { useTheme } from '../theme/ThemeProvider';
import { scannerBackend } from './backend';
import { createScanGate } from './scanGate';
import type { ScannerBackend, ScannerError } from './types';

/** What the bottom sheet shows. `scanning` = no sheet, the camera decodes. */
type Phase =
  | { kind: 'scanning' }
  | { kind: 'typing' }
  | { kind: 'lookingUp'; isbn: string }
  | { kind: 'found'; candidate: BookCandidate }
  | { kind: 'added'; book: BookSummary }
  | { kind: 'exists'; book: BookSummary }
  | { kind: 'notFound'; isbn: string }
  | { kind: 'failed'; isbn: string | null; error: unknown };

const SHEET_HANDLE = '#C9CFC9';
const CONTROL_BG = '#26302C';
const HINT = '#C6CEC9';

/**
 * Barcode scanner (design screen 4): camera with the viewfinder, then a bottom sheet with the
 * Open Library candidate, added in one tap. "Scan another" and "Type the ISBN" stay available.
 */
export function ScanScreen({
  backend = scannerBackend,
  now,
}: {
  backend?: ScannerBackend;
  /** Injected clock of the duplicate-code filter (tests). */
  now?: () => number;
}) {
  const { t } = useI18n();
  const theme = useTheme();
  const { colors, fonts } = theme;
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const permission = backend.useCameraPermission();
  const gate = useMemo(() => createScanGate({ now }), [now]);

  const [phase, setPhase] = useState<Phase>({ kind: 'scanning' });
  const [torch, setTorch] = useState(false);
  const [focused, setFocused] = useState(true);
  const [cameraError, setCameraError] = useState<ScannerError | null>(null);
  const asked = useRef(false);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  // Ask once when the user has never been asked; afterwards the screen offers a button.
  const { status, request } = permission;
  useEffect(() => {
    if (status === 'undetermined' && !asked.current) {
      asked.current = true;
      request().catch(() => {});
    }
  }, [status, request]);

  const lookup = useMutation({
    mutationFn: (isbn: string) => lookupIsbn(api, isbn),
    onMutate: (isbn) => setPhase({ kind: 'lookingUp', isbn }),
    onSuccess: (candidate) => setPhase({ kind: 'found', candidate }),
    onError: (error, isbn) => setPhase(phaseOfError(error, isbn)),
  });

  const add = useMutation({
    mutationFn: (candidate: BookCandidate) => createBook(api, inputFromCandidate(candidate)),
    onSuccess: async (book) => {
      setPhase({ kind: 'added', book });
      queryClient.setQueryData(queryKeys.book(book.id), book);
      await queryClient.invalidateQueries();
    },
    onError: (error, candidate) => setPhase(phaseOfError(error, candidate.isbn13)),
  });

  const onCode = useCallback(
    (payload: string) => {
      const isbn = gate.accept(payload);
      if (isbn) lookup.mutate(isbn);
    },
    [gate, lookup],
  );

  const scanAnother = () => {
    gate.reset();
    add.reset();
    setPhase({ kind: 'scanning' });
  };

  const close = () => (router.canGoBack() ? router.back() : router.navigate('/'));
  const scanning = phase.kind === 'scanning';
  const cameraReady = permission.status === 'granted' && cameraError === null;
  const Camera = backend.Camera;

  return (
    <View style={[styles.root, { backgroundColor: colors.scannerBackground }]}>
      {cameraReady && (
        <Camera
          active={scanning && focused}
          torch={torch}
          onCode={onCode}
          onError={setCameraError}
        />
      )}
      <SafeAreaView edges={['top']} style={styles.root}>
        <View style={styles.topBar}>
          <RoundButton label={t('scan.close')} icon="close" onPress={close} />
          <Text
            accessibilityRole="header"
            style={{ color: '#FFFFFF', fontFamily: fonts.bodySemiBold, fontSize: 16 }}
          >
            {t('scan.title')}
          </Text>
          {backend.hasTorch && cameraReady ? (
            <RoundButton
              label={t(torch ? 'scan.torchOff' : 'scan.torchOn')}
              icon="torch"
              selected={torch}
              onPress={() => setTorch((on) => !on)}
            />
          ) : (
            <View style={styles.roundButton} />
          )}
        </View>

        <View style={styles.middle}>
          {permission.status === 'granted' && cameraError !== 'denied' ? (
            <>
              <Viewfinder accent={colors.scannerAccent} label={t('scan.barcodeLabel')} />
              <Text style={[styles.hint, { fontFamily: fonts.body }]}>
                {cameraError === 'unavailable'
                  ? t('scan.cameraUnavailable')
                  : `${t('scan.aim')}\n${t('scan.autoAdd')}`}
              </Text>
            </>
          ) : permission.status === 'pending' ? (
            <ActivityIndicator color={colors.scannerAccent} />
          ) : (
            <PermissionPanel
              canAsk={permission.canAskAgain && cameraError !== 'denied'}
              onAllow={() => permission.request().catch(() => {})}
            />
          )}
        </View>

        <Sheet>
          <SheetContent
            phase={phase}
            api={api}
            adding={add.isPending}
            onAdd={(candidate) => add.mutate(candidate)}
            onScanAnother={scanAnother}
            onType={() => setPhase({ kind: 'typing' })}
            onSearch={(isbn) => lookup.mutate(isbn)}
            onRetry={(isbn) => lookup.mutate(isbn)}
            onOpen={(id) => router.push(`/book/${id}`)}
            onManual={(isbn) => router.push(isbn ? `/book/new?isbn=${isbn}` : '/book/new')}
          />
        </Sheet>
      </SafeAreaView>
    </View>
  );
}

function phaseOfError(error: unknown, isbn: string | null): Phase {
  if (error instanceof ApiError) {
    if (error.code === 'already_in_library' && error.body.book) {
      return { kind: 'exists', book: error.body.book as BookSummary };
    }
    if (error.code === 'not_found' && isbn) return { kind: 'notFound', isbn };
  }
  return { kind: 'failed', isbn, error };
}

function RoundButton({
  label,
  icon,
  onPress,
  selected,
}: {
  label: string;
  icon: 'close' | 'torch';
  onPress: () => void;
  selected?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      onPress={onPress}
      style={[
        styles.roundButton,
        { backgroundColor: selected ? colors.scannerAccent : CONTROL_BG },
      ]}
    >
      <Icon name={icon} size={20} color={selected ? colors.scannerBackground : '#FFFFFF'} />
    </Pressable>
  );
}

/** The 290×180 frame with green corners and the scan line of the design. */
function Viewfinder({ accent, label }: { accent: string; label: string }) {
  const corner = { borderColor: accent, width: 36, height: 36, position: 'absolute' as const };
  return (
    <View accessible accessibilityLabel={label} style={styles.frame}>
      <View style={[styles.scanLine, { backgroundColor: accent }]} />
      <View
        style={[
          corner,
          { left: -10, top: -10, borderLeftWidth: 4, borderTopWidth: 4, borderTopLeftRadius: 20 },
        ]}
      />
      <View
        style={[
          corner,
          {
            right: -10,
            top: -10,
            borderRightWidth: 4,
            borderTopWidth: 4,
            borderTopRightRadius: 20,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            left: -10,
            bottom: -10,
            borderLeftWidth: 4,
            borderBottomWidth: 4,
            borderBottomLeftRadius: 20,
          },
        ]}
      />
      <View
        style={[
          corner,
          {
            right: -10,
            bottom: -10,
            borderRightWidth: 4,
            borderBottomWidth: 4,
            borderBottomRightRadius: 20,
          },
        ]}
      />
    </View>
  );
}

function PermissionPanel({ canAsk, onAllow }: { canAsk: boolean; onAllow: () => void }) {
  const { t } = useI18n();
  const { fonts } = useTheme();
  return (
    <View style={styles.permission}>
      <Text
        accessibilityRole="header"
        style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 22, textAlign: 'center' }}
      >
        {t('scan.permissionTitle')}
      </Text>
      <Text style={[styles.hint, { fontFamily: fonts.body }]}>{t('scan.permissionBody')}</Text>
      <View style={styles.permissionButton}>
        <Button
          label={t(canAsk ? 'scan.allowCamera' : 'scan.openSettings')}
          onPress={canAsk ? onAllow : () => Linking.openSettings().catch(() => {})}
        />
      </View>
    </View>
  );
}

function Sheet({ children }: { children: React.ReactNode }) {
  const { colors, scheme } = useTheme();
  return (
    <View
      style={[styles.sheet, { backgroundColor: scheme === 'dark' ? colors.surface : '#FFFFFF' }]}
    >
      <View style={[styles.handle, { backgroundColor: SHEET_HANDLE }]} />
      {children}
    </View>
  );
}

function Links({ left, right }: { left?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={styles.links}>
      {left ?? <View />}
      {right ?? <View />}
    </View>
  );
}

function SheetContent({
  phase,
  api,
  adding,
  onAdd,
  onScanAnother,
  onType,
  onSearch,
  onRetry,
  onOpen,
  onManual,
}: {
  phase: Phase;
  api: ReturnType<typeof useApi>;
  adding: boolean;
  onAdd(candidate: BookCandidate): void;
  onScanAnother(): void;
  onType(): void;
  onSearch(isbn: string): void;
  onRetry(isbn: string): void;
  onOpen(id: string): void;
  onManual(isbn: string | null): void;
}) {
  const { t } = useI18n();
  const { colors, fonts, fontSizes } = useTheme();
  const scanAnother = (
    <Button variant="link" label={t('scan.scanAnother')} onPress={onScanAnother} />
  );
  const typeIsbn = <Button variant="link" label={t('scan.typeIsbn')} onPress={onType} />;
  const body = { color: colors.textMuted, fontFamily: fonts.body, fontSize: fontSizes.small };

  switch (phase.kind) {
    case 'scanning':
      return (
        <Links
          left={typeIsbn}
          right={
            <Button
              variant="link"
              label={t('scan.addWithoutBarcode')}
              onPress={() => onManual(null)}
            />
          }
        />
      );
    case 'typing':
      return <IsbnEntry onSearch={onSearch} onCancel={onScanAnother} />;
    case 'lookingUp':
      return (
        <View style={styles.row} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.primary} />
          <Text style={body}>{t('scan.lookingUp')}</Text>
        </View>
      );
    case 'found':
      return (
        <>
          <Badge label={t('scan.found')} tone="ok" extra={t('scan.viaOpenLibrary')} />
          <CandidateRow
            title={phase.candidate.title}
            authors={phase.candidate.authors}
            meta={[phase.candidate.genres?.[0], phase.candidate.publisher, phase.candidate.year]}
            uri={phase.candidate.coverSourceUrl}
          />
          <Button
            label={t('scan.addToLibrary')}
            busy={adding}
            onPress={() => onAdd(phase.candidate)}
          />
          <Links left={scanAnother} right={typeIsbn} />
        </>
      );
    case 'added':
    case 'exists':
      return (
        <>
          <Badge
            label={t(phase.kind === 'added' ? 'scan.added' : 'scan.alreadyInLibrary')}
            tone={phase.kind === 'added' ? 'ok' : 'busy'}
          />
          <CandidateRow
            title={phase.book.title}
            authors={phase.book.authors}
            meta={[]}
            uri={phase.book.coverUrl ? api.url(phase.book.coverUrl) : null}
          />
          <Button label={t('scan.scanAnother')} onPress={onScanAnother} />
          <Links
            left={
              <Button
                variant="link"
                label={t('scan.openBook')}
                onPress={() => onOpen(phase.book.id)}
              />
            }
            right={typeIsbn}
          />
        </>
      );
    case 'notFound':
      return (
        <>
          <Badge label={t('scan.notFound')} tone="busy" />
          <Text style={body}>{t('scan.notFoundBody', { isbn: phase.isbn })}</Text>
          <Button label={t('scan.enterManually')} onPress={() => onManual(phase.isbn)} />
          <Links left={scanAnother} right={typeIsbn} />
        </>
      );
    case 'failed': {
      const { isbn } = phase;
      return (
        <>
          <Text accessibilityRole="alert" style={[body, { color: colors.text }]}>
            {errorMessage(t, phase.error)}
          </Text>
          {isbn !== null && (
            <Button variant="secondary" label={t('common.retry')} onPress={() => onRetry(isbn)} />
          )}
          <Links left={scanAnother} right={typeIsbn} />
        </>
      );
    }
  }
}

function IsbnEntry({ onSearch, onCancel }: { onSearch(isbn: string): void; onCancel(): void }) {
  const { t } = useI18n();
  const { colors, fonts, radii } = useTheme();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = () => {
    const isbn = normalizeIsbn(value);
    if (isbn) onSearch(isbn);
    else setInvalid(true);
  };
  return (
    <>
      <TextInput
        accessibilityLabel={t('scan.isbnLabel')}
        placeholder={t('scan.isbnPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={(text) => {
          setValue(text);
          setInvalid(false);
        }}
        onSubmitEditing={submit}
        keyboardType="numbers-and-punctuation"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        returnKeyType="search"
        style={[
          styles.input,
          {
            borderColor: invalid ? colors.busyDot : colors.border,
            color: colors.text,
            fontFamily: fonts.body,
            borderRadius: radii.md,
          },
        ]}
      />
      {invalid && (
        <Text
          accessibilityRole="alert"
          style={{ color: colors.busyFg, fontFamily: fonts.bodyMedium }}
        >
          {t('errors.invalid_isbn')}
        </Text>
      )}
      <Button label={t('scan.search')} disabled={value.trim() === ''} onPress={submit} />
      <Links left={<Button variant="link" label={t('scan.scanAnother')} onPress={onCancel} />} />
    </>
  );
}

function Badge({ label, tone, extra }: { label: string; tone: 'ok' | 'busy'; extra?: string }) {
  const { colors, fonts } = useTheme();
  return (
    <View style={styles.row}>
      <Text
        style={[
          styles.badge,
          {
            fontFamily: fonts.bodySemiBold,
            backgroundColor: tone === 'ok' ? colors.availableBg : colors.busyBg,
            color: tone === 'ok' ? colors.availableFg : colors.busyFg,
          },
        ]}
      >
        {label}
      </Text>
      {extra !== undefined && (
        <Text style={{ fontSize: 12, color: colors.textMuted, fontFamily: fonts.body }}>
          {extra}
        </Text>
      )}
    </View>
  );
}

function CandidateRow({
  title,
  authors,
  meta,
  uri,
}: {
  title: string;
  authors: readonly string[];
  meta: (string | number | null | undefined)[];
  uri: string | null;
}) {
  const { colors, fonts } = useTheme();
  const metaLine = meta.filter((part) => part !== null && part !== undefined && part !== '');
  return (
    <View style={styles.candidate}>
      <Cover title={title} authors={authors} uri={uri} width={64} height={96} />
      <View style={styles.candidateText}>
        <Text style={{ color: colors.text, fontFamily: fonts.display, fontSize: 20 }}>{title}</Text>
        {authors.length > 0 && (
          <Text style={{ color: colors.text, fontFamily: fonts.body, fontSize: 14 }}>
            {authors.join(', ')}
          </Text>
        )}
        {metaLine.length > 0 && (
          <Text style={{ color: colors.textMuted, fontFamily: fonts.body, fontSize: 13 }}>
            {metaLine.join(' · ')}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  roundButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22, padding: 24 },
  frame: { width: 290, height: 180, borderRadius: 18 },
  scanLine: { position: 'absolute', left: 18, right: 18, top: 88, height: 3, borderRadius: 2 },
  hint: { color: HINT, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  permission: { gap: 14, alignItems: 'center', maxWidth: 320 },
  permissionButton: { alignSelf: 'stretch' },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2 },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    overflow: 'hidden',
  },
  candidate: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  candidateText: { flex: 1, gap: 4 },
  input: { minHeight: 48, borderWidth: 1, paddingHorizontal: 14, fontSize: 18 },
});
