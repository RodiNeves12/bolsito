import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addDaysStr,
  buildDateForYearMonth,
  BUILT_IN_HOLIDAY_KEYS,
  diffDaysInclusive,
  formatDisplayDate,
  formatShortDayMonth,
  getActiveHolidayForDate,
  getBuiltInHolidaysForYear,
  getEasterDate,
  isNationalBusinessDay,
  isValidDateStr
} from '../js/holidays.js';

test('utilitários de data local validam bissextos, somas e competências sem deslocamento UTC', () => {
  assert.equal(isValidDateStr('2024-02-29'), true);
  assert.equal(isValidDateStr('2026-02-29'), false);
  assert.equal(isValidDateStr('2026-13-01'), false);
  assert.equal(isValidDateStr('2026-00-10'), false);
  assert.equal(isValidDateStr('not-a-date'), false);

  assert.equal(addDaysStr('2024-02-28', 1), '2024-02-29');
  assert.equal(addDaysStr('2026-02-28', 1), '2026-03-01');
  assert.equal(addDaysStr('2026-12-31', 1), '2027-01-01');
  assert.equal(addDaysStr('2026-01-01', -1), '2025-12-31');

  assert.equal(diffDaysInclusive('2026-11-01', '2026-11-01'), 1);
  assert.equal(diffDaysInclusive('2026-11-01', '2026-11-10'), 10);

  assert.equal(buildDateForYearMonth('2026-02', 31, false), '2026-02-28');
  assert.equal(buildDateForYearMonth('2024-02', 31, false), '2024-02-29');
  assert.equal(buildDateForYearMonth('2026-12', 10, true), '2027-01-10');
  assert.equal(formatDisplayDate('2026-11-19'), '19/11/2026');
  assert.equal(formatShortDayMonth('2026-11-19'), '19/11');
});

test('getEasterDate calcula corretamente a Páscoa para múltiplos anos', () => {
  assert.equal(getEasterDate(2024), '2024-03-31');
  assert.equal(getEasterDate(2025), '2025-04-20');
  assert.equal(getEasterDate(2026), '2026-04-05');
  assert.equal(getEasterDate(2027), '2027-03-28');
  assert.equal(getEasterDate(2028), '2028-04-16');
});

test('getBuiltInHolidaysForYear gera catálogo completo (Brasil + RJ) alinhado com BUILT_IN_HOLIDAY_KEYS', () => {
  const list2026 = getBuiltInHolidaysForYear(2026);
  assert.equal(list2026.length, BUILT_IN_HOLIDAY_KEYS.size);

  const byKey = new Map(list2026.map((h) => [h.key, h]));
  for (const key of byKey.keys()) {
    assert.equal(BUILT_IN_HOLIDAY_KEYS.has(key), true);
  }

  // Datas móveis derivadas da Páscoa de 2026 (05/04/2026)
  assert.equal(byKey.get('carnaval_seg').date, '2026-02-16');
  assert.equal(byKey.get('carnaval_ter').date, '2026-02-17');
  assert.equal(byKey.get('cinzas').date, '2026-02-18');
  assert.equal(byKey.get('cinzas').enabled, false);
  assert.equal(byKey.get('cinzas').effect, 'meia_viagem');
  assert.equal(byKey.get('sexta_santa').date, '2026-04-03');
  assert.equal(byKey.get('corpus_christi').date, '2026-06-04');
  assert.equal(byKey.get('consciencia_negra').date, '2026-11-20');
});

test('getActiveHolidayForDate combina feriados embutidos e recessos manuais priorizando efeito zero', () => {
  const state = {
    holidayOverrides: {
      cinzas: { enabled: true, effect: 'meia_viagem' }
    },
    customHolidays: [
      {
        id: 'hol_recesso',
        name: 'Recesso de Fim de Ano',
        startDate: '2026-12-24',
        endDate: '2027-01-02',
        enabled: true,
        category: 'Recesso',
        effect: 'zero'
      },
      {
        id: 'hol_emenda',
        name: 'Dispensa Cinzas',
        startDate: '2026-02-18',
        endDate: '2026-02-18',
        enabled: true,
        category: 'Emenda',
        effect: 'zero'
      }
    ]
  };

  const cache = new Map();
  // Quarta de Cinzas (meia_viagem) + Emenda (zero) -> efeito final deve ser 'zero' e nomes combinados
  const cinzas = getActiveHolidayForDate('2026-02-18', state, cache);
  assert.ok(cinzas);
  assert.equal(cinzas.effect, 'zero');
  assert.match(cinzas.name, /Quarta-feira de Cinzas \/ Dispensa Cinzas/);

  // Recesso cruzando virada de ano (2026 -> 2027)
  const dec31 = getActiveHolidayForDate('2026-12-31', state, cache);
  const jan02 = getActiveHolidayForDate('2027-01-02', state, cache);
  assert.equal(dec31?.name, 'Recesso de Fim de Ano');
  assert.equal(jan02?.name, 'Recesso de Fim de Ano');
});

test('isNationalBusinessDay segue calendário bancário oficial e ignora holidayOverrides de transporte', () => {
  const stateWithDisabledNational = {
    holidayOverrides: {
      tiradentes: { enabled: false },
      corpus_christi: { enabled: false }
    }
  };

  // Finais de semana nunca são dias úteis
  assert.equal(isNationalBusinessDay('2026-11-21', stateWithDisabledNational), false); // Sábado
  assert.equal(isNationalBusinessDay('2026-11-22', stateWithDisabledNational), false); // Domingo

  // Feriados nacionais continuam NÃO sendo dias úteis bancários mesmo desligados em Passagens
  assert.equal(isNationalBusinessDay('2026-04-21', stateWithDisabledNational), false); // Tiradentes (terça)
  assert.equal(isNationalBusinessDay('2026-06-04', stateWithDisabledNational), false); // Corpus Christi (quinta)
  assert.equal(isNationalBusinessDay('2026-11-20', stateWithDisabledNational), false); // Consciência Negra (sexta)

  // Feriados estaduais/municipais RJ e Quarta de Cinzas SÃO dias úteis bancários nacionais
  assert.equal(isNationalBusinessDay('2026-01-20', stateWithDisabledNational), true); // São Sebastião (terça)
  assert.equal(isNationalBusinessDay('2026-04-23', stateWithDisabledNational), true); // São Jorge (quinta)
  assert.equal(isNationalBusinessDay('2026-02-18', stateWithDisabledNational), true); // Cinzas (quarta)
});
