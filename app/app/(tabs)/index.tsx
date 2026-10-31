import { Screen, ScreenTitle } from '../../src/components/Screen';
import { useI18n } from '../../src/i18n/I18nProvider';

// Library tab. Placeholder until the Library screen ticket (#14).
export default function LibraryScreen() {
  const { t } = useI18n();
  return (
    <Screen>
      <ScreenTitle title={t('library.title')} />
    </Screen>
  );
}
