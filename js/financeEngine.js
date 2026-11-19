/**
 * Motor Financeiro Pessoal 100% Offline do Bolsito.
 *
 * Princípios:
 * - Todos os valores monetários são manipulados em CENTAVOS INTEIROS.
 * - Integração unidirecional e somente-leitura com `js/calculator.js`: o gasto
 *   real/ajustado de Passagens (`actualTotalCents`) entra automaticamente na
 *   categoria `transporte` sem duplicação de estado nem acoplamento frágil.
 */

import { calculateMonthRaw } from './calculator.js';
import {
  CATEGORY_MAP,
  DEFAULT_INCOME_PAY_DAY,
  EXPENSE_CATEGORIES,
  getCategoryMeta
} from './constants.js';
import {
  buildDateForYearMonth,
  getDaysInMonth,
  getTodayStr,
  getYearMonthKey,
  isValidDateStr,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  pad2,
  splitDateStr
} from './holidays.js';

export { EXPENSE_CATEGORIES, getCategoryMeta };

/**
 * Resolve o status de recebimento da renda mensal fixa em uma competência ('YYYY-MM').
 * 1. Se houver override manual explícito em `income.baseReceivedByMonth[ym]` (`true` ou `false`), respeita-o.
 * 2. Caso contrário, resolve automaticamente a partir de `todayStr` e `income.payDay` (padrão 5):
 *    - Mês anterior ao atual (`ym < hojeYM`): Recebida (`true`)
 *    - Mês atual (`ym === hojeYM`): `hoje.dia >= Math.min(payDay, ultimoDiaDoMes)`
 *    - Mês futuro (`ym > hojeYM`): A receber (`false`)
 */
export function resolveBaseIncomeStatus(ym, income, todayStr = getTodayStr()) {
  const rawPayDay = Number(income?.payDay);
  const payDay = Number.isFinite(rawPayDay)
    ? Math.min(31, Math.max(1, Math.round(rawPayDay)))
    : DEFAULT_INCOME_PAY_DAY;

  const hasManualOverride =
    Boolean(income?.baseReceivedByMonth) &&
    typeof income.baseReceivedByMonth === 'object' &&
    typeof income.baseReceivedByMonth[ym] === 'boolean';

  if (hasManualOverride) {
    return {
      received: income.baseReceivedByMonth[ym],
      isAuto: false,
      payDay
    };
  }

  const safeToday = isValidDateStr(todayStr) ? todayStr : getTodayStr();
  const todayYM = safeToday.slice(0, 7);

  let received = false;
  if (ym < todayYM) {
    received = true;
  } else if (ym > todayYM) {
    received = false;
  } else {
    const { year: ty, month: tm, day: td } = splitDateStr(safeToday);
    const effectivePayDay = Math.min(payDay, getDaysInMonth(ty, tm));
    received = td >= effectivePayDay;
  }

  return {
    received,
    isAuto: true,
    payDay
  };
}

// ============================================================
// Utilitários Puros de Competência Mensal ('YYYY-MM')
// ============================================================

export function parseYM(ym) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) return null;
  const [year, month] = ym.split('-').map(Number);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

export function addMonthsYM(ym, deltaMonths) {
  const parts = parseYM(ym);
  if (!parts) return ym;
  const total = parts.year * 12 + (parts.month - 1) + deltaMonths;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12 + 1;
  return `${nextYear}-${pad2(nextMonth)}`;
}

export function diffMonthsYM(startYM, targetYM) {
  const start = parseYM(startYM);
  const target = parseYM(targetYM);
  if (!start || !target) return null;
  return (target.year - start.year) * 12 + (target.month - start.month);
}

/**
 * Calcula o progresso de um parcelamento em uma competência específica ('YYYY-MM').
 * Retorna null caso o parcelamento ainda não tenha iniciado ou já tenha sido quitado antes do mês.
 */
export function getInstallmentInfoForMonth(installment, ym) {
  if (!installment || !installment.startMonth) return null;
  const total = Math.max(1, Math.round(Number(installment.totalInstallments) || 1));
  const offset = diffMonthsYM(installment.startMonth, ym);
  if (offset === null || offset < 0 || offset >= total) return null;

  const currentNumber = offset + 1;
  const paid = Boolean(installment.paidByMonth && installment.paidByMonth[ym]);
  const installmentAmount = Math.max(0, Math.round(Number(installment.installmentAmount) || 0));

  // Parcelas restantes após a competência atual (ou incluindo a atual se ainda não foi paga)
  const remainingInstallments = paid ? total - currentNumber : total - offset;
  const remainingAmountCents = Math.max(0, remainingInstallments * installmentAmount);
  const progressPct = Math.min(100, Math.round((currentNumber / total) * 100));
  const endMonth = addMonthsYM(installment.startMonth, total - 1);

  // Contagem estrita de parcelas marcadas como pagas ao longo de todo o plano
  let paidInstallmentsCount = 0;
  if (installment.paidByMonth && typeof installment.paidByMonth === 'object') {
    for (let i = 0; i < total; i++) {
      const mKey = addMonthsYM(installment.startMonth, i);
      if (installment.paidByMonth[mKey]) {
        paidInstallmentsCount++;
      }
    }
  }
  const paidProgressPct = Math.min(100, Math.round((paidInstallmentsCount / total) * 100));

  return {
    currentNumber,
    totalInstallments: total,
    paid,
    installmentAmount,
    remainingInstallments,
    remainingAmountCents,
    progressPct,
    paidInstallmentsCount,
    paidProgressPct,
    endMonth
  };
}

/**
 * Calcula o consolidado financeiro completo de um mês (year, month),
 * integrando automaticamente o gasto real/ajustado de Passagens na categoria `transporte`.
 */
export function calculateFinanceMonth(year, month, state, options = {}) {
  const ym = getYearMonthKey(year, month);
  const holidayYearCache = options.holidayYearCache || new Map();
  const finance = state?.finance || {};
  const income = finance.income || {};
  const expenses = finance.expenses || {};
  const caixinhas = finance.caixinhas || {};

  // 1. Integração automática com o motor de Passagens (somente-leitura, fonte única de verdade)
  const transportMonth =
    options.transportMonth && options.transportMonth.ym === ym
      ? options.transportMonth
      : calculateMonthRaw(year, month, state, holidayYearCache);

  const transportExpensesCents = Math.max(0, Math.round(transportMonth?.actualTotalCents || 0));
  const transportItem = {
    id: `auto_transport_${ym}`,
    name: 'Passagens do Mês',
    amount: transportExpensesCents,
    category: 'transporte',
    source: 'transport_auto',
    readOnly: true,
    paid: true,
    activeDaysCount: transportMonth?.activeDaysCount || 0,
    predictedBaseCents: transportMonth?.predictedBaseCents || 0,
    savingsCents: transportMonth?.totalSavingsCents || 0
  };

  // 2. Rendas (Bolsa / Renda mensal fixa + dia padrão auto-recebida + Rendas extras pontuais)
  const baseMonthlyCents = Math.max(0, Math.round(Number(income.baseMonthly) || 0));
  const baseIncomeStatus = resolveBaseIncomeStatus(ym, income, options.todayStr);
  const baseReceived = baseIncomeStatus.received;
  const baseReceivedAuto = baseIncomeStatus.isAuto;
  const basePayDay = baseIncomeStatus.payDay;

  const extras = (Array.isArray(income.extras) ? income.extras : [])
    .filter((item) => item && typeof item.date === 'string' && item.date.startsWith(`${ym}-`))
    .map((item) => ({
      ...item,
      received: item.received !== false
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  const extrasTotalCents = extras.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.amount || 0)),
    0
  );
  const extrasReceivedCents = extras.reduce(
    (sum, item) => sum + (item.received ? Math.max(0, Math.round(item.amount || 0)) : 0),
    0
  );
  const totalIncomeCents = baseMonthlyCents + extrasTotalCents;
  const receivedIncomeCents = (baseReceived ? baseMonthlyCents : 0) + extrasReceivedCents;
  const receivableIncomeCents = Math.max(0, totalIncomeCents - receivedIncomeCents);

  // 3. Contas Fixas / Recorrentes ativas na competência
  const fixedItems = (Array.isArray(expenses.fixed) ? expenses.fixed : [])
    .filter((item) => {
      if (!item || !item.active) return false;
      if (item.startMonth && item.startMonth > ym) return false;
      return true;
    })
    .map((item) => ({
      ...item,
      paid: Boolean(item.paidByMonth && item.paidByMonth[ym])
    }))
    .sort((a, b) => (a.dueDay - b.dueDay) || a.name.localeCompare(b.name));

  let fixedExpensesCents = 0;
  let fixedPaidCents = 0;
  let fixedPendingCents = 0;
  for (const item of fixedItems) {
    fixedExpensesCents += item.amount;
    if (item.paid) {
      fixedPaidCents += item.amount;
    } else {
      fixedPendingCents += item.amount;
    }
  }

  // 4. Dívidas e Parcelamentos projetados na competência
  const installmentItems = [];
  for (const inst of Array.isArray(expenses.installments) ? expenses.installments : []) {
    const info = getInstallmentInfoForMonth(inst, ym);
    if (!info) continue;
    installmentItems.push({
      ...inst,
      ...info
    });
  }
  installmentItems.sort((a, b) => (a.dueDay - b.dueDay) || a.name.localeCompare(b.name));

  let installmentsExpensesCents = 0;
  let installmentsPaidCents = 0;
  let installmentsPendingCents = 0;
  for (const item of installmentItems) {
    installmentsExpensesCents += item.installmentAmount;
    if (item.paid) {
      installmentsPaidCents += item.installmentAmount;
    } else {
      installmentsPendingCents += item.installmentAmount;
    }
  }

  // 5. Gastos Avulsos do mês
  const variableItems = (Array.isArray(expenses.variable) ? expenses.variable : [])
    .filter((item) => item && typeof item.date === 'string' && item.date.startsWith(`${ym}-`))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.id).localeCompare(String(a.id)));

  const variableExpensesCents = variableItems.reduce(
    (sum, item) => sum + Math.max(0, Math.round(item.amount || 0)),
    0
  );

  // 5b. Fatura Rápida do Cartão de Crédito na competência ('YYYY-MM')
  const cardDefaults = expenses.creditCardDefaults || {
    dueDay: 10,
    cardName: 'Cartão de Crédito'
  };
  const rawCardBill =
    expenses.creditCardBills && typeof expenses.creditCardBills === 'object'
      ? expenses.creditCardBills[ym] || null
      : null;

  const creditCardBillAmount = rawCardBill ? Math.max(0, Math.round(Number(rawCardBill.amount) || 0)) : 0;
  const fallbackDueDay = rawCardBill?.dueDay || cardDefaults.dueDay || 10;
  const dueDate = isValidDateStr(rawCardBill?.dueDate)
    ? rawCardBill.dueDate
    : buildDateForYearMonth(ym, fallbackDueDay, false);
  const dueDay = Number(dueDate.slice(8, 10));

  const creditCardBill = {
    ym,
    amount: creditCardBillAmount,
    dueDate,
    dueDay,
    paid: Boolean(rawCardBill?.paid),
    cardName:
      (typeof rawCardBill?.cardName === 'string' && rawCardBill.cardName.trim()) ||
      cardDefaults.cardName ||
      'Cartão de Crédito',
    hasBill: creditCardBillAmount > 0
  };

  const creditCardExpensesCents = creditCardBill.amount;
  const creditCardPaidCents = creditCardBill.hasBill && creditCardBill.paid ? creditCardExpensesCents : 0;
  const creditCardPendingCents =
    creditCardBill.hasBill && !creditCardBill.paid ? creditCardExpensesCents : 0;

  // 6. Totalizadores do Mês
  const totalExpensesCents =
    transportExpensesCents +
    creditCardExpensesCents +
    fixedExpensesCents +
    installmentsExpensesCents +
    variableExpensesCents;

  const paidExpensesCents =
    transportExpensesCents +
    creditCardPaidCents +
    fixedPaidCents +
    installmentsPaidCents +
    variableExpensesCents;

  const pendingExpensesCents =
    creditCardPendingCents + fixedPendingCents + installmentsPendingCents;
  const freeBalanceCents = totalIncomeCents - totalExpensesCents;
  const committedPct =
    totalIncomeCents > 0
      ? Math.round((totalExpensesCents / totalIncomeCents) * 100)
      : totalExpensesCents > 0
        ? 100
        : 0;

  // 7. Quebra por Categoria (para o gráfico Donut SVG e análises)
  const categoryTotals = new Map();
  const addCategoryAmount = (catId, cents) => {
    if (!cents || cents <= 0) return;
    const safeId = CATEGORY_MAP.has(catId) ? catId : 'outros';
    categoryTotals.set(safeId, (categoryTotals.get(safeId) || 0) + cents);
  };

  addCategoryAmount('transporte', transportExpensesCents);
  if (creditCardBill.hasBill) {
    addCategoryAmount('cartao', creditCardExpensesCents);
  }
  for (const item of fixedItems) addCategoryAmount(item.category, item.amount);
  for (const item of installmentItems) addCategoryAmount(item.category, item.installmentAmount);
  for (const item of variableItems) addCategoryAmount(item.category, item.amount);

  const categoryBreakdown = Array.from(categoryTotals.entries())
    .map(([id, amountCents]) => {
      const meta = getCategoryMeta(id);
      return {
        id: meta.id,
        label: meta.label,
        colorVar: meta.colorVar,
        amountCents,
        pct: totalExpensesCents > 0 ? Number(((amountCents / totalExpensesCents) * 100).toFixed(1)) : 0
      };
    })
    .sort((a, b) => b.amountCents - a.amountCents);

  // 8. Pendências / Próximos Vencimentos do mês (Fatura do Cartão + Contas Fixas + Parcelas não pagas)
  const pendingItems = [
    ...(creditCardBill.hasBill && !creditCardBill.paid
      ? [
          {
            kind: 'credit_card',
            id: ym,
            name: creditCardBill.cardName || 'Fatura do Cartão de Crédito',
            dueDay: creditCardBill.dueDay,
            dueDate: creditCardBill.dueDate,
            category: 'cartao',
            amount: creditCardBill.amount,
            metaLabel: 'Fatura do cartão'
          }
        ]
      : []),
    ...fixedItems
      .filter((item) => !item.paid)
      .map((item) => ({
        kind: 'fixed',
        id: item.id,
        name: item.name,
        dueDay: item.dueDay,
        dueDate: buildDateForYearMonth(ym, item.dueDay, false),
        category: item.category,
        amount: item.amount,
        metaLabel: 'Conta fixa'
      })),
    ...installmentItems
      .filter((item) => !item.paid)
      .map((item) => ({
        kind: 'installment',
        id: item.id,
        name: item.name,
        dueDay: item.dueDay,
        dueDate: buildDateForYearMonth(ym, item.dueDay, false),
        category: item.category,
        amount: item.installmentAmount,
        metaLabel: `Parcela ${item.currentNumber}/${item.totalInstallments}`
      }))
  ].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);

  // 9. Aportes reais nas Caixinhas de RESERVA neste mês (exclui conta 'daily' e ajustes de saldo)
  let monthDepositsCents = 0;
  let monthWithdrawsCents = 0;
  for (const box of Array.isArray(caixinhas.boxes) ? caixinhas.boxes : []) {
    if (!box || box.kind === 'daily') continue;
    for (const tx of Array.isArray(box.transactions) ? box.transactions : []) {
      if (!tx || tx.isAdjustment === true) continue;
      if (typeof tx.date !== 'string' || !tx.date.startsWith(`${ym}-`)) continue;
      if (tx.type === 'deposit') monthDepositsCents += Math.max(0, Math.round(tx.amount || 0));
      if (tx.type === 'withdraw') monthWithdrawsCents += Math.max(0, Math.round(tx.amount || 0));
    }
  }

  return {
    year,
    month,
    ym,
    monthName: MONTH_NAMES[month - 1],
    monthShort: MONTH_NAMES_SHORT[month - 1],
    baseMonthlyCents,
    basePayDay,
    baseReceived,
    baseReceivedAuto,
    extras,
    extrasTotalCents,
    totalIncomeCents,
    receivedIncomeCents,
    receivableIncomeCents,
    transportItem,
    transportExpensesCents,
    creditCardBill,
    creditCardExpensesCents,
    fixedItems,
    fixedExpensesCents,
    installmentItems,
    installmentsExpensesCents,
    variableItems,
    variableExpensesCents,
    totalExpensesCents,
    paidExpensesCents,
    pendingExpensesCents,
    freeBalanceCents,
    committedPct,
    categoryBreakdown,
    pendingItems,
    monthDepositsCents,
    monthWithdrawsCents,
    monthNetContributionCents: Math.max(0, monthDepositsCents - monthWithdrawsCents)
  };
}

/**
 * Fórmula Contábil Universal do Total Líquido Consolidado:
 *   Total Real Hoje (todas as caixinhas: reserve + daily)
 * + Rendas a Receber no mês (base não recebida + extras não recebidos)
 * - Despesas Pendentes no mês (fixas + parcelas + fatura do cartão não pagas)
 *
 * Funciona antes do salário cair, no dia do recebimento e ao pagar contas sem jamais duplicar valores.
 */
export function calculateConsolidatedNetWorth(financeMonth, caixinhasSummary) {
  const ym = financeMonth.ym;
  const totalRealTodayCents = Math.max(0, Math.round(caixinhasSummary?.totalBalanceCents || 0));
  const reserveBalanceCents = Math.max(0, Math.round(caixinhasSummary?.reserveBalanceCents || 0));
  const dailyBalanceCents = Math.max(0, Math.round(caixinhasSummary?.dailyBalanceCents || 0));
  const receivableIncomeCents = Math.max(0, Math.round(financeMonth?.receivableIncomeCents || 0));
  const pendingExpensesCents = Math.max(0, Math.round(financeMonth?.pendingExpensesCents || 0));

  const netTotalCents = totalRealTodayCents + receivableIncomeCents - pendingExpensesCents;

  return {
    ym,
    totalRealTodayCents,
    caixinhasBalanceCents: totalRealTodayCents,
    reserveBalanceCents,
    dailyBalanceCents,
    receivableIncomeCents,
    pendingExpensesCents,
    netTotalCents
  };
}

/**
 * Calcula a evolução dos últimos 12 meses encerrando em (endYear, endMonth):
 * Receita vs. Despesa (incluindo Passagens automático) vs. Aportes líquidos nas Caixinhas.
 */
export function calculateFinance12Months(endYear, endMonth, state, holidayYearCache = null) {
  const cache = holidayYearCache || new Map();
  const endYM = getYearMonthKey(endYear, endMonth);
  const months = [];

  let maxBarCents = 0;
  let totalIncome12mCents = 0;
  let totalExpenses12mCents = 0;
  let totalContributions12mCents = 0;

  for (let offset = -11; offset <= 0; offset++) {
    const ym = addMonthsYM(endYM, offset);
    const { year, month } = parseYM(ym);
    const mData = calculateFinanceMonth(year, month, state, { holidayYearCache: cache });

    const contributionsCents = mData.monthNetContributionCents;
    maxBarCents = Math.max(maxBarCents, mData.totalIncomeCents, mData.totalExpensesCents, contributionsCents);

    totalIncome12mCents += mData.totalIncomeCents;
    totalExpenses12mCents += mData.totalExpensesCents;
    totalContributions12mCents += contributionsCents;

    months.push({
      year,
      month,
      ym,
      label: MONTH_NAMES_SHORT[month - 1],
      fullLabel: `${MONTH_NAMES[month - 1]} ${year}`,
      incomeCents: mData.totalIncomeCents,
      expensesCents: mData.totalExpensesCents,
      transportCents: mData.transportExpensesCents,
      contributionsCents,
      freeBalanceCents: mData.freeBalanceCents
    });
  }

  return {
    endYM,
    months,
    maxBarCents,
    totalIncome12mCents,
    totalExpenses12mCents,
    totalContributions12mCents
  };
}
