import { Screen, ScreenTitle } from '../../src/components/Screen';
import { useI18n } from '../../src/i18n/I18nProvider';

// Scan tab. Placeholder until the scanner tickets (#16 native, #17 web).
export default function ScanScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <ScreenTitle title={t('scan.title')} subtitle={t('scan.aim')} />
    </Screen>
  );
}
