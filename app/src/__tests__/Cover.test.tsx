import { coverColorsFor } from '@etagere/shared';
import { fireEvent, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { Cover } from '../components/Cover';
import { renderWithProviders } from '../test/render';

// Generated covers are hidden from screen readers (the title is rendered next to them).
const hidden = { includeHiddenElements: true };

describe('Cover', () => {
  it('is hidden from screen readers', async () => {
    await renderWithProviders(<Cover title="Dune" />);
    expect(screen.queryByText('Dune')).toBeNull();
  });

  it('draws a generated cover with title and first author when there is no image', async () => {
    await renderWithProviders(<Cover title="Dune" authors={['Frank Herbert', 'X']} />);

    const cover = screen.getByTestId('cover-generated', hidden);
    expect(StyleSheet.flatten(cover.props.style).backgroundColor).toBe(
      coverColorsFor('Dune').background,
    );
    expect(screen.getByText('Dune', hidden)).toBeTruthy();
    expect(screen.getByText('Frank Herbert', hidden)).toBeTruthy();
    expect(screen.queryByText('X', hidden)).toBeNull();
  });

  it('uses the color readable on the background', async () => {
    await renderWithProviders(<Cover title="Dune" />);
    expect(StyleSheet.flatten(screen.getByText('Dune', hidden).props.style).color).toBe(
      coverColorsFor('Dune').foreground,
    );
  });

  it('hides the text of a compact cover', async () => {
    await renderWithProviders(
      <Cover title="Dune" authors={['Frank Herbert']} compact width={40} height={60} />,
    );
    expect(screen.queryByText('Dune', hidden)).toBeNull();
  });

  it('shows the image when there is one, and falls back when it fails', async () => {
    await renderWithProviders(<Cover title="Dune" uri="http://h/api/covers/b1.jpg" />);
    const image = screen.getByTestId('cover-image');
    expect(image.props.source).toEqual({ uri: 'http://h/api/covers/b1.jpg' });

    await fireEvent(image, 'error');

    expect(screen.getByTestId('cover-generated', hidden)).toBeTruthy();
  });
});
