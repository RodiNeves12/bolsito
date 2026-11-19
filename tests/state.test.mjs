import test from 'node:test';
import assert from 'node:assert/strict';

import {
  centsToInputValue,
  createDefaultState,
  formatBRL,
  generateId,
  parseCurrencyToCents,
  parsePercentageRate,
  SCHEMA_VERSION,
  validateAndSanitizeState
} from '../js/state.js';

test('parseCurrencyToCents interpreta formatos brasileiros, americanos e casos extremos', () => {
  assert.equal(parseCurrencyToCents('9,40'), 940);
  assert.equal(parseCurrencyToCents('9.40'), 940);
  assert.equal(parseCurrencyToCents('9.5'), 950);
  assert.equal(parseCurrencyToCents('10'), 1000);
  assert.equal(parseCurrencyToCents('0,00'), 0);
  assert.equal(parseCurrencyToCents(0), 0);
  assert.equal(parseCurrencyToCents(12.34), 1234);

  // Separador de milhar pt-BR sem vírgula decimal (regressão crítica)
  assert.equal(parseCurrencyToCents('1.000'), 100000);
  assert.equal(parseCurrencyToCents('1.250'), 125000);
  assert.equal(parseCurrencyToCents('1.000.000'), 100000000);
  assert.equal(parseCurrencyToCents('R$ 1.250,50'), 125050);
  assert.equal(parseCurrencyToCents('R$ 1.000.000,99'), 100000099);

  // Formato US com vírgula de milhar e ponto decimal
  assert.equal(parseCurrencyToCents('1,250.50'), 125050);

  // Entradas inválidas
  assert.equal(parseCurrencyToCents(''), null);
  assert.equal(parseCurrencyToCents('   '), null);
  assert.equal(parseCurrencyToCents('abc'), null);
  assert.equal(parseCurrencyToCents('-10,00'), null);
  assert.equal(parseCurrencyToCents(-5), null);
  assert.equal(parseCurrencyToCents(Number.NaN), null);
  assert.equal(parseCurrencyToCents(Number.POSITIVE_INFINITY), null);
  assert.equal(parseCurrencyToCents('1234.567'), null);
  assert.equal(parseCurrencyToCents('999999999999999999'), null);
});

test('parsePercentageRate valida faixas e formatos pt-BR', () => {
  assert.equal(parsePercentageRate('10,65'), 10.65);
  assert.equal(parsePercentageRate('102%'), 102);
  assert.equal(parsePercentageRate(' 100,5 % '), 100.5);
  assert.equal(parsePercentageRate(0, { min: 0, max: 200 }), 0);

  assert.equal(parsePercentageRate('-1'), null);
  assert.equal(parsePercentageRate('250', { min: 0, max: 200 }), null);
  assert.equal(parsePercentageRate('abc'), null);
});

test('formatBRL e centsToInputValue lidam com positivos, negativos e valores não finitos', () => {
  assert.equal(centsToInputValue(940), '9,40');
  assert.equal(centsToInputValue(0), '0,00');
  assert.equal(centsToInputValue(Number.NaN), '0,00');

  assert.match(formatBRL(125050), /R\$\s*1\.250,50/);
  assert.match(formatBRL(0), /R\$\s*0,00/);
  assert.match(formatBRL(-500), /-R\$\s*5,00/);
});

test('generateId produz IDs seguros e únicos mesmo com prefixo inválido', () => {
  const safeRe = /^[a-zA-Z0-9_-]{1,64}$/;
  const id1 = generateId('box');
  const id2 = generateId('box');
  const badPrefixId = generateId('" onclick="alert(1)');

  assert.match(id1, safeRe);
  assert.match(id2, safeRe);
  assert.notEqual(id1, id2);
  assert.match(badPrefixId, /^id_[a-zA-Z0-9_-]+$/);
});

test('validateAndSanitizeState migra backup v1 para v2 sem perda de dados', () => {
  const v1Backup = {
    version: 1,
    theme: 'dark',
    palette: 'ardosia',
    settings: { includeTodayInProjection: false },
    fareSchedules: [
      {
        id: 'sched_2025',
        effectiveDate: '2025-01-01',
        label: 'Tarifa 2025',
        weekdays: [0, 860, 860, 860, 860, 860, 0]
      }
    ],
    exceptions: {
      '2025-03-10': { type: 'nao_gastei', note: 'Home office' }
    },
    monthlyRecharges: {
      '2025-03': 18000
    },
    cardBalance: { cents: 4200, updatedAt: '10/03/2025 às 08:00' },
    holidayOverrides: { cinzas: { enabled: true, effect: 'meia_viagem' } },
    customHolidays: []
  };

  const result = validateAndSanitizeState(v1Backup);
  assert.equal(result.valid, true);
  assert.equal(result.migratedFromV1, true);
  assert.equal(result.sanitized.version, SCHEMA_VERSION);
  assert.equal(result.sanitized.theme, 'dark');
  assert.equal(result.sanitized.palette, 'ardosia');
  assert.equal(result.sanitized.settings.includeTodayInProjection, false);
  assert.equal(result.sanitized.cardBalance.cents, 4200);
  assert.equal(result.sanitized.exceptions['2025-03-10'].note, 'Home office');
  assert.equal(result.sanitized.monthlyRecharges['2025-03'], 18000);
  assert.equal(result.sanitized.finance.income.baseMonthly, 0);
  assert.equal(result.sanitized.finance.income.payDay, 5);
  assert.deepEqual(result.sanitized.finance.caixinhas.boxes, []);
});

test('validateAndSanitizeState migra legado salaryDepositedByMonth para baseReceivedByMonth', () => {
  const raw = createDefaultState();
  raw.finance.salaryDepositedByMonth = { '2026-10': true, '2026-11': true };
  raw.finance.income.baseReceivedByMonth = { '2026-11': false };

  const result = validateAndSanitizeState(raw);
  assert.equal(result.valid, true);
  assert.equal(result.sanitized.finance.income.baseReceivedByMonth['2026-10'], true);
  // Valor explícito já existente em baseReceivedByMonth não é sobrescrito pelo legado
  assert.equal(result.sanitized.finance.income.baseReceivedByMonth['2026-11'], false);
});

test('validateAndSanitizeState neutraliza XSS em IDs, bloqueia __proto__ e rejeita meses YYYY-13/00', () => {
  const payload = {
    version: 2,
    fareSchedules: [
      {
        id: '"><img src=x onerror=alert(1)>',
        effectiveDate: '2026-06-01',
        label: 'Reajuste',
        weekdays: [0, 1000, 1000, 1000, 1000, 1000, 0]
      },
      {
        id: 'sched_base',
        effectiveDate: '2026-01-01',
        label: 'Inicial',
        weekdays: [0, 940, 940, 940, 940, 940, 0]
      }
    ],
    holidayOverrides: JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":{"enabled":true},"desconhecido":{"enabled":true},"tiradentes":{"enabled":false}}'
    ),
    monthlyRecharges: { '2026-00': 100, '2026-13': 100, '2026-11': 5000 },
    customHolidays: [
      { id: '" onmouseover="alert(1)', name: 'Recesso', startDate: '2026-12-26', endDate: '2026-12-31' }
    ],
    finance: {
      income: {
        baseMonthly: 300000,
        extras: [{ id: 'inc"xss', date: '2026-11-12', description: 'Bônus', amount: 15000 }]
      },
      expenses: {
        fixed: [
          {
            id: 'fix<xss>',
            name: 'Aluguel',
            amount: 120000,
            dueDay: 99,
            category: 'inexistente',
            startMonth: '2026-13',
            paidByMonth: { '2026-00': true, '2026-13': true, '2026-11': true }
          }
        ],
        installments: [
          { id: 'inst_bad_month', name: 'TV', installmentAmount: 10000, totalInstallments: 999, startMonth: '2026-13', dueDay: 10 },
          { id: 'inst"xss', name: 'Notebook', installmentAmount: 25000, totalInstallments: 500, startMonth: '2026-11', dueDay: 0 }
        ],
        variable: [{ id: 'var\'xss', date: '2026-11-05', description: 'Almoço', amount: 3500, category: 'alimentacao' }],
        creditCardBills: {
          '2026-13': { amount: 5000 },
          '2026-11': { amount: 45000, dueDay: 15 }
        }
      },
      caixinhas: {
        cdiAnnualRate: 10.65,
        boxes: [
          {
            id: 'box"xss',
            name: 'Reserva',
            kind: 'reserve',
            cdiPercent: 100,
            transactions: [{ id: 'tx"xss', date: '2026-11-01', type: 'deposit', amount: 10000 }]
          }
        ]
      }
    }
  };

  const result = validateAndSanitizeState(payload);
  assert.equal(result.valid, true);
  const s = result.sanitized;
  const safeIdRe = /^[a-zA-Z0-9_-]{1,64}$/;

  // Ordenação automática das vigências por effectiveDate crescente
  assert.equal(s.fareSchedules[0].effectiveDate, '2026-01-01');
  assert.equal(s.fareSchedules[1].effectiveDate, '2026-06-01');
  assert.match(s.fareSchedules[1].id, safeIdRe);

  // Todos os IDs maliciosos foram substituídos por IDs seguros
  assert.match(s.customHolidays[0].id, safeIdRe);
  assert.match(s.finance.income.extras[0].id, safeIdRe);
  assert.match(s.finance.expenses.fixed[0].id, safeIdRe);
  assert.match(s.finance.expenses.installments[0].id, safeIdRe);
  assert.match(s.finance.expenses.variable[0].id, safeIdRe);
  assert.match(s.finance.caixinhas.boxes[0].id, safeIdRe);
  assert.match(s.finance.caixinhas.boxes[0].transactions[0].id, safeIdRe);

  // holidayOverrides contém apenas chaves oficiais, sem prototype pollution
  assert.deepEqual(Object.keys(s.holidayOverrides), ['tiradentes']);
  assert.equal(({}).polluted, undefined);

  // Validação estrita de competências YYYY-MM (01..12) e limites
  assert.deepEqual(Object.keys(s.monthlyRecharges), ['2026-11']);
  assert.deepEqual(Object.keys(s.finance.expenses.creditCardBills), ['2026-11']);
  assert.deepEqual(Object.keys(s.finance.expenses.fixed[0].paidByMonth), ['2026-11']);
  assert.equal(s.finance.expenses.fixed[0].dueDay, 31);
  assert.equal(s.finance.expenses.fixed[0].category, 'outros');
  assert.equal(s.finance.expenses.installments.length, 1);
  assert.equal(s.finance.expenses.installments[0].totalInstallments, 360);
  assert.equal(s.finance.expenses.installments[0].dueDay, 1);
});

test('validateAndSanitizeState rejeita estruturas inválidas ou versão futura', () => {
  assert.equal(validateAndSanitizeState(null).valid, false);
  assert.equal(validateAndSanitizeState([]).valid, false);
  assert.equal(validateAndSanitizeState({ version: 99, fareSchedules: [] }).valid, false);
  assert.equal(validateAndSanitizeState({ version: 2, fareSchedules: [] }).valid, false);
  assert.equal(
    validateAndSanitizeState({
      version: 2,
      fareSchedules: [{ effectiveDate: '2026-02-30', weekdays: [0, 0, 0, 0, 0, 0, 0] }]
    }).valid,
    false
  );
});
