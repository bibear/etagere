import type { Availability } from '@etagere/shared';
import { Text } from 'react-native';

import { useI18n } from '../i18n/I18nProvider';
import { useTheme } from '../theme/ThemeProvider';

/** Short availability label of a book: "Disponible", "Jules lit", "Prêté à Marc". */
export function useAvailabilityLabel() {
  const { t } = useI18n();
  return (availability: Availability): string => {
    switch (availability.state) {
      case 'available':
        return t('availability.available');
      case 'reading':
        return t('availability.readingBy', { name: availability.by.name });
      case 'lent':
        return t('availability.lentTo', { name: availability.borrower });
    }
  };
}

/** The pill under a cover in the library grid: green when available, amber otherwise. */
export function AvailabilityBadge({ availability }: { availability: Availability }) {
  const { colors, fonts, fontSizes } = useTheme();
  const label = useAvailabilityLabel()(availability);
  const available = availability.state === 'available';
  return (
    <Text
      numberOfLines={1}
      style={{
        alignSelf: 'flex-start',
        overflow: 'hidden',
        fontFamily: fonts.bodySemiBold,
        fontSize: fontSizes.badge,
        paddingVertical: 3,
        paddingHorizontal: 8,
        borderRadius: 10,
        backgroundColor: available ? colors.availableBg : colors.busyBg,
        color: available ? colors.availableFg : colors.busyFg,
      }}
    >
      {label}
    </Text>
  );
}
