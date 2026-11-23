const {
  formatGrams,
  formatINR,
  parsePositiveRupeesToPaise,
  parseRupeesToPaise,
  previewConversion,
  remainingAdvance,
  roundDivHalfAwayFromZero,
} = require('../src/utils/goldCalculations');

describe('gold calculation precision', () => {
  test('customer still owes 0.2000 g after a 42000 income conversion', () => {
    const result = previewConversion({
      previousScaled: 30000,
      incomePaise: 4200000,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.convertedScaled).toBe(28000n);
    expect(result.newBalanceScaled).toBe(2000n);
    expect(formatGrams(result.newBalanceScaled)).toBe('0.2000 g');
    expect(result.presentation.sentence).toBe('Customer still owes 0.2000 g.');
  });

  test('extra payment produces approximately -0.3333 g', () => {
    const result = previewConversion({
      previousScaled: 30000,
      incomePaise: 5000000,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.convertedScaled).toBe(33333n);
    expect(result.newBalanceScaled).toBe(-3333n);
    expect(formatGrams(result.newBalanceScaled)).toBe('-0.3333 g');
    expect(result.presentation.shortLabel).toBe('Excess credit');
  });

  test('partial advance of 5000 with 10000 income settles 1.0000 g', () => {
    const result = previewConversion({
      previousScaled: 30000,
      incomePaise: 1000000,
      advancePaise: 500000,
      ratePaisePerGram: 1500000,
    });
    expect(result.totalPaise).toBe(1500000n);
    expect(result.convertedScaled).toBe(10000n);
    expect(result.newBalanceScaled).toBe(20000n);
    expect(formatGrams(result.newBalanceScaled)).toBe('2.0000 g');
  });

  test('unchecked advance is excluded and leaves 2.3333 g', () => {
    const result = previewConversion({
      previousScaled: 30000,
      incomePaise: 1000000,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.advancePaise).toBe(0n);
    expect(result.convertedScaled).toBe(6667n);
    expect(result.newBalanceScaled).toBe(23333n);
    expect(formatGrams(result.newBalanceScaled)).toBe('2.3333 g');
  });

  test('remaining advance after using 5000 of 15000 is 10000', () => {
    expect(remainingAdvance(1500000n, 500000n)).toBe(1000000n);
    expect(formatINR(1000000n)).toBe('₹10,000.00');
  });

  test('using more advance than available is rejected', () => {
    expect(() => remainingAdvance(1500000, 2000000)).toThrow(/available advance/);
  });

  test('a zero gold rate is rejected', () => {
    expect(() =>
      previewConversion({
        previousScaled: 30000,
        incomePaise: 1000000,
        advancePaise: 0,
        ratePaisePerGram: 0,
      }),
    ).toThrow(/greater than zero/);
    expect(() => parsePositiveRupeesToPaise('0', 'Gold rate')).toThrow(/greater than zero/);
  });

  test('a negative payment amount is rejected', () => {
    expect(() => parseRupeesToPaise('-100', 'Income amount')).toThrow(/cannot be negative/);
    expect(() => parsePositiveRupeesToPaise('-1', 'Income amount')).toThrow();
  });

  test('negative opening balance is preserved', () => {
    const result = previewConversion({
      previousScaled: -15000,
      incomePaise: 1500000,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.newBalanceScaled).toBe(-25000n);
    expect(formatGrams(result.newBalanceScaled)).toBe('-2.5000 g');
  });

  test('exact 45000 income settles a 3 g balance', () => {
    const result = previewConversion({
      previousScaled: 30000,
      incomePaise: 4500000,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.convertedScaled).toBe(30000n);
    expect(result.newBalanceScaled).toBe(0n);
    expect(formatGrams(result.newBalanceScaled)).toBe('0.0000 g');
  });

  test('converting income from a negative balance keeps subtracting grams', () => {
    const result = previewConversion({
      previousScaled: -90627,
      incomePaise: 18094050,
      advancePaise: 0,
      ratePaisePerGram: 1500000,
    });
    expect(result.convertedScaled).toBe(120627n);
    expect(result.newBalanceScaled).toBe(-211254n);
    expect(formatGrams(result.newBalanceScaled)).toBe('-21.1254 g');
  });

  test('income plus advance beyond the pending balance stays negative', () => {
    const result = previewConversion({
      previousScaled: 20000,
      incomePaise: 2000000,
      advancePaise: 2000000,
      ratePaisePerGram: 1500000,
    });
    expect(result.totalPaise).toBe(4000000n);
    expect(result.convertedScaled).toBe(26667n);
    expect(formatGrams(result.convertedScaled)).toBe('2.6667 g');
    expect(formatGrams(result.newBalanceScaled)).toBe('-0.6667 g');
  });

  test('advance alone converts when income is zero', () => {
    const result = previewConversion({
      previousScaled: 20000,
      incomePaise: 0,
      advancePaise: 3000000,
      ratePaisePerGram: 1500000,
    });
    expect(result.convertedScaled).toBe(20000n);
    expect(result.newBalanceScaled).toBe(0n);
  });

  test('a negative gold rate is rejected', () => {
    expect(() => parsePositiveRupeesToPaise('-15000', 'Gold rate')).toThrow(/negative/);
  });

  test('half units round away from zero', () => {
    expect(roundDivHalfAwayFromZero(5n, 2n)).toBe(3n);
    expect(roundDivHalfAwayFromZero(-5n, 2n)).toBe(-3n);
  });

  test('indian currency grouping', () => {
    expect(formatINR(4200000)).toBe('₹42,000.00');
    expect(formatINR(123456789)).toBe('₹12,34,567.89');
  });
});
