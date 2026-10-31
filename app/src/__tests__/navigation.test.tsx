import { fireEvent, screen } from '@testing-library/react-native';
import { Slot } from 'expo-router';
import { renderRouter } from 'expo-router/testing-library';

import ForYouScreen from '../../app/(tabs)/for-you';
import TabsLayout from '../../app/(tabs)/_layout';
import LibraryScreen from '../../app/(tabs)/index';
import ReadingsScreen from '../../app/(tabs)/readings';
import ScanScreen from '../../app/(tabs)/scan';
import { AppProviders } from '../components/AppProviders';
import { fakeFetch } from '../test/fakeFetch';
import { booksResponse } from '../test/fixtures';
import { TEST_PROFILE } from '../test/render';

const api = fakeFetch({ 'GET /api/books': { body: booksResponse([]) } });

const routes = (locale: 'fr' | 'en') => ({
  _layout: () => (
    <AppProviders
      locale={locale}
      scheme="light"
      fetch={api.fetch}
      session={{ profile: TEST_PROFILE, serverUrl: 'http://t' }}
    >
      <Slot />
    </AppProviders>
  ),
  '(tabs)/_layout': TabsLayout,
  '(tabs)/index': LibraryScreen,
  '(tabs)/readings': ReadingsScreen,
  '(tabs)/scan': ScanScreen,
  '(tabs)/for-you': ForYouScreen,
});

describe('tab navigation', () => {
  it('opens on the library with the four tabs of the design', async () => {
    await renderRouter(routes('fr'), { initialUrl: '/' });

    expect(await screen.findByRole('header', { name: 'La bibliothèque' })).toBeTruthy();
    for (const label of ['Biblio', 'Lectures', 'Scanner', 'Pour toi']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it.each([
    ['Lectures', 'Mes lectures', '/readings'],
    ['Scanner', 'Scanner un livre', '/scan'],
    ['Pour toi', 'Pour toi', '/for-you'],
  ])('switches to %s', async (tab, title, path) => {
    await renderRouter(routes('fr'), { initialUrl: '/' });
    await screen.findByRole('header', { name: 'La bibliothèque' });

    await fireEvent.press(screen.getAllByText(tab)[0]!);

    expect(await screen.findByRole('header', { name: title })).toBeTruthy();
    expect(screen).toHavePathname(path);
  });

  it('labels the tabs in English', async () => {
    await renderRouter(routes('en'), { initialUrl: '/' });
    expect(await screen.findByRole('header', { name: 'The library' })).toBeTruthy();
    expect(screen.getAllByText('For you').length).toBeGreaterThan(0);
  });
});
