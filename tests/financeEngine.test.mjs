import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonthsYM,
  calculateConsolidatedNetWorth,
  calculateFinance12Months,
  calculateFinanceMonth,
  diffMonthsYM,
  getInstallmentInfoForMonth,
  parseYM,
  resolveBaseIncomeStatus
} from '../js/financeEngine.js';
import { calculateAllCaixinhas } from '../js/cdiEngine.js';
import { createDefaultState } from '../js/state.js';

test('utilitários de competência mensal (parseYM, addMonthsYM, diffMonthsYM)', () => {
  assert.deepEqual(parseYM('2026-11'), { year: 2026, month: 11 });
  assert.equal(parseYM('2026-00'), null);
  assert.equal(parseYM('2026-13'), null);
  assert.equal(parseYM('invalid'), null);

  assert.equal(addMonthsYM('2026-11', 2), '2027-01');
  assert.equal(addMonthsYM('2026-01', -1), '2025-12');
  assert.equal(diffMonthsYM('2026-01', '2026-11'), 10);
  assert.equal(diffMonthsYM('2026-11', '2026-01'), -10);
});

test('getInstallmentInfoForMonth projeta ciclo de vida completo de parcelamento', () => {
  const inst = {
    id: 'inst_1',
    name: 'Notebook',
    installmentAmount: 50000,
    totalInstallments: 4,
    startMonth: '2026-10',
    dueDay: 10,
    paidByMonth: { '2026-10': true, '2026-11': false }
  };

  assert.equal(getInstallmentInfoForMonth(inst, '2026-09'), null);

  const m1 = getInstallmentInfoForMonth(inst, '2026-10');
  assert.equal(m1.currentNumber, 1);
  assert.equal(m1.paid, true);
  assert.equal(m1.remainingInstallments, 3);
  assert.equal(m1.remainingAmountCents, 150000);
  assert.equal(m1.paidInstallmentsCount, 1);
  assert.equal(m1.paidProgressPct, 25);
  assert.equal(m1.endMonth, '2027-01');

  const m2 = getInstallmentInfoForMonth(inst, '2026-11');
  assert.equal(m2.currentNumber, 2);
  assert.equal(m2.paid, false);
  assert.equal(m2.remainingInstallments, 3); // inclui a atual não paga
  assert.equal(m2.paidInstallmentsCount, 1);
  assert.equal(m2.paidProgressPct, 25);

  assert.equal(getInstallmentInfoForMonth(inst, '2027-02'), null);
});

test('calculateFinanceMonth integra Passagens, contas, cartão, pendências e aportes líquidos', () => {
  const state = createDefaultState();
  state.fareSchedules = [
    { id: 's1', effectiveDate: '2026-01-01', label: 'Base', weekdays: [0, 1000, 1000, 1000, 1000, 1000, 0] }
  ];
  state.finance.income.baseMonthly = 300000; // R$ 3.000
  state.finance.income.baseReceivedByMonth = { '2026-11': false };
  state.finance.income.extras = [
    { id: 'e1', date: '2026-11-10', description: 'Freela', amount: 50000, received: true },
    { id: 'e2', date: '2026-11-25', description: 'Reembolso', amount: 20000, received: false }
  ];
  state.finance.expenses.fixed = [
    { id: 'f1', name: 'Aluguel', amount: 100000, dueDay: 5, category: 'moradia', active: true, startMonth: '2026-01', paidByMonth: { '2026-11': true } },
    { id: 'f2', name: 'Internet', amount: 12000, dueDay: 15, category: 'moradia', active: true, startMonth: '2026-01', paidByMonth: {} },
    { id: 'f3', name: 'Inativa', amount: 99999, dueDay: 1, category: 'outros', active: false, startMonth: '2026-01', paidByMonth: {} },
    { id: 'f4', name: 'Futura', amount: 88888, dueDay: 1, category: 'outros', active: true, startMonth: '2026-12', paidByMonth: {} }
  ];
  state.finance.expenses.installments = [
    { id: 'i1', name: 'Celular', totalAmount: 120000, installmentAmount: 20000, totalInstallments: 6, startMonth: '2026-10', dueDay: 20, category: 'compras', paidByMonth: {} }
  ];
  state.finance.expenses.variable = [
    { id: 'v1', date: '2026-11-08', description: 'Mercado', amount: 30000, category: 'alimentacao' }
  ];
  state.finance.expenses.creditCardBills = {
    '2026-11': { amount: 40000, dueDate: '2026-11-18', dueDay: 18, paid: false, cardName: 'Nubank' }
  };
  state.finance.caixinhas.boxes = [
    {
      id: 'b_res',
      name: 'Reserva',
      kind: 'reserve',
      cdiPercent: 100,
      goalAmount: null,
      transactions: [
        { id: 't1', date: '2026-11-05', type: 'deposit', amount: 80000 },
        { id: 't2', date: '2026-11-12', type: 'withdraw', amount: 25000 },
        { id: 't3', date: '2026-11-15', type: 'deposit', amount: 10000, isAdjustment: true } // ignorado em aportes
      ]
    },
    {
      id: 'b_day',
      name: 'Diária',
      kind: 'daily',
      cdiPercent: 100,
      goalAmount: null,
      transactions: [
        { id: 't4', date: '2026-11-05', type: 'deposit', amount: 50000 } // conta daily ignorada em aportes
      ]
    }
  ];

  const fm = calculateFinanceMonth(2026, 11, state);

  // Rendas
  assert.equal(fm.totalIncomeCents, 370000);
  assert.equal(fm.receivedIncomeCents, 50000);
  assert.equal(fm.receivableIncomeCents, 320000);

  // Integração somente-leitura com Passagens
  assert.equal(fm.transportItem.readOnly, true);
  assert.ok(fm.transportExpensesCents > 0);

  // Despesas ativas (exclui f3 inativa e f4 futura)
  assert.equal(fm.fixedItems.length, 2);
  assert.equal(fm.fixedExpensesCents, 112000);
  assert.equal(fm.installmentsExpensesCents, 20000);
  assert.equal(fm.variableExpensesCents, 30000);
  assert.equal(fm.creditCardExpensesCents, 40000);
  assert.equal(
    fm.totalExpensesCents,
    fm.transportExpensesCents + 112000 + 20000 + 30000 + 40000
  );

  // Pendências ordenadas por data: Internet (15) -> Nubank (18) -> Celular (20)
  assert.equal(fm.pendingExpensesCents, 12000 + 40000 + 20000);
  assert.deepEqual(
    fm.pendingItems.map((p) => p.name),
    ['Internet', 'Nubank', 'Celular']
  );

  // Aportes líquidos nas reservas (80000 - 25000 = 55000, ignorando ajuste e conta daily)
  assert.equal(fm.monthDepositsCents, 80000);
  assert.equal(fm.monthWithdrawsCents, 25000);
  assert.equal(fm.monthNetContributionCents, 55000);

  // Total Líquido Consolidado = Total Real Hoje + A Receber - Pendências
  const caixinhasSummary = calculateAllCaixinhas(state, { asOfDate: '2026-11-19', targetYM: '2026-11' });
  const netWorth = calculateConsolidatedNetWorth(fm, caixinhasSummary);
  assert.equal(
    netWorth.netTotalCents,
    caixinhasSummary.totalBalanceCents + fm.receivableIncomeCents - fm.pendingExpensesCents
  );

  // Evolução 12 meses utiliza aporte líquido (55000) em 2026-11
  const fin12 = calculateFinance12Months(2026, 11, state);
  assert.equal(fin12.months.length, 12);
  assert.equal(fin12.months[11].ym, '2026-11');
  assert.equal(fin12.months[11].contributionsCents, 55000);
});

test('resolveBaseIncomeStatus aplica regra automática por payDay, clamp de fevereiro e respeita override manual', () => {
  const income = { baseMonthly: 200000, payDay: 5, baseReceivedByMonth: {} };

  // Mês anterior ao atual -> Recebida automaticamente
  assert.deepEqual(resolveBaseIncomeStatus('2026-10', income, '2026-11-02'), {
    received: true,
    isAuto: true,
    payDay: 5
  });

  // Mês futuro -> A receber automaticamente
  assert.deepEqual(resolveBaseIncomeStatus('2026-12', income, '2026-11-25'), {
    received: false,
    isAuto: true,
    payDay: 5
  });

  // Mês atual antes do dia 5 -> A receber; no dia 5 -> Recebida
  assert.equal(resolveBaseIncomeStatus('2026-11', income, '2026-11-04').received, false);
  assert.equal(resolveBaseIncomeStatus('2026-11', income, '2026-11-05').received, true);
  assert.equal(resolveBaseIncomeStatus('2026-11', income, '2026-11-19').isAuto, true);

  // Clamp de dia 31 em fevereiro não bissexto (28)
  const income31 = { baseMonthly: 200000, payDay: 31, baseReceivedByMonth: {} };
  assert.equal(resolveBaseIncomeStatus('2026-02', income31, '2026-02-27').received, false);
  assert.equal(resolveBaseIncomeStatus('2026-02', income31, '2026-02-28').received, true);

  // Override manual explícito sempre prevalece (tanto true quanto false)
  const incomeManual = {
    baseMonthly: 200000,
    payDay: 5,
    baseReceivedByMonth: { '2026-10': false, '2026-12': true }
  };
  assert.deepEqual(resolveBaseIncomeStatus('2026-10', incomeManual, '2026-11-19'), {
    received: false,
    isAuto: false,
    payDay: 5
  });
  assert.deepEqual(resolveBaseIncomeStatus('2026-12', incomeManual, '2026-11-19'), {
    received: true,
    isAuto: false,
    payDay: 5
  });
});

test('calculateFinanceMonth sugere vencimento da fatura no mesmo mês usando dueDay padrão', () => {
  const state = createDefaultState();
  state.finance.expenses.creditCardDefaults = { dueDay: 6, cardName: 'Nubank' };

  const dec = calculateFinanceMonth(2026, 12, state, { todayStr: '2026-11-19' });
  assert.equal(dec.creditCardBill.hasBill, false);
  assert.equal(dec.creditCardBill.dueDate, '2026-12-06');
  assert.equal(dec.creditCardBill.dueDay, 6);
  assert.equal(dec.creditCardBill.cardName, 'Nubank');
});
