import { COVER_PALETTE, PROFILE_COLORS, coverColorsFor, palettes } from '../tokens';

describe('palettes', () => {
  it('light and dark define the same tokens', () => {
    expect(Object.keys(palettes.dark).sort()).toEqual(Object.keys(palettes.light).sort());
  });

  it('uses the design primary colors', () => {
    expect(palettes.light.primary).toBe('#1F6B4A');
    expect(palettes.dark.primary).toBe('#3DDC84');
  });
});

describe('PROFILE_COLORS', () => {
  it('offers the five design colors', () => {
    expect(PROFILE_COLORS.map((c) => c.value)).toEqual([
      '#1F6B4A',
      '#2C4A6B',
      '#B5523B',
      '#6B4E8A',
      '#C08A1E',
    ]);
  });
});

describe('coverColorsFor', () => {
  it('is deterministic', () => {
    expect(coverColorsFor('Dune')).toBe(coverColorsFor('Dune'));
  });

  it('ignores case, accents and surrounding spaces', () => {
    expect(coverColorsFor('  L’Étranger ')).toBe(coverColorsFor('l’etranger'));
  });

  it('always returns a color of the design palette', () => {
    for (const title of ['', 'Dune', 'Sapiens', 'Le Petit Prince', 'a'.repeat(300)]) {
      expect(COVER_PALETTE).toContain(coverColorsFor(title));
    }
  });

  it('spreads titles over several colors', () => {
    const titles = [
      'Dune',
      'Sapiens',
      'Le Petit Prince',
      'Fondation',
      'Hypérion',
      'Ubik',
      'Kindred',
    ];
    const used = new Set(titles.map((t) => coverColorsFor(t).background));
    expect(used.size).toBeGreaterThan(3);
  });

  it('pins known values so covers never change between releases', () => {
    expect(coverColorsFor('Dune').background).toMatchInlineSnapshot(`"#1E2A33"`);
    expect(coverColorsFor('Sapiens').background).toMatchInlineSnapshot(`"#6B4E8A"`);
  });
});
