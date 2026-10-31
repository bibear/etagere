import { createScanGate } from '../scan/scanGate';

describe('scan gate', () => {
  it('keeps valid book ISBNs only', () => {
    const gate = createScanGate();
    expect(gate.accept(' 9782352940159 ')).toBe('9782352940159');
    expect(gate.accept('9790230671187')).toBe('9790230671187'); // 979 prefix
    expect(gate.accept('4006381333931')).toBeNull(); // not a book
    expect(gate.accept('9782352940158')).toBeNull(); // bad checksum
    expect(gate.accept('https://example.org')).toBeNull();
  });

  it('drops the same code within the cooldown, accepts it after', () => {
    let now = 1000;
    const gate = createScanGate({ now: () => now, cooldownMs: 3000 });
    expect(gate.accept('9782352940159')).toBe('9782352940159');
    now += 2999;
    expect(gate.accept('9782352940159')).toBeNull();
    now += 1;
    expect(gate.accept('9782352940159')).toBe('9782352940159');
  });

  it('accepts another book at once, and the same one again after a reset', () => {
    const gate = createScanGate({ now: () => 0 });
    expect(gate.accept('9782352940159')).not.toBeNull();
    expect(gate.accept('9782266111560')).toBe('9782266111560');
    expect(gate.accept('9782266111560')).toBeNull();
    gate.reset();
    expect(gate.accept('9782266111560')).toBe('9782266111560');
  });
});
