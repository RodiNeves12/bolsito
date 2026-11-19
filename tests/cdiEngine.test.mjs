import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BUSINESS_DAYS_PER_YEAR,
  calculateAllCaixinhas,
  calculateBoxPerformance,
  calculateBoxProjection,
  getDailyCdiRate
} from '../js/cdiEngine.js';
import { createDefaultState } from '../js/state.js';

test('getDailyCdiRate segue fórmula composta padrão 252 dias úteis/ano', () => {
  const rate100 = getDailyCdiRate(10.65, 100);
  const compoundedAnnual = Math.pow(1 + rate100, BUSINESS_DAYS_PER_YEAR) - 1;
  assert.ok(Math.abs(compoundedAnnual - 0.1065) < 1e-10);

  const rate120 = getDailyCdiRate(10.65, 120);
  assert.ok(Math.abs(rate120 - rate100 * 1.2) < 1e-12);

  assert.equal(getDailyCdiRate(0, 100), 0);
  assert.equal(getDailyCdiRate(10.65, 0), 0);
  assert.equal(getDailyCdiRate(-5, 100), 0);
});

test('calculateBoxProjection projeta 1m, 6m e 12m com e sem aporte mensal', () => {
  const noContrib = calculateBoxProjection(100000, 10.65, 100, 0, '2026-11-19');
  assert.equal(noContrib.series12Months.length, 13);
  assert.equal(noContrib.series12Months[0].label, 'Hoje');
  assert.equal(noContrib.month12.businessDays, 252);
  // R$ 1.000,00 a 10,65% a.a. em 252 d.u. -> R$ 1.106,50 (110650 centavos)
  assert.equal(noContrib.month12.balanceCents, 110650);
  assert.equal(noContrib.month12.projectedYieldCents, 10650);

  const withContrib = calculateBoxProjection(100000, 10.65, 100, 50000, '2026-11-19');
  assert.equal(withContrib.month12.totalContributedCents, 100000 + 12 * 50000);
  assert.ok(withContrib.month12.projectedYieldCents > noContrib.month12.projectedYieldCents);
});

test('calculateBoxPerformance rende apenas em dias úteis bancários, trata resgate proporcional, futuras e >20 anos', () => {
  // Depósito em 2026-04-20 (segunda).
  // 2026-04-21 é Tiradentes (feriado nacional -> NÃO rende).
  // 2026-04-22 (quarta -> rende 1 d.u.).
  // 2026-04-23 é São Jorge RJ (dia útil bancário nacional -> rende 2º d.u.).
  // 2026-04-24 (sexta -> rende 3º d.u.).
  // 2026-04-25/26 (sáb/dom -> NÃO rendem).
  const box = {
    id: 'box_1',
    name: 'Reserva Emergência',
    kind: 'reserve',
    cdiPercent: 100,
    goalAmount: 200000,
    transactions: [
      { id: 'tx_1', date: '2026-04-20', type: 'deposit', amount: 100000 }
    ]
  };

  const perf = calculateBoxPerformance(box, 10.65, { holidayOverrides: { tiradentes: { enabled: false } } }, {
    asOfDate: '2026-04-26',
    targetYM: '2026-04'
  });

  assert.equal(perf.businessDaysWithYield, 3);
  assert.equal(perf.principalCents, 100000);
  assert.ok(perf.yieldCents > 0);
  assert.equal(perf.currentBalanceCents, perf.principalCents + perf.yieldCents);
  assert.equal(perf.goalProgressPct, 50);

  // Resgate parcial de R$ 500,00 reduz principal e rendimento proporcionalmente
  const boxWithdraw = {
    ...box,
    transactions: [
      { id: 'tx_1', date: '2026-04-20', type: 'deposit', amount: 100000 },
      { id: 'tx_2', date: '2026-04-24', type: 'withdraw', amount: 50000 }
    ]
  };
  const perfW = calculateBoxPerformance(boxWithdraw, 10.65, {}, { asOfDate: '2026-04-26' });
  assert.ok(perfW.principalCents > 50000 && perfW.principalCents < 50100);
  assert.ok(perfW.yieldCents > 0 && perfW.yieldCents < perf.yieldCents);
  assert.equal(perfW.currentBalanceCents, perfW.principalCents + perfW.yieldCents);

  // Resgate total (acima do saldo) zera saldo e principal sem ficar negativo
  const boxFullWithdraw = {
    ...box,
    transactions: [
      { id: 'tx_1', date: '2026-04-20', type: 'deposit', amount: 100000 },
      { id: 'tx_2', date: '2026-04-24', type: 'withdraw', amount: 200000 }
    ]
  };
  const perfZero = calculateBoxPerformance(boxFullWithdraw, 10.65, {}, { asOfDate: '2026-04-26' });
  assert.equal(perfZero.currentBalanceCents, 0);
  assert.equal(perfZero.principalCents, 0);
  assert.equal(perfZero.yieldCents, 0);

  // Transação futura marcada como isFuture e excluída do saldo atual + transação >20 anos preservada
  const boxEdge = {
    id: 'box_edge',
    name: 'Longa',
    kind: 'reserve',
    cdiPercent: 100,
    goalAmount: null,
    transactions: [
      { id: 'tx_old', date: '2000-01-01', type: 'deposit', amount: 10000 },
      { id: 'tx_fut', date: '2027-01-10', type: 'deposit', amount: 90000 }
    ]
  };
  const perfEdge = calculateBoxPerformance(boxEdge, 10.65, {}, { asOfDate: '2026-11-19' });
  assert.equal(perfEdge.truncatedHistory, true);
  assert.equal(perfEdge.totalDepositedCents, 10000);
  assert.ok(perfEdge.currentBalanceCents > 10000);
  assert.equal(perfEdge.transactionsDesc.find((t) => t.id === 'tx_fut').isFuture, true);
  assert.equal(perfEdge.transactionsDesc.find((t) => t.id === 'tx_old').isFuture, false);
});

test('calculateAllCaixinhas separa subtotais e projeções de reserve vs daily', () => {
  const state = createDefaultState();
  state.finance.caixinhas.cdiAnnualRate = 10.65;
  state.finance.caixinhas.boxes = [
    {
      id: 'box_res',
      name: 'Reserva',
      kind: 'reserve',
      cdiPercent: 100,
      goalAmount: 500000,
      transactions: [{ id: 't1', date: '2026-11-10', type: 'deposit', amount: 200000 }]
    },
    {
      id: 'box_day',
      name: 'Conta Diária',
      kind: 'daily',
      cdiPercent: 100,
      goalAmount: null,
      transactions: [{ id: 't2', date: '2026-11-10', type: 'deposit', amount: 50000 }]
    }
  ];

  const summary = calculateAllCaixinhas(state, { asOfDate: '2026-11-19', targetYM: '2026-11' });
  assert.equal(summary.reserveCount, 1);
  assert.equal(summary.dailyCount, 1);
  assert.equal(summary.totalBalanceCents, summary.reserveBalanceCents + summary.dailyBalanceCents);
  assert.ok(summary.projectionsAll.baseBalanceCents > summary.projectionsReserve.baseBalanceCents);
  assert.equal(summary.projectionsReserve.baseBalanceCents, summary.reserveBalanceCents);
});
