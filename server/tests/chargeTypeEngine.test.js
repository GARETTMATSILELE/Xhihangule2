const chargeTypeModule = require('../dist/services/chargeTypeService');

const service = chargeTypeModule.default || chargeTypeModule;
const defaults = chargeTypeModule.DEFAULT_CHARGE_TYPES || [];

describe('Charge Type Engine defaults and compatibility helpers', () => {
  test('seeds default rent as owner income', () => {
    const rent = defaults.find((item) => item.code === 'RENT');
    expect(rent).toMatchObject({
      category: 'PROPERTY_INCOME',
      ownerIncome: true
    });
  });

  test('seeds pass-through charge types without owner income', () => {
    for (const code of ['LEVY', 'WATER', 'ELECTRICITY', 'RATES']) {
      const chargeType = defaults.find((item) => item.code === code);
      expect(chargeType).toMatchObject({
        category: 'PASS_THROUGH',
        ownerIncome: false,
        requiresThirdPartyPayment: true
      });
    }
  });

  test('seeds deposits as liabilities', () => {
    const deposit = defaults.find((item) => item.code === 'DEPOSIT');
    expect(deposit).toMatchObject({
      category: 'LIABILITY',
      ownerIncome: false
    });
  });

  test('creates compatibility lines for legacy rent plus levy payments', () => {
    const lines = service.legacyPaymentLines({
      amount: 550,
      rentAllocated: 500,
      levyAllocated: 50,
      depositAmount: 0,
      paymentType: 'rental'
    });
    expect(lines).toEqual([
      expect.objectContaining({ chargeTypeCode: 'RENT', amount: 500 }),
      expect.objectContaining({ chargeTypeCode: 'LEVY', amount: 50 })
    ]);
  });

  test('creates compatibility lines for legacy deposits without owner income', () => {
    const lines = service.legacyPaymentLines({
      amount: 0,
      depositAmount: 300,
      paymentType: 'rental'
    });
    expect(lines).toEqual([
      expect.objectContaining({ chargeTypeCode: 'DEPOSIT', amount: 300 })
    ]);
  });
});
