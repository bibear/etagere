import { screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Avatar } from '../components/Avatar';
import { renderWithProviders } from '../test/render';

const initialColor = (letter: string) =>
  StyleSheet.flatten(screen.getByText(letter, { includeHiddenElements: true }).props.style).color;

describe('Avatar', () => {
  it('draws the initial in white on a dark profile color', async () => {
    await renderWithProviders(<Avatar name="Bruno" color="#1F6B4A" />);
    expect(initialColor('B')).toBe('#FFFFFF');
  });

  it.each(['#C08A1E', '#FFFFFF'])('draws the initial in dark ink on %s', async (color) => {
    await renderWithProviders(<Avatar name="Inès" color={color} />);
    expect(initialColor('I')).toBe('#16201B');
  });
});
