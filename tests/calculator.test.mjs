import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCompensationChain,
  calculateCardProjection,
  calculateDay,
  calculateMonth,
  calculateRangeSummary,
  calculateYearSummary,
  getActiveFareSchedule
} from '../js/calculator.js';
import { createDefaultState } from '../js/state.js';

function makeBaseState(overrides = {}) {
  const base = createDefaultState();
  base.fareSchedules = [
    {
      id: 'sched_1',
      effectiveDate: '2026-01-01',
      label: 'Tarifa Base',
      weekdays: [0, 1000, 1000, 1000, 1000, 1000, 0] // R$ 10,00 seg-sex
    }
  ];
  return { ...base, ...overrides };
}

test('getActiveFareSchedule aplica vigência correta antes e depois de reajuste no meio do ano', () => {
  const schedules = [
    { id: 's2', effectiveDate: '2026-07-01', label: 'Reajuste Julho', weekdays: [0, 1200, 1200, 1200, 1200, 1200, 0] },
    { id: 's1', effectiveDate: '2026-01-01', label: 'Inicial', weekdays: [0, 1000, 1000, 1000, 1000, 1000, 0] }
  ];

  assert.equal(getActiveFareSchedule('2025-12-15', schedules).id, 's1'); // fallback para primeira tabela
  assert.equal(getActiveFareSchedule('2026-06-30', schedules).id, 's1');
  assert.equal(getActiveFareSchedule('2026-07-01', schedules).id, 's2');
  assert.equal(getActiveFareSchedule('2026-11-19', schedules).id, 's2');
});

test('calculateDay respeita precedência estrita: Exceção > Feriado > Grade Semanal', () => {
  const state = makeBaseState({
    exceptions: {
      '2026-04-20': { type: 'nao_gastei' }, // segunda comum
      '2026-04-22': { type: 'meia_viagem' }, // quarta comum
      '2026-04-24': { type: 'valor_personalizado', customCents: 1550 }, // sexta comum
      '2026-04-21': { type: 'forcar_normal' } // Tiradentes (feriado nacional terça)
    }
  });

  // 1. Dia útil normal (quinta 2026-04-16)
  const normal = calculateDay('2026-04-16', state);
  assert.equal(normal.status, 'normal');
  assert.equal(normal.effectiveCents, 1000);

  // 2. Fim de semana (sábado 2026-04-18)
  const weekend = calculateDay('2026-04-18', state);
  assert.equal(weekend.status, 'sem_tarifa');
  assert.equal(weekend.effectiveCents, 0);

  // 3. Feriado sem exceção (São Jorge 2026-04-23, quinta)
  const holiday = calculateDay('2026-04-23', state);
  assert.equal(holiday.status, 'feriado');
  assert.equal(holiday.effectiveCents, 0);
  assert.equal(holiday.holidaySavingsCents, 1000);

  // 4. Exceções manuais
  const zero = calculateDay('2026-04-20', state);
  assert.equal(zero.effectiveCents, 0);
  assert.equal(zero.manualSavingsCents, 1000);

  const half = calculateDay('2026-04-22', state);
  assert.equal(half.effectiveCents, 500);
  assert.equal(half.manualSavingsCents, 500);

  const custom = calculateDay('2026-04-24', state);
  assert.equal(custom.effectiveCents, 1550);
  assert.equal(custom.manualExtraCents, 550);

  // 5. Forçar normal em feriado anula economia de feriado e registra extra manual
  const forced = calculateDay('2026-04-21', state);
  assert.equal(forced.status, 'forcar_normal');
  assert.equal(forced.effectiveCents, 1000);
  assert.equal(forced.holidaySavingsCents, 0);
  assert.equal(forced.manualExtraCents, 1000);
});

test('buildCompensationChain transfere sobra de economia manual e déficit de recarga mês a mês', () => {
  const state = makeBaseState({
    exceptions: {
      // Dois dias úteis não gastos em Jan/2026 (economia manual de R$ 20,00)
      '2026-01-05': { type: 'nao_gastei' },
      '2026-01-06': { type: 'nao_gastei' }
    },
    monthlyRecharges: {
      // Em Mar/2026 recarrega R$ 10,00 a menos do que o gasto real -> déficit para Abr/2026
    }
  });

  const jan = calculateMonth(2026, 1, state);
  assert.equal(jan.manualSavingsCents, 2000);
  assert.equal(jan.carryOutCents, 2000);

  const feb = calculateMonth(2026, 2, state);
  assert.equal(feb.previousCreditCents, 2000);
  assert.equal(feb.netNeededCents, Math.max(0, feb.actualTotalCents - 2000));

  // Simula recarga efetiva insuficiente em fevereiro (déficit de R$ 15,00)
  state.monthlyRecharges['2026-02'] = Math.max(0, feb.netNeededCents - 1500);
  const chain = buildCompensationChain(2026, 3, state);
  const febAfter = chain.get('2026-02');
  const marAfter = chain.get('2026-03');

  assert.equal(febAfter.carryOutCents, -1500);
  assert.equal(marAfter.previousCreditCents, -1500);
  assert.equal(marAfter.appliedDeficitCents, 1500);
  assert.equal(marAfter.netNeededCents, marAfter.actualTotalCents + 1500);
});

test('calculateYearSummary consolida os 12 meses de forma consistente', () => {
  const state = makeBaseState();
  const summary = calculateYearSummary(2026, state);

  assert.equal(summary.months.length, 12);
  const sumActual = summary.months.reduce((acc, m) => acc + m.actualTotalCents, 0);
  const sumSavings = summary.months.reduce((acc, m) => acc + m.totalSavingsCents, 0);
  assert.equal(summary.totalActualCents, sumActual);
  assert.equal(summary.totalSavingsCents, sumSavings);
  assert.ok(summary.maxMonthActualCents > 0);
});

test('calculateCardProjection calcula recarga, autonomia e limite de 2 anos', () => {
  // Saldo zerado
  const zeroState = makeBaseState({ cardBalance: { cents: 0, updatedAt: null } });
  const projZero = calculateCardProjection(zeroState);
  assert.equal(projZero.coveredActiveDays, 0);
  assert.equal(projZero.rechargeNeededThisMonthCents, projZero.remainingMonthCostCents);
  assert.equal(projZero.projectedMonthEndSurplusCents, 0);

  // Saldo suficiente para exatamente 2 dias ativos + troco de R$ 3,00
  const twoDaysState = makeBaseState({ cardBalance: { cents: 2300, updatedAt: null } });
  const projTwo = calculateCardProjection(twoDaysState);
  assert.equal(projTwo.coveredActiveDays, 2);
  assert.equal(projTwo.leftoverCents, 300);
  assert.equal(projTwo.shortfallOnFirstUncoveredCents, 700);
  assert.equal(projTwo.exceededHorizon, false);

  // Saldo muito alto excede horizonte de 730 dias
  const hugeState = makeBaseState({ cardBalance: { cents: 10000000, updatedAt: null } });
  const projHuge = calculateCardProjection(hugeState);
  assert.equal(projHuge.exceededHorizon, true);
  assert.equal(projHuge.rechargeNeededThisMonthCents, 0);
});

test('calculateRangeSummary normaliza datas invertidas, cruza anos e trunca intervalos > 1100 dias', () => {
  const state = makeBaseState();

  // Datas invertidas são normalizadas automaticamente
  const reversed = calculateRangeSummary('2026-03-10', '2026-03-02', state);
  assert.equal(reversed.startDate, '2026-03-02');
  assert.equal(reversed.endDate, '2026-03-10');
  assert.equal(reversed.totalDays, 9);
  assert.equal(reversed.truncated, false);

  // Intervalo maior que 1100 dias é truncado por segurança
  const huge = calculateRangeSummary('2020-01-01', '2026-01-01', state);
  assert.equal(huge.truncated, true);
  assert.equal(huge.totalDays, 1100);
});
