/**
 * Regras de Negócio e Motor de Cálculos da Calculadora de Passagens.
 *
 * Princípios:
 * - Todos os valores monetários são manipulados em CENTAVOS (inteiros) para eliminar
 *   erros de ponto flutuante (IEEE 754).
 * - Todas as datas são strings locais 'YYYY-MM-DD' manipuladas sem UTC.
 */

import {
  addDaysStr,
  diffDaysInclusive,
  formatLocalDate,
  getActiveHolidayForDate,
  getDayOfWeek,
  getDaysInMonth,
  getTodayStr,
  getYearMonthKey,
  splitDateStr
} from './holidays.js';
import { sortFareSchedules } from './state.js';

/**
 * Encontra a vigência de tarifa aplicável para uma data 'YYYY-MM-DD'.
 * Aplica a tabela com maior effectiveDate <= dateStr.
 * Caso dateStr seja anterior à primeira vigência cadastrada, usa a primeira tabela disponível.
 */
export function getActiveFareSchedule(dateStr, fareSchedules) {
  if (!Array.isArray(fareSchedules) || fareSchedules.length === 0) {
    return null;
  }
  const sorted = sortFareSchedules(fareSchedules);
  let active = sorted[0];
  for (const sched of sorted) {
    if (sched.effectiveDate <= dateStr) {
      active = sched;
    } else {
      break;
    }
  }
  return active;
}

/**
 * Calcula o valor efetivo e metadados de um único dia 'YYYY-MM-DD'.
 *
 * Precedência estrita:
 * 1. Exceção manual na data D:
 *    - nao_gastei          -> R$ 0,00
 *    - meia_viagem         -> 50% do valor base vigente naquele dia da semana
 *    - valor_personalizado -> valor digitado manualmente
 *    - forcar_normal       -> força o valor base vigente mesmo em feriado
 * 2. Feriado ativo na data D -> R$ 0,00 (ou 50% se configurado como meia_viagem, ex.: Cinzas)
 * 3. Grade semanal vigente na data D -> valor configurado para o dia da semana
 */
export function calculateDay(dateStr, state, holidayYearCache = null) {
  const dayOfWeek = getDayOfWeek(dateStr);
  const schedule = getActiveFareSchedule(dateStr, state.fareSchedules);
  const scheduledBaseCents = schedule ? (schedule.weekdays[dayOfWeek] || 0) : 0;

  const holiday = getActiveHolidayForDate(dateStr, state, holidayYearCache);
  const exception = state.exceptions ? state.exceptions[dateStr] || null : null;

  // Previsto base da data (grade semanal descontando apenas feriados ativos)
  let predictedBaseCents = scheduledBaseCents;
  let holidaySavingsCents = 0;

  if (holiday) {
    if (holiday.effect === 'meia_viagem') {
      predictedBaseCents = Math.round(scheduledBaseCents / 2);
      holidaySavingsCents = Math.max(0, scheduledBaseCents - predictedBaseCents);
    } else {
      predictedBaseCents = 0;
      holidaySavingsCents = scheduledBaseCents;
    }
  }

  // Cálculo do valor efetivo respeitando a precedência 1 > 2 > 3
  let effectiveCents = scheduledBaseCents;
  let status = scheduledBaseCents > 0 ? 'normal' : 'sem_tarifa';

  if (exception) {
    switch (exception.type) {
      case 'nao_gastei':
        effectiveCents = 0;
        status = 'nao_gastei';
        break;
      case 'meia_viagem':
        effectiveCents = Math.round(scheduledBaseCents / 2);
        status = 'meia_viagem';
        break;
      case 'valor_personalizado':
        effectiveCents = Math.max(0, Math.round(exception.customCents || 0));
        status = 'valor_personalizado';
        break;
      case 'forcar_normal':
        effectiveCents = scheduledBaseCents;
        status = 'forcar_normal';
        break;
      default:
        effectiveCents = predictedBaseCents;
        status = holiday ? 'feriado' : (scheduledBaseCents > 0 ? 'normal' : 'sem_tarifa');
    }
  } else if (holiday) {
    effectiveCents = predictedBaseCents;
    status = holiday.effect === 'meia_viagem' ? 'feriado_meia' : 'feriado';
  }

  // Se o usuário forçou normal em um feriado, não houve economia efetiva de feriado neste dia
  const effectiveHolidaySavingsCents =
    exception && exception.type === 'forcar_normal' ? 0 : holidaySavingsCents;

  // Diferença manual em relação ao previsto base do mês
  const manualDiffCents = predictedBaseCents - effectiveCents;
  const manualSavingsCents = manualDiffCents > 0 ? manualDiffCents : 0;
  const manualExtraCents = manualDiffCents < 0 ? -manualDiffCents : 0;

  return {
    dateStr,
    dayOfWeek,
    schedule,
    scheduledBaseCents,
    predictedBaseCents,
    effectiveCents,
    holiday,
    exception,
    status,
    holidaySavingsCents: effectiveHolidaySavingsCents,
    manualSavingsCents,
    manualExtraCents
  };
}

/**
 * Calcula todos os dias e totalizadores brutos de um mês específico (sem encadeamento).
 */
export function calculateMonthRaw(year, month, state, holidayYearCache = null) {
  const daysCount = getDaysInMonth(year, month);
  const ym = getYearMonthKey(year, month);
  const todayStr = getTodayStr();
  const includeToday = state.settings?.includeTodayInProjection !== false;
  const projectionStartStr = includeToday ? todayStr : addDaysStr(todayStr, 1);

  const days = [];
  let grossScheduledCents = 0;
  let predictedBaseCents = 0;
  let actualTotalCents = 0;
  let holidaySavingsCents = 0;
  let manualSavingsCents = 0;
  let manualExtraCents = 0;

  let activeDaysCount = 0;
  let remainingActiveDaysCount = 0;
  let remainingCostCents = 0;
  let holidayDaysCount = 0;
  let zeroedManualDaysCount = 0;
  let halfDaysCount = 0;
  let customDaysCount = 0;
  let forcedDaysCount = 0;

  for (let d = 1; d <= daysCount; d++) {
    const dateStr = formatLocalDate(year, month, d);
    const dayCalc = calculateDay(dateStr, state, holidayYearCache);
    days.push(dayCalc);

    grossScheduledCents += dayCalc.scheduledBaseCents;
    predictedBaseCents += dayCalc.predictedBaseCents;
    actualTotalCents += dayCalc.effectiveCents;
    holidaySavingsCents += dayCalc.holidaySavingsCents;
    manualSavingsCents += dayCalc.manualSavingsCents;
    manualExtraCents += dayCalc.manualExtraCents;

    if (dayCalc.effectiveCents > 0) {
      activeDaysCount++;
      if (dateStr >= projectionStartStr) {
        remainingActiveDaysCount++;
        remainingCostCents += dayCalc.effectiveCents;
      }
    }

    if (dayCalc.status === 'feriado' || dayCalc.status === 'feriado_meia') {
      holidayDaysCount++;
    } else if (dayCalc.status === 'nao_gastei') {
      zeroedManualDaysCount++;
    } else if (dayCalc.status === 'meia_viagem') {
      halfDaysCount++;
    } else if (dayCalc.status === 'valor_personalizado') {
      customDaysCount++;
    } else if (dayCalc.status === 'forcar_normal') {
      forcedDaysCount++;
    }
  }

  // Média real por dia ativo e média semanal proporcional ao número de dias do mês
  const avgPerActiveDayCents =
    activeDaysCount > 0 ? Math.round(actualTotalCents / activeDaysCount) : 0;
  const weeksInMonth = daysCount / 7;
  const avgPerWeekCents = Math.round(actualTotalCents / weeksInMonth);

  const recordedRechargeCents =
    state.monthlyRecharges && typeof state.monthlyRecharges[ym] === 'number'
      ? state.monthlyRecharges[ym]
      : null;

  return {
    year,
    month,
    ym,
    daysCount,
    days,
    grossScheduledCents,
    predictedBaseCents,
    actualTotalCents,
    holidaySavingsCents,
    manualSavingsCents,
    manualExtraCents,
    totalSavingsCents: holidaySavingsCents + manualSavingsCents,
    activeDaysCount,
    remainingActiveDaysCount,
    remainingCostCents,
    holidayDaysCount,
    zeroedManualDaysCount,
    halfDaysCount,
    customDaysCount,
    forcedDaysCount,
    avgPerActiveDayCents,
    avgPerWeekCents,
    recordedRechargeCents
  };
}

/**
 * Descobre o menor ano relevante para iniciar a cadeia de compensação mês a mês.
 * Meses anteriores sem exceções nem recargas manuais têm carryOut = 0 naturalmente.
 */
function findChainStartYear(targetYear, state) {
  const currentYear = Number(getTodayStr().slice(0, 4));
  let minYear = Math.min(targetYear, currentYear);

  if (state.exceptions) {
    for (const dateStr of Object.keys(state.exceptions)) {
      const y = Number(dateStr.slice(0, 4));
      if (Number.isFinite(y) && y < minYear) minYear = y;
    }
  }

  if (state.monthlyRecharges) {
    for (const ym of Object.keys(state.monthlyRecharges)) {
      const y = Number(ym.slice(0, 4));
      if (Number.isFinite(y) && y < minYear) minYear = y;
    }
  }

  // Proteção contra anos extremos acidentais (máximo 10 anos de retrocesso)
  return Math.max(minYear, targetYear - 10);
}

/**
 * Executa a cadeia contábil de compensação automática mês a mês até (targetYear, targetMonth).
 *
 * Regra de compensação:
 * - Cada mês recebe `previousCreditCents` vindo do mês anterior (> 0 crédito; < 0 déficit).
 * - O Valor Líquido Necessário do mês é: `max(0, actualTotalCents - previousCreditCents)`.
 * - Se o usuário NÃO informou recarga efetiva para o mês, assume-se que recarregou o valor
 *   previsto líquido (`plannedDeposit = max(0, predictedBaseCents - previousCreditCents)`).
 *   Logo, qualquer economia manual (dias não gastos / meias viagens) gera automaticamente
 *   `carryOutCents > 0`, que abate o Valor Líquido Necessário do mês seguinte.
 * - Se o usuário INFORMOU recarga efetiva (`recordedRechargeCents`), o saldo transferido é
 *   `previousCreditCents + recordedRechargeCents - actualTotalCents`, registrando sobra ou
 *   déficit real acumulado.
 */
export function buildCompensationChain(targetYear, targetMonth, state, holidayYearCache = null) {
  const cache = holidayYearCache || new Map();
  const startYear = findChainStartYear(targetYear, state);
  const resultsByYM = new Map();

  let carryCents = 0; // Positivo = crédito disponível; Negativo = déficit acumulado

  for (let y = startYear; y <= targetYear; y++) {
    const lastMonth = y === targetYear ? targetMonth : 12;
    for (let m = 1; m <= lastMonth; m++) {
      const raw = calculateMonthRaw(y, m, state, cache);
      const previousCreditCents = carryCents;

      // Líquido necessário considerando crédito (abate) ou déficit (soma) vindo do mês anterior
      const netNeededCents = Math.max(0, raw.actualTotalCents - previousCreditCents);

      // Quanto do crédito anterior foi efetivamente usado para abater este mês
      const appliedCreditCents =
        previousCreditCents > 0
          ? Math.min(previousCreditCents, raw.actualTotalCents)
          : 0;
      const appliedDeficitCents =
        previousCreditCents < 0 ? Math.abs(previousCreditCents) : 0;

      // Recarga prevista para o orçamento base do mês
      const plannedDepositCents = Math.max(0, raw.predictedBaseCents - previousCreditCents);

      // Se o usuário registrou recarga efetiva, usa o valor informado; caso contrário, usa o planejado
      const effectiveDepositCents =
        raw.recordedRechargeCents !== null
          ? raw.recordedRechargeCents
          : plannedDepositCents;

      // Sobra (+) ou déficit (-) transferido automaticamente para o mês seguinte
      const carryOutCents =
        previousCreditCents + effectiveDepositCents - raw.actualTotalCents;

      const enriched = {
        ...raw,
        previousCreditCents,
        appliedCreditCents,
        appliedDeficitCents,
        netNeededCents,
        plannedDepositCents,
        effectiveDepositCents,
        carryOutCents
      };

      resultsByYM.set(raw.ym, enriched);
      carryCents = carryOutCents;
    }
  }

  return resultsByYM;
}

/**
 * Retorna os cálculos completos de um único mês (incluindo compensação herdada e gerada).
 */
export function calculateMonth(year, month, state, holidayYearCache = null) {
  const cache = holidayYearCache || new Map();
  const chain = buildCompensationChain(year, month, state, cache);
  return chain.get(getYearMonthKey(year, month));
}

/**
 * Calcula o resumo completo dos 12 meses de um ano específico,
 * incluindo compensação encadeada, totais anuais, economias e médias.
 */
export function calculateYearSummary(year, state, holidayYearCache = null) {
  const cache = holidayYearCache || new Map();
  const chain = buildCompensationChain(year, 12, state, cache);

  const months = [];
  let totalPredictedBaseCents = 0;
  let totalActualCents = 0;
  let totalNetNeededCents = 0;
  let totalHolidaySavingsCents = 0;
  let totalManualSavingsCents = 0;
  let totalManualExtraCents = 0;
  let totalActiveDays = 0;
  let maxMonthActualCents = 0;

  for (let m = 1; m <= 12; m++) {
    const ym = getYearMonthKey(year, m);
    const monthData = chain.get(ym);
    months.push(monthData);

    totalPredictedBaseCents += monthData.predictedBaseCents;
    totalActualCents += monthData.actualTotalCents;
    totalNetNeededCents += monthData.netNeededCents;
    totalHolidaySavingsCents += monthData.holidaySavingsCents;
    totalManualSavingsCents += monthData.manualSavingsCents;
    totalManualExtraCents += monthData.manualExtraCents;
    totalActiveDays += monthData.activeDaysCount;
    if (monthData.actualTotalCents > maxMonthActualCents) {
      maxMonthActualCents = monthData.actualTotalCents;
    }
  }

  const avgPerActiveDayCents =
    totalActiveDays > 0 ? Math.round(totalActualCents / totalActiveDays) : 0;
  const avgPerWeekCents = Math.round(totalActualCents / 52.1429);

  return {
    year,
    months,
    totalPredictedBaseCents,
    totalActualCents,
    totalNetNeededCents,
    totalHolidaySavingsCents,
    totalManualSavingsCents,
    totalManualExtraCents,
    totalSavingsCents: totalHolidaySavingsCents + totalManualSavingsCents,
    totalActiveDays,
    avgPerActiveDayCents,
    avgPerWeekCents,
    maxMonthActualCents
  };
}

/**
 * Calcula a projeção do saldo atual do cartão de transporte:
 * - Quanto falta recarregar para fechar o mês atual (nunca negativo)
 * - Sobra prevista do cartão ao fim do mês atual (se o saldo superar o restante do mês)
 * - Autonomia dia a dia ("Seu saldo dura até") a partir de hoje (ou amanhã, se configurado)
 */
export function calculateCardProjection(state, holidayYearCache = null) {
  const cache = holidayYearCache || new Map();
  const todayStr = getTodayStr();
  const { year: curYear, month: curMonth } = splitDateStr(todayStr);
  const includeToday = state.settings?.includeTodayInProjection !== false;
  const startDate = includeToday ? todayStr : addDaysStr(todayStr, 1);
  const balanceCents = Math.max(0, Math.round(state.cardBalance?.cents || 0));

  // 1. Custo restante para fechar o mês atual
  const lastDayOfCurrentMonth = formatLocalDate(
    curYear,
    curMonth,
    getDaysInMonth(curYear, curMonth)
  );

  let remainingMonthCostCents = 0;
  let remainingMonthActiveDays = 0;

  if (startDate <= lastDayOfCurrentMonth) {
    let cur = startDate;
    while (cur <= lastDayOfCurrentMonth) {
      const dayCalc = calculateDay(cur, state, cache);
      if (dayCalc.effectiveCents > 0) {
        remainingMonthCostCents += dayCalc.effectiveCents;
        remainingMonthActiveDays++;
      }
      cur = addDaysStr(cur, 1);
    }
  }

  const rechargeNeededThisMonthCents = Math.max(0, remainingMonthCostCents - balanceCents);
  const projectedMonthEndSurplusCents = Math.max(0, balanceCents - remainingMonthCostCents);

  // 2. Projeção de autonomia dia a dia (limite de 730 dias / 2 anos)
  const MAX_HORIZON_DAYS = 730;
  let remainingBalance = balanceCents;
  let cursor = startDate;
  let coveredActiveDays = 0;
  let lastCoveredDate = null;
  let lastCoveredActiveDate = null;
  let firstUncoveredActiveDate = null;
  let firstUncoveredCostCents = 0;
  let exceededHorizon = false;

  for (let step = 0; step < MAX_HORIZON_DAYS; step++) {
    const dayCalc = calculateDay(cursor, state, cache);
    const cost = dayCalc.effectiveCents;

    if (cost === 0) {
      lastCoveredDate = cursor;
    } else if (remainingBalance >= cost) {
      remainingBalance -= cost;
      coveredActiveDays++;
      lastCoveredDate = cursor;
      lastCoveredActiveDate = cursor;
    } else {
      firstUncoveredActiveDate = cursor;
      firstUncoveredCostCents = cost;
      break;
    }

    if (step === MAX_HORIZON_DAYS - 1) {
      exceededHorizon = true;
    }
    cursor = addDaysStr(cursor, 1);
  }

  const shortfallOnFirstUncoveredCents = firstUncoveredActiveDate
    ? Math.max(0, firstUncoveredCostCents - remainingBalance)
    : 0;

  return {
    todayStr,
    startDate,
    includeToday,
    balanceCents,
    updatedAt: state.cardBalance?.updatedAt || null,
    remainingMonthCostCents,
    remainingMonthActiveDays,
    rechargeNeededThisMonthCents,
    projectedMonthEndSurplusCents,
    coveredActiveDays,
    lastCoveredDate,
    lastCoveredActiveDate,
    firstUncoveredActiveDate,
    firstUncoveredCostCents,
    shortfallOnFirstUncoveredCents,
    leftoverCents: remainingBalance,
    exceededHorizon
  };
}

/**
 * Calcula métricas completas para um intervalo personalizado [startDate, endDate]
 * (inclusive cruzando de um mês ou ano para outro).
 */
export function calculateRangeSummary(rawStart, rawEnd, state, holidayYearCache = null) {
  if (!rawStart || !rawEnd) return null;

  const startDate = rawStart <= rawEnd ? rawStart : rawEnd;
  const endDate = rawStart <= rawEnd ? rawEnd : rawStart;

  const totalDays = diffDaysInclusive(startDate, endDate);
  const MAX_RANGE_DAYS = 1100;
  const truncated = totalDays > MAX_RANGE_DAYS;
  const effectiveEnd = truncated ? addDaysStr(startDate, MAX_RANGE_DAYS - 1) : endDate;

  const cache = holidayYearCache || new Map();
  const todayStr = getTodayStr();
  const includeToday = state.settings?.includeTodayInProjection !== false;
  const projectionStartStr = includeToday ? todayStr : addDaysStr(todayStr, 1);

  let activeDays = 0;
  let holidayDays = 0;
  let zeroedDays = 0; // Dias sem gasto (não gastei + sem tarifa na grade, exceto feriados)
  let halfDays = 0;
  let customDays = 0;
  let totalCents = 0;
  let futurePortionCents = 0;
  let predictedBaseCents = 0;
  let holidaySavingsCents = 0;
  let manualSavingsCents = 0;

  let cursor = startDate;
  while (cursor <= effectiveEnd) {
    const dayCalc = calculateDay(cursor, state, cache);
    totalCents += dayCalc.effectiveCents;
    predictedBaseCents += dayCalc.predictedBaseCents;
    holidaySavingsCents += dayCalc.holidaySavingsCents;
    manualSavingsCents += dayCalc.manualSavingsCents;

    if (cursor >= projectionStartStr) {
      futurePortionCents += dayCalc.effectiveCents;
    }

    if (dayCalc.effectiveCents > 0) {
      activeDays++;
    }

    if (dayCalc.status === 'feriado' || dayCalc.status === 'feriado_meia') {
      holidayDays++;
    } else if (dayCalc.effectiveCents === 0) {
      zeroedDays++;
    }

    if (dayCalc.status === 'meia_viagem') halfDays++;
    if (dayCalc.status === 'valor_personalizado') customDays++;

    cursor = addDaysStr(cursor, 1);
  }

  const cardBalanceCents = Math.max(0, Math.round(state.cardBalance?.cents || 0));
  const isPastOnly = effectiveEnd < todayStr;
  const startsInFutureOrToday = startDate >= todayStr;

  // Se o intervalo começa hoje ou no futuro, compara o total inteiro do intervalo com o saldo.
  // Se cruza o passado e o futuro, compara tanto o total quanto a parcela restante futura.
  const referenceForRechargeCents = startsInFutureOrToday ? totalCents : futurePortionCents;
  const rechargeNeededCents = isPastOnly
    ? 0
    : Math.max(0, referenceForRechargeCents - cardBalanceCents);
  const surplusAfterRangeCents = isPastOnly
    ? 0
    : Math.max(0, cardBalanceCents - referenceForRechargeCents);

  return {
    startDate,
    endDate: effectiveEnd,
    totalDays: truncated ? MAX_RANGE_DAYS : totalDays,
    truncated,
    activeDays,
    holidayDays,
    zeroedDays,
    halfDays,
    customDays,
    totalCents,
    futurePortionCents,
    predictedBaseCents,
    holidaySavingsCents,
    manualSavingsCents,
    isPastOnly,
    startsInFutureOrToday,
    cardBalanceCents,
    rechargeNeededCents,
    surplusAfterRangeCents
  };
}
