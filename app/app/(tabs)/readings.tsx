import { Screen, ScreenTitle } from '../../src/components/Screen';
import { useI18n } from '../../src/i18n/I18nProvider';

// Readings tab. Placeholder until the My readings screen ticket (#22).
export default function ReadingsScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <ScreenTitle title={t('readings.title')} />
    </Screen>
  );
}
