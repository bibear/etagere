import { Screen, ScreenTitle } from '../../src/components/Screen';
import { useI18n } from '../../src/i18n/I18nProvider';

// For you tab. Placeholder until the Recommendations screen ticket (#24).
export default function ForYouScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <ScreenTitle title={t('recos.title')} />
    </Screen>
  );
}
