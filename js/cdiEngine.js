/**
 * Motor de Rendimento CDI 100% Offline (Padrão Mercado Brasileiro — 252 dias úteis/ano).
 *
 * Princípios:
 * - Reutiliza o calendário offline de feriados nacionais/bancários de `js/holidays.js`
 *   para contar dias úteis reais (segunda a sexta, excluindo feriados nacionais ativos).
 * - Acumula juros compostos dia a dia em precisão contínua interna e expõe todos os
 *   resultados financeiros em CENTAVOS INTEIROS (sem cálculo de IR — rendimento bruto).
 */

import {
  addDaysStr,
  buildNationalBusinessHolidaySetForYear,
  formatLocalDate,
  getTodayStr,
  isValidDateStr,
  MONTH_NAMES_SHORT,
  parseLocalDate,
  splitDateStr
} from './holidays.js';
import { DEFAULT_CDI_ANNUAL_RATE } from './state.js';

export const BUSINESS_DAYS_PER_YEAR = 252;
export const BUSINESS_DAYS_PER_MONTH = 21;
const MAX_SIMULATION_DAYS = 7305; // Limite de segurança (~20 anos)
const YM_REGEX = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Calcula a taxa diária composta de CDI para um determinado percentual do CDI.
 * Fórmula padrão mercado brasileiro (252 d.u./ano):
 *   taxaDiariaBase = (1 + cdiAnnualRate / 100)^(1 / 252) - 1
 *   taxaDiariaBox  = taxaDiariaBase * (cdiPercent / 100)
 */
export function getDailyCdiRate(cdiAnnualRate, cdiPercent = 100) {
  const safeAnnual = Number.isFinite(cdiAnnualRate) && cdiAnnualRate > 0 ? cdiAnnualRate : 0;
  const safePercent = Number.isFinite(cdiPercent) && cdiPercent > 0 ? cdiPercent : 0;
  if (safeAnnual === 0 || safePercent === 0) return 0;

  const taxaDiariaBase = Math.pow(1 + safeAnnual / 100, 1 / BUSINESS_DAYS_PER_YEAR) - 1;
  return taxaDiariaBase * (safePercent / 100);
}

/**
 * Calcula a projeção futura de uma caixinha (ou saldo consolidado) para:
 * - 1 mês  (21 dias úteis)
 * - 6 meses (126 dias úteis)
 * - 12 meses (252 dias úteis)
 * com suporte opcional a um aporte mensal recorrente simulado (`monthlyContributionCents`).
 */
export function calculateBoxProjection(
  currentBalanceCents,
  cdiAnnualRate,
  cdiPercent = 100,
  monthlyContributionCents = 0,
  referenceDateStr = null
) {
  const startBalance = Math.max(0, Math.round(Number(currentBalanceCents) || 0));
  const monthlyAdd = Math.max(0, Math.round(Number(monthlyContributionCents) || 0));
  const dailyRate = getDailyCdiRate(cdiAnnualRate, cdiPercent);
  const monthlyFactor = Math.pow(1 + dailyRate, BUSINESS_DAYS_PER_MONTH);

  const refDate = isValidDateStr(referenceDateStr) ? referenceDateStr : getTodayStr();
  const { year: startYear, month: startMonth } = splitDateStr(refDate);

  const series12Months = [
    {
      monthOffset: 0,
      label: 'Hoje',
      year: startYear,
      month: startMonth,
      balanceCents: startBalance,
      contributedCents: startBalance,
      yieldCents: 0
    }
  ];

  let runningBalance = startBalance;
  let runningContributed = startBalance;

  for (let m = 1; m <= 12; m++) {
    // Aplica 21 dias úteis de rendimento composto sobre o saldo vigente no mês
    runningBalance = runningBalance * monthlyFactor;
    if (monthlyAdd > 0) {
      runningBalance += monthlyAdd;
      runningContributed += monthlyAdd;
    }

    const totalMonthsIndex = startMonth - 1 + m;
    const projYear = startYear + Math.floor(totalMonthsIndex / 12);
    const projMonth = (totalMonthsIndex % 12) + 1;

    const balanceRounded = Math.round(runningBalance);
    const yieldRounded = Math.max(0, balanceRounded - runningContributed);

    series12Months.push({
      monthOffset: m,
      label: `${MONTH_NAMES_SHORT[projMonth - 1]}/${String(projYear).slice(-2)}`,
      year: projYear,
      month: projMonth,
      balanceCents: balanceRounded,
      contributedCents: runningContributed,
      yieldCents: yieldRounded
    });
  }

  const pickPoint = (monthOffset) => {
    const pt = series12Months[monthOffset];
    return {
      months: monthOffset,
      businessDays: monthOffset * BUSINESS_DAYS_PER_MONTH,
      balanceCents: pt.balanceCents,
      totalContributedCents: pt.contributedCents,
      projectedYieldCents: pt.yieldCents,
      gainOverStartCents: Math.max(0, pt.balanceCents - startBalance)
    };
  };

  return {
    dailyRate,
    monthlyContributionCents: monthlyAdd,
    month1: pickPoint(1),
    month6: pickPoint(6),
    month12: pickPoint(12),
    series12Months
  };
}

/**
 * Simula dia a dia o desempenho real de uma única caixinha desde a primeira
 * movimentação até `asOfDate` (padrão: hoje), aplicando aportes, resgates e
 * rendimento composto em cada dia útil nacional com saldo positivo.
 */
export function calculateBoxPerformance(box, cdiAnnualRate, state = {}, options = {}) {
  const asOfDate = isValidDateStr(options.asOfDate) ? options.asOfDate : getTodayStr();
  const targetYM =
    typeof options.targetYM === 'string' && YM_REGEX.test(options.targetYM)
      ? options.targetYM
      : asOfDate.slice(0, 7);
  const nationalHolidayCache = options.nationalHolidayCache || new Map();
  const monthlyContributionCents = Math.max(
    0,
    Math.round(Number(options.monthlyContributionCents) || 0)
  );

  const cdiPercent = Number.isFinite(box?.cdiPercent) && box.cdiPercent >= 0 ? box.cdiPercent : 100;
  const dailyRate = getDailyCdiRate(cdiAnnualRate, cdiPercent);

  const rawTxs = Array.isArray(box?.transactions) ? box.transactions : [];
  const validTxs = rawTxs
    .filter(
      (tx) =>
        tx &&
        isValidDateStr(tx.date) &&
        (tx.type === 'deposit' || tx.type === 'withdraw') &&
        Number.isFinite(tx.amount) &&
        tx.amount > 0
    )
    .sort((a, b) => {
      const cmp = a.date.localeCompare(b.date);
      if (cmp !== 0) return cmp;
      // Na mesma data, movimentações regulares vêm antes de ajustes rápidos de saldo
      const adjA = Boolean(a.isAdjustment);
      const adjB = Boolean(b.isAdjustment);
      if (adjA !== adjB) return adjA ? 1 : -1;
      // Entre movimentações do mesmo grupo, processa aportes antes de resgates
      if (a.type !== b.type) return a.type === 'deposit' ? -1 : 1;
      return String(a.id || '').localeCompare(String(b.id || ''));
    });

  // Agrupa movimentações até a data de referência (asOfDate)
  const txByDate = new Map();
  let totalDepositedCents = 0;
  let totalWithdrawnCents = 0;
  let firstTxDate = null;

  for (const tx of validTxs) {
    if (tx.date > asOfDate) continue;
    if (!firstTxDate) firstTxDate = tx.date;
    if (!txByDate.has(tx.date)) {
      txByDate.set(tx.date, []);
    }
    txByDate.get(tx.date).push(tx);
  }

  let balanceFloat = 0; // em centavos fracionários para precisão composta
  let principalFloat = 0;
  let monthYieldFloat = 0;
  let businessDaysWithYield = 0;
  let truncatedHistory = false;

  const applyTx = (tx) => {
    if (tx.type === 'deposit') {
      balanceFloat += tx.amount;
      principalFloat += tx.amount;
      totalDepositedCents += tx.amount;
    } else if (tx.type === 'withdraw') {
      const actualWithdraw = Math.min(balanceFloat, tx.amount);
      totalWithdrawnCents += tx.amount;
      if (balanceFloat > 0 && actualWithdraw > 0) {
        const remainingRatio = Math.max(0, (balanceFloat - actualWithdraw) / balanceFloat);
        balanceFloat = Math.max(0, balanceFloat - actualWithdraw);
        principalFloat = principalFloat * remainingRatio;
      } else {
        balanceFloat = 0;
        principalFloat = 0;
      }
    }
  };

  if (firstTxDate) {
    const earliestAllowed = addDaysStr(asOfDate, -MAX_SIMULATION_DAYS);
    let startCursor = firstTxDate;

    // Se houver movimentações anteriores à janela de 20 anos, incorpora ao saldo inicial sem perdê-las
    if (firstTxDate < earliestAllowed) {
      truncatedHistory = true;
      for (const tx of validTxs) {
        if (tx.date < earliestAllowed) {
          applyTx(tx);
        } else {
          break;
        }
      }
      startCursor = earliestAllowed;
    }

    const [targetYearNum, targetMonthNum] = targetYM.split('-').map(Number);
    const { year: endY, month: endM, day: endD } = splitDateStr(asOfDate);
    const endYmdNum = endY * 10000 + endM * 100 + endD;
    const cursorDt = parseLocalDate(startCursor);
    let cachedYear = -1;
    let cachedHolidaySet = null;

    while (true) {
      const y = cursorDt.getFullYear();
      const m = cursorDt.getMonth() + 1;
      const d = cursorDt.getDate();
      if (y * 10000 + m * 100 + d > endYmdNum) break;
      const dateStr = formatLocalDate(y, m, d);

      // 1. Rendimento do dia útil bancário sobre o saldo existente no fechamento anterior
      if (balanceFloat > 0) {
        const dow = cursorDt.getDay();
        if (dow !== 0 && dow !== 6) {
          if (y !== cachedYear) {
            cachedYear = y;
            if (nationalHolidayCache.has(y)) {
              cachedHolidaySet = nationalHolidayCache.get(y);
            } else {
              cachedHolidaySet = buildNationalBusinessHolidaySetForYear(y);
              nationalHolidayCache.set(y, cachedHolidaySet);
            }
          }
          if (!cachedHolidaySet.has(dateStr)) {
            const dayYield = balanceFloat * dailyRate;
            balanceFloat += dayYield;
            businessDaysWithYield++;
            if (y === targetYearNum && m === targetMonthNum) {
              monthYieldFloat += dayYield;
            }
          }
        }
      }

      // 2. Aportes e resgates registrados nesta data
      const dayTxs = txByDate.get(dateStr);
      if (dayTxs) {
        for (let i = 0; i < dayTxs.length; i++) {
          applyTx(dayTxs[i]);
        }
      }

      cursorDt.setDate(d + 1);
    }
  }

  const currentBalanceCents = Math.max(0, Math.round(balanceFloat));
  const principalCents = Math.min(currentBalanceCents, Math.max(0, Math.round(principalFloat)));
  const yieldCents = Math.max(0, currentBalanceCents - principalCents);
  const monthYieldCents = Math.max(0, Math.round(monthYieldFloat));

  const goalAmount =
    Number.isFinite(box?.goalAmount) && box.goalAmount > 0 ? Math.round(box.goalAmount) : null;
  const goalProgressPct =
    goalAmount !== null
      ? Math.min(100, Math.round((currentBalanceCents / goalAmount) * 100))
      : null;

  const projections = calculateBoxProjection(
    currentBalanceCents,
    cdiAnnualRate,
    cdiPercent,
    monthlyContributionCents,
    asOfDate
  );

  return {
    id: box.id,
    name: box.name,
    kind: box.kind === 'daily' ? 'daily' : 'reserve',
    cdiPercent,
    goalAmount,
    goalProgressPct,
    dailyRate,
    totalDepositedCents,
    totalWithdrawnCents,
    principalCents,
    yieldCents,
    currentBalanceCents,
    monthYieldCents,
    businessDaysWithYield,
    truncatedHistory,
    transactionsCount: validTxs.length,
    transactionsDesc: [...validTxs]
      .reverse()
      .map((tx) => ({ ...tx, isFuture: tx.date > asOfDate })),
    projections
  };
}

function buildCombinedProjection(subsetBoxes, cdiAnnualRate, monthlyContributionCents, asOfDate) {
  const subsetBalance = subsetBoxes.reduce((acc, b) => acc + b.currentBalanceCents, 0);
  const weightedCdiPercent =
    subsetBalance > 0
      ? subsetBoxes.reduce((acc, b) => acc + b.cdiPercent * (b.currentBalanceCents / subsetBalance), 0)
      : subsetBoxes.length > 0
        ? subsetBoxes.reduce((acc, b) => acc + b.cdiPercent, 0) / subsetBoxes.length
        : 100;

  const extraContribProjection =
    monthlyContributionCents > 0
      ? calculateBoxProjection(0, cdiAnnualRate, weightedCdiPercent, monthlyContributionCents, asOfDate)
      : null;

  const baseEmptySeries = calculateBoxProjection(0, cdiAnnualRate, 100, 0, asOfDate).series12Months;
  const series12Months = baseEmptySeries.map((templatePt, idx) => {
    let balanceCents = 0;
    let contributedCents = 0;
    for (const b of subsetBoxes) {
      const pt = b.projections.series12Months[idx];
      balanceCents += pt.balanceCents;
      contributedCents += pt.contributedCents;
    }
    if (extraContribProjection) {
      balanceCents += extraContribProjection.series12Months[idx].balanceCents;
      contributedCents += extraContribProjection.series12Months[idx].contributedCents;
    }
    return {
      ...templatePt,
      balanceCents,
      contributedCents,
      yieldCents: Math.max(0, balanceCents - contributedCents)
    };
  });

  const pickPoint = (monthOffset) => {
    const pt = series12Months[monthOffset];
    return {
      months: monthOffset,
      businessDays: monthOffset * BUSINESS_DAYS_PER_MONTH,
      balanceCents: pt.balanceCents,
      totalContributedCents: pt.contributedCents,
      projectedYieldCents: pt.yieldCents,
      gainOverStartCents: Math.max(0, pt.balanceCents - subsetBalance)
    };
  };

  return {
    baseBalanceCents: subsetBalance,
    weightedCdiPercent: Number(weightedCdiPercent.toFixed(2)),
    monthlyContributionCents,
    month1: pickPoint(1),
    month6: pickPoint(6),
    month12: pickPoint(12),
    series12Months
  };
}

/**
 * Consolida todas as caixinhas configuradas no estado, somando saldos,
 * principal, rendimentos acumulados, subtotais por papel ('reserve' vs 'daily')
 * e projeções agregadas de 12 meses (somente reservas vs. todas).
 */
export function calculateAllCaixinhas(state, options = {}) {
  const caixinhas = state?.finance?.caixinhas || {};
  const cdiAnnualRate =
    Number.isFinite(caixinhas.cdiAnnualRate) && caixinhas.cdiAnnualRate >= 0
      ? caixinhas.cdiAnnualRate
      : DEFAULT_CDI_ANNUAL_RATE;
  const boxesList = Array.isArray(caixinhas.boxes) ? caixinhas.boxes : [];
  const nationalHolidayCache = options.nationalHolidayCache || new Map();
  const asOfDate = isValidDateStr(options.asOfDate) ? options.asOfDate : getTodayStr();
  const targetYM =
    typeof options.targetYM === 'string' && YM_REGEX.test(options.targetYM)
      ? options.targetYM
      : asOfDate.slice(0, 7);
  const monthlyContributionCents = Math.max(
    0,
    Math.round(Number(options.monthlyContributionCents) || 0)
  );

  const boxes = boxesList.map((box) =>
    calculateBoxPerformance(box, cdiAnnualRate, state, {
      asOfDate,
      targetYM,
      nationalHolidayCache,
      monthlyContributionCents: 0
    })
  );

  let totalBalanceCents = 0;
  let totalPrincipalCents = 0;
  let totalYieldCents = 0;
  let totalMonthYieldCents = 0;
  let totalDepositedCents = 0;
  let totalWithdrawnCents = 0;

  let reserveBalanceCents = 0;
  let reservePrincipalCents = 0;
  let reserveYieldCents = 0;
  let reserveMonthYieldCents = 0;
  let reserveCount = 0;

  let dailyBalanceCents = 0;
  let dailyPrincipalCents = 0;
  let dailyYieldCents = 0;
  let dailyMonthYieldCents = 0;
  let dailyCount = 0;

  const reserveBoxes = [];

  for (const b of boxes) {
    totalBalanceCents += b.currentBalanceCents;
    totalPrincipalCents += b.principalCents;
    totalYieldCents += b.yieldCents;
    totalMonthYieldCents += b.monthYieldCents;
    totalDepositedCents += b.totalDepositedCents;
    totalWithdrawnCents += b.totalWithdrawnCents;

    if (b.kind === 'daily') {
      dailyBalanceCents += b.currentBalanceCents;
      dailyPrincipalCents += b.principalCents;
      dailyYieldCents += b.yieldCents;
      dailyMonthYieldCents += b.monthYieldCents;
      dailyCount++;
    } else {
      reserveBalanceCents += b.currentBalanceCents;
      reservePrincipalCents += b.principalCents;
      reserveYieldCents += b.yieldCents;
      reserveMonthYieldCents += b.monthYieldCents;
      reserveCount++;
      reserveBoxes.push(b);
    }
  }

  const projectionsAll = buildCombinedProjection(
    boxes,
    cdiAnnualRate,
    monthlyContributionCents,
    asOfDate
  );
  const projectionsReserve = buildCombinedProjection(
    reserveBoxes,
    cdiAnnualRate,
    monthlyContributionCents,
    asOfDate
  );

  return {
    cdiAnnualRate,
    weightedCdiPercent: projectionsAll.weightedCdiPercent,
    asOfDate,
    targetYM,
    boxes,
    totalBalanceCents,
    totalPrincipalCents,
    totalYieldCents,
    totalMonthYieldCents,
    totalDepositedCents,
    totalWithdrawnCents,
    reserveBalanceCents,
    reservePrincipalCents,
    reserveYieldCents,
    reserveMonthYieldCents,
    reserveCount,
    dailyBalanceCents,
    dailyPrincipalCents,
    dailyYieldCents,
    dailyMonthYieldCents,
    dailyCount,
    projections: projectionsAll,
    projectionsAll,
    projectionsReserve
  };
}
