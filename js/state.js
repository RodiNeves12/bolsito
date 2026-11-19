/**
 * Gerenciamento de estado, persistência versionada no localStorage,
 * formatação/parsing de moeda em centavos (inteiros) e backup JSON.
 */

import {
  buildDateForYearMonth,
  getTodayStr,
  isValidDateStr,
  getCurrentDateTimeLabel
} from './holidays.js';

export const STORAGE_KEY = 'calc_passagens_v1';
export const SCHEMA_VERSION = 2;
export const DEFAULT_CDI_ANNUAL_RATE = 10.65;

export const VALID_PALETTES = ['floresta', 'editorial', 'ardosia', 'cafe', 'ameixa'];

export const VALID_EXPENSE_CATEGORIES = [
  'transporte',
  'cartao',
  'alimentacao',
  'assinaturas',
  'moradia',
  'lazer',
  'saude',
  'educacao',
  'compras',
  'dividas',
  'outros'
];

const VALID_EXPENSE_CATEGORY_SET = new Set(VALID_EXPENSE_CATEGORIES);
const YM_REGEX = /^\d{4}-\d{2}$/;

const VALID_EXCEPTION_TYPES = new Set([
  'nao_gastei',
  'meia_viagem',
  'valor_personalizado',
  'forcar_normal'
]);

const brlFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
});

/**
 * Formata valor inteiro em centavos para moeda brasileira (ex.: 940 -> "R$ 9,40").
 */
export function formatBRL(cents) {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  return brlFormatter.format(safeCents / 100);
}

/**
 * Formata centavos para exibição em input numérico brasileiro (ex.: 940 -> "9,40").
 */
export function centsToInputValue(cents) {
  const safeCents = Number.isFinite(cents) ? Math.round(cents) : 0;
  return (safeCents / 100).toFixed(2).replace('.', ',');
}

/**
 * Converte texto digitado pelo usuário (ex.: "9,40", "9.40", "R$ 1.250,50", "10")
 * para centavos inteiros não-negativos. Retorna null se inválido.
 */
export function parseCurrencyToCents(raw) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < 0) return null;
    return Math.round(raw * 100);
  }
  if (typeof raw !== 'string') return null;

  let cleaned = raw.trim().replace(/^R\$\s*/i, '').replace(/\s+/g, '');
  if (!cleaned) return null;

  // Detecta formato brasileiro (ponto como milhar, vírgula como decimal)
  if (cleaned.includes(',') && cleaned.includes('.')) {
    if (cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')) {
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }

  // Permite apenas dígitos e no máximo um ponto decimal
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) {
    return null;
  }

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.round(parsed * 100);
}

/**
 * Converte percentual digitado (ex.: "10,65", "102%", "100") para número finito >= 0.
 * Retorna null se inválido.
 */
export function parsePercentageRate(raw, { min = 0, max = 1000 } = {}) {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw) || raw < min || raw > max) return null;
    return Number(raw.toFixed(4));
  }
  if (typeof raw !== 'string') return null;

  const cleaned = raw.trim().replace(/%/g, '').replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,4})?$/.test(cleaned)) return null;

  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return Number(parsed.toFixed(4));
}

export function generateId(prefix = 'id') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/**
 * Cria a estrutura padrão do domínio financeiro pessoal (v2).
 * Todos os valores monetários são armazenados em centavos inteiros.
 */
export function createDefaultFinanceState() {
  return {
    income: {
      baseMonthly: 0, // centavos inteiros (bolsa auxílio / renda fixa líquida)
      baseReceivedByMonth: {}, // Mapa 'YYYY-MM' -> boolean (true = Recebida, false = A receber)
      extras: [] // { id, date, description, amount, received }
    },
    expenses: {
      fixed: [], // { id, name, amount, dueDay, category, active, startMonth, paidByMonth }
      installments: [], // { id, name, totalAmount, installmentAmount, totalInstallments, startMonth, dueDay, category, paidByMonth }
      variable: [], // { id, date, description, amount, category }
      creditCardDefaults: {
        dueDay: 10,
        dueInNextMonth: false,
        cardName: 'Cartão de Crédito'
      },
      // Mapa 'YYYY-MM' -> { amount, dueDate ('YYYY-MM-DD'), dueDay, paid, cardName }
      creditCardBills: {}
    },
    caixinhas: {
      cdiAnnualRate: DEFAULT_CDI_ANNUAL_RATE, // % a.a.
      boxes: [] // { id, name, kind: 'reserve'|'daily', cdiPercent, goalAmount, transactions: [{ id, date, type, amount, note?, isAdjustment? }] }
    }
  };
}

/**
 * Cria o estado inicial padrão da aplicação (v2 — Bolsito).
 */
export function createDefaultState() {
  const currentYear = Number(getTodayStr().slice(0, 4));
  return {
    version: SCHEMA_VERSION,
    theme: 'auto', // 'auto' | 'light' | 'dark'
    palette: 'floresta', // 'floresta' | 'editorial' | 'ardosia' | 'cafe' | 'ameixa'
    privacyMode: false,
    settings: {
      includeTodayInProjection: true
    },
    // Grade semanal em centavos: [Dom, Seg, Ter, Qua, Qui, Sex, Sáb]
    fareSchedules: [
      {
        id: 'sched_inicial',
        effectiveDate: `${currentYear}-01-01`,
        label: 'Tarifa Inicial',
        weekdays: [0, 940, 940, 940, 940, 940, 0]
      }
    ],
    // Mapa 'YYYY-MM-DD' -> { type, customCents?, note? }
    exceptions: {},
    // Mapa 'YYYY-MM' -> number (centavos efetivamente recarregados naquele mês)
    monthlyRecharges: {},
    // Saldo atual do cartão de transporte
    cardBalance: {
      cents: 0,
      updatedAt: null
    },
    // Personalizações de feriados embutidos: key -> { enabled?, name?, effect? }
    holidayOverrides: {},
    // Feriados, emendas e recessos manuais
    customHolidays: [],
    // Domínio financeiro pessoal (v2)
    finance: createDefaultFinanceState()
  };
}

function sanitizeCents(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : fallback;
}

function sanitizeDueDay(value, fallback = 10) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(31, Math.max(1, n));
}

function sanitizeCategory(value) {
  return typeof value === 'string' && VALID_EXPENSE_CATEGORY_SET.has(value)
    ? value
    : 'outros';
}

function sanitizePaidByMonth(rawMap) {
  const clean = {};
  if (!rawMap || typeof rawMap !== 'object' || Array.isArray(rawMap)) return clean;
  for (const [ym, val] of Object.entries(rawMap)) {
    if (YM_REGEX.test(ym) && typeof val === 'boolean') {
      clean[ym] = val;
    }
  }
  return clean;
}

function sanitizeFinanceState(rawFinance) {
  const defaults = createDefaultFinanceState();
  if (!rawFinance || typeof rawFinance !== 'object' || Array.isArray(rawFinance)) {
    return defaults;
  }

  // 1. Rendas (com migração automática do legado salaryDepositedByMonth -> baseReceivedByMonth)
  const rawIncome = rawFinance.income && typeof rawFinance.income === 'object' ? rawFinance.income : {};
  const baseMonthly = sanitizeCents(rawIncome.baseMonthly, 0);
  const baseReceivedByMonth = sanitizePaidByMonth(rawIncome.baseReceivedByMonth);
  const legacySalaryDeposited = sanitizePaidByMonth(rawFinance.salaryDepositedByMonth);
  for (const [ym, val] of Object.entries(legacySalaryDeposited)) {
    if (val === true && baseReceivedByMonth[ym] === undefined) {
      baseReceivedByMonth[ym] = true;
    }
  }

  const extras = [];
  if (Array.isArray(rawIncome.extras)) {
    for (const item of rawIncome.extras) {
      if (!item || typeof item !== 'object') continue;
      if (!isValidDateStr(item.date)) continue;
      const amount = sanitizeCents(item.amount, -1);
      if (amount < 0) continue;
      extras.push({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('inc'),
        date: item.date,
        description:
          typeof item.description === 'string' && item.description.trim()
            ? item.description.trim().slice(0, 100)
            : 'Renda extra',
        amount,
        received: typeof item.received === 'boolean' ? item.received : true
      });
    }
  }

  // 2. Despesas
  const rawExpenses =
    rawFinance.expenses && typeof rawFinance.expenses === 'object' ? rawFinance.expenses : {};

  const fixed = [];
  if (Array.isArray(rawExpenses.fixed)) {
    for (const item of rawExpenses.fixed) {
      if (!item || typeof item !== 'object') continue;
      const name =
        typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : '';
      if (!name) continue;
      fixed.push({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('fix'),
        name,
        amount: sanitizeCents(item.amount, 0),
        dueDay: sanitizeDueDay(item.dueDay, 10),
        category: sanitizeCategory(item.category),
        active: typeof item.active === 'boolean' ? item.active : true,
        startMonth:
          typeof item.startMonth === 'string' && YM_REGEX.test(item.startMonth)
            ? item.startMonth
            : getTodayStr().slice(0, 7),
        paidByMonth: sanitizePaidByMonth(item.paidByMonth)
      });
    }
  }

  const installments = [];
  if (Array.isArray(rawExpenses.installments)) {
    for (const item of rawExpenses.installments) {
      if (!item || typeof item !== 'object') continue;
      const name =
        typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 80) : '';
      if (!name) continue;
      const startMonth =
        typeof item.startMonth === 'string' && YM_REGEX.test(item.startMonth)
          ? item.startMonth
          : null;
      if (!startMonth) continue;

      const totalInstallments = Math.min(360, Math.max(1, Math.round(Number(item.totalInstallments) || 1)));
      const rawInstAmount = sanitizeCents(item.installmentAmount, 0);
      const rawTotalAmount = sanitizeCents(item.totalAmount, 0);
      const installmentAmount =
        rawInstAmount > 0
          ? rawInstAmount
          : Math.round(rawTotalAmount / totalInstallments);
      const totalAmount =
        rawTotalAmount > 0 ? rawTotalAmount : installmentAmount * totalInstallments;

      installments.push({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('inst'),
        name,
        totalAmount,
        installmentAmount,
        totalInstallments,
        startMonth,
        dueDay: sanitizeDueDay(item.dueDay, 10),
        category: sanitizeCategory(item.category || 'dividas'),
        paidByMonth: sanitizePaidByMonth(item.paidByMonth)
      });
    }
  }

  const variable = [];
  if (Array.isArray(rawExpenses.variable)) {
    for (const item of rawExpenses.variable) {
      if (!item || typeof item !== 'object') continue;
      if (!isValidDateStr(item.date)) continue;
      const amount = sanitizeCents(item.amount, -1);
      if (amount < 0) continue;
      variable.push({
        id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('var'),
        date: item.date,
        description:
          typeof item.description === 'string' && item.description.trim()
            ? item.description.trim().slice(0, 100)
            : 'Gasto avulso',
        amount,
        category: sanitizeCategory(item.category)
      });
    }
  }

  // 3. Caixinhas CDI
  const rawCaixinhas =
    rawFinance.caixinhas && typeof rawFinance.caixinhas === 'object' ? rawFinance.caixinhas : {};
  const parsedCdi = parsePercentageRate(rawCaixinhas.cdiAnnualRate, { min: 0, max: 200 });
  const cdiAnnualRate = parsedCdi !== null ? parsedCdi : DEFAULT_CDI_ANNUAL_RATE;

  const boxes = [];
  if (Array.isArray(rawCaixinhas.boxes)) {
    for (const box of rawCaixinhas.boxes) {
      if (!box || typeof box !== 'object') continue;
      const name =
        typeof box.name === 'string' && box.name.trim() ? box.name.trim().slice(0, 80) : '';
      if (!name) continue;
      const parsedPercent = parsePercentageRate(box.cdiPercent, { min: 0, max: 500 });
      const cdiPercent = parsedPercent !== null ? parsedPercent : 100;
      const goalAmount =
        box.goalAmount !== null && box.goalAmount !== undefined && Number(box.goalAmount) > 0
          ? sanitizeCents(box.goalAmount, 0)
          : null;

      const transactions = [];
      if (Array.isArray(box.transactions)) {
        for (const tx of box.transactions) {
          if (!tx || typeof tx !== 'object') continue;
          if (!isValidDateStr(tx.date)) continue;
          if (tx.type !== 'deposit' && tx.type !== 'withdraw') continue;
          const amount = sanitizeCents(tx.amount, 0);
          if (amount <= 0) continue;
          const cleanTx = {
            id: typeof tx.id === 'string' && tx.id.trim() ? tx.id.trim() : generateId('tx'),
            date: tx.date,
            type: tx.type,
            amount
          };
          if (typeof tx.note === 'string' && tx.note.trim()) {
            cleanTx.note = tx.note.trim().slice(0, 120);
          }
          if (tx.isAdjustment === true) {
            cleanTx.isAdjustment = true;
          }
          transactions.push(cleanTx);
        }
      }

      const kind = box.kind === 'daily' ? 'daily' : 'reserve';

      boxes.push({
        id: typeof box.id === 'string' && box.id.trim() ? box.id.trim() : generateId('box'),
        name,
        kind,
        cdiPercent,
        goalAmount,
        transactions
      });
    }
  }

  // 4. Fatura rápida do Cartão de Crédito (defaults + mapa por competência 'YYYY-MM')
  const rawCardDefaults =
    rawExpenses.creditCardDefaults && typeof rawExpenses.creditCardDefaults === 'object'
      ? rawExpenses.creditCardDefaults
      : {};
  const creditCardDefaults = {
    dueDay: sanitizeDueDay(rawCardDefaults.dueDay, 10),
    dueInNextMonth:
      typeof rawCardDefaults.dueInNextMonth === 'boolean'
        ? rawCardDefaults.dueInNextMonth
        : false,
    cardName:
      typeof rawCardDefaults.cardName === 'string' && rawCardDefaults.cardName.trim()
        ? rawCardDefaults.cardName.trim().slice(0, 60)
        : 'Cartão de Crédito'
  };

  const creditCardBills = {};
  if (
    rawExpenses.creditCardBills &&
    typeof rawExpenses.creditCardBills === 'object' &&
    !Array.isArray(rawExpenses.creditCardBills)
  ) {
    for (const [ym, bill] of Object.entries(rawExpenses.creditCardBills)) {
      if (!YM_REGEX.test(ym) || !bill || typeof bill !== 'object') continue;
      const fallbackDueDay = sanitizeDueDay(bill.dueDay, creditCardDefaults.dueDay);
      const dueDate = isValidDateStr(bill.dueDate)
        ? bill.dueDate
        : buildDateForYearMonth(ym, fallbackDueDay, creditCardDefaults.dueInNextMonth);
      const dueDay = Number(dueDate.slice(8, 10));

      creditCardBills[ym] = {
        amount: sanitizeCents(bill.amount, 0),
        dueDate,
        dueDay,
        paid: typeof bill.paid === 'boolean' ? bill.paid : false,
        cardName:
          typeof bill.cardName === 'string' && bill.cardName.trim()
            ? bill.cardName.trim().slice(0, 60)
            : creditCardDefaults.cardName
      };
    }
  }

  return {
    income: { baseMonthly, baseReceivedByMonth, extras },
    expenses: { fixed, installments, variable, creditCardDefaults, creditCardBills },
    caixinhas: { cdiAnnualRate, boxes }
  };
}

/**
 * Ordena vigências de tarifa por data crescente.
 */
export function sortFareSchedules(schedules) {
  return [...schedules].sort((a, b) =>
    a.effectiveDate.localeCompare(b.effectiveDate)
  );
}

/**
 * Valida e sanitiza um objeto de estado/backup completo (v1 ou v2),
 * realizando migração automática sem perda de v1 -> v2 quando necessário.
 * Retorna { valid: true, sanitized, migratedFromV1 } ou { valid: false, error }.
 */
export function validateAndSanitizeState(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { valid: false, error: 'O arquivo JSON não contém um objeto de backup válido.' };
  }

  if (raw.version !== undefined && (typeof raw.version !== 'number' || raw.version < 1 || raw.version > SCHEMA_VERSION)) {
    return {
      valid: false,
      error: `Versão de backup não suportada (${raw.version}). Versão máxima suportada: ${SCHEMA_VERSION}.`
    };
  }

  const migratedFromV1 = raw.version !== SCHEMA_VERSION || !raw.finance || typeof raw.finance !== 'object';
  const defaults = createDefaultState();

  // 1. Tema, Paleta e Modo Privacidade
  const theme = ['auto', 'light', 'dark'].includes(raw.theme) ? raw.theme : 'auto';
  const palette = VALID_PALETTES.includes(raw.palette) ? raw.palette : 'floresta';
  const privacyMode = typeof raw.privacyMode === 'boolean' ? raw.privacyMode : false;

  // 2. Settings
  const settings = {
    includeTodayInProjection:
      typeof raw.settings?.includeTodayInProjection === 'boolean'
        ? raw.settings.includeTodayInProjection
        : true
  };

  // 3. Vigências de tarifas
  if (!Array.isArray(raw.fareSchedules) || raw.fareSchedules.length === 0) {
    return {
      valid: false,
      error: 'O backup precisa conter ao menos uma tabela de tarifas em "fareSchedules".'
    };
  }

  const sanitizedSchedules = [];
  for (const item of raw.fareSchedules) {
    if (!item || typeof item !== 'object') {
      return { valid: false, error: 'Entrada inválida encontrada em "fareSchedules".' };
    }
    if (!isValidDateStr(item.effectiveDate)) {
      return {
        valid: false,
        error: `Data de vigência inválida em "fareSchedules": "${item.effectiveDate}".`
      };
    }
    if (!Array.isArray(item.weekdays) || item.weekdays.length !== 7) {
      return {
        valid: false,
        error: `A grade semanal da vigência ${item.effectiveDate} deve ter exatamente 7 dias.`
      };
    }
    const cleanWeekdays = item.weekdays.map((val) => {
      const n = Number(val);
      return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
    });
    sanitizedSchedules.push({
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : generateId('sched'),
      effectiveDate: item.effectiveDate,
      label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 80) : 'Tarifa',
      weekdays: cleanWeekdays
    });
  }

  // 4. Exceções diárias
  const sanitizedExceptions = {};
  if (raw.exceptions && typeof raw.exceptions === 'object' && !Array.isArray(raw.exceptions)) {
    for (const [dateStr, ex] of Object.entries(raw.exceptions)) {
      if (!isValidDateStr(dateStr) || !ex || typeof ex !== 'object') continue;
      if (!VALID_EXCEPTION_TYPES.has(ex.type)) continue;
      const cleanEx = { type: ex.type };
      if (ex.type === 'valor_personalizado') {
        const c = Number(ex.customCents);
        cleanEx.customCents = Number.isFinite(c) && c >= 0 ? Math.round(c) : 0;
      }
      if (typeof ex.note === 'string' && ex.note.trim()) {
        cleanEx.note = ex.note.trim().slice(0, 120);
      }
      sanitizedExceptions[dateStr] = cleanEx;
    }
  }

  // 5. Recargas efetivas mensais
  const sanitizedRecharges = {};
  if (raw.monthlyRecharges && typeof raw.monthlyRecharges === 'object' && !Array.isArray(raw.monthlyRecharges)) {
    for (const [ym, val] of Object.entries(raw.monthlyRecharges)) {
      if (!YM_REGEX.test(ym)) continue;
      const c = Number(val);
      if (Number.isFinite(c) && c >= 0) {
        sanitizedRecharges[ym] = Math.round(c);
      }
    }
  }

  // 6. Saldo do cartão
  const cardCents = Number(raw.cardBalance?.cents);
  const sanitizedCardBalance = {
    cents: Number.isFinite(cardCents) && cardCents >= 0 ? Math.round(cardCents) : 0,
    updatedAt: typeof raw.cardBalance?.updatedAt === 'string' ? raw.cardBalance.updatedAt : null
  };

  // 7. Overrides de feriados embutidos
  const sanitizedOverrides = {};
  if (raw.holidayOverrides && typeof raw.holidayOverrides === 'object' && !Array.isArray(raw.holidayOverrides)) {
    for (const [key, ov] of Object.entries(raw.holidayOverrides)) {
      if (!ov || typeof ov !== 'object') continue;
      const cleanOv = {};
      if (typeof ov.enabled === 'boolean') cleanOv.enabled = ov.enabled;
      if (typeof ov.name === 'string' && ov.name.trim()) cleanOv.name = ov.name.trim().slice(0, 80);
      if (ov.effect === 'zero' || ov.effect === 'meia_viagem') cleanOv.effect = ov.effect;
      if (Object.keys(cleanOv).length > 0) {
        sanitizedOverrides[key] = cleanOv;
      }
    }
  }

  // 8. Feriados manuais / emendas / recessos
  const sanitizedCustomHolidays = [];
  if (Array.isArray(raw.customHolidays)) {
    for (const ch of raw.customHolidays) {
      if (!ch || typeof ch !== 'object') continue;
      if (!isValidDateStr(ch.startDate)) continue;
      const endDate = isValidDateStr(ch.endDate) && ch.endDate >= ch.startDate
        ? ch.endDate
        : ch.startDate;
      sanitizedCustomHolidays.push({
        id: typeof ch.id === 'string' && ch.id.trim() ? ch.id.trim() : generateId('hol'),
        name: typeof ch.name === 'string' && ch.name.trim() ? ch.name.trim().slice(0, 80) : 'Feriado / Recesso',
        startDate: ch.startDate,
        endDate,
        enabled: typeof ch.enabled === 'boolean' ? ch.enabled : true,
        category: typeof ch.category === 'string' && ch.category.trim() ? ch.category.trim().slice(0, 40) : 'Manual',
        effect: ch.effect === 'meia_viagem' ? 'meia_viagem' : 'zero'
      });
    }
  }

  // 9. Domínio Financeiro Pessoal (v2) — migração automática com fallback seguro para v1
  const sanitizedFinance = sanitizeFinanceState(raw.finance);

  return {
    valid: true,
    migratedFromV1,
    sanitized: {
      ...defaults,
      version: SCHEMA_VERSION,
      theme,
      palette,
      privacyMode,
      settings,
      fareSchedules: sortFareSchedules(sanitizedSchedules),
      exceptions: sanitizedExceptions,
      monthlyRecharges: sanitizedRecharges,
      cardBalance: sanitizedCardBalance,
      holidayOverrides: sanitizedOverrides,
      customHolidays: sanitizedCustomHolidays,
      finance: sanitizedFinance
    }
  };
}

/**
 * Carrega o estado do localStorage com migração automática v1 -> v2
 * e fallback seguro para o estado padrão.
 */
export function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return createDefaultState();
    const parsed = JSON.parse(stored);
    const result = validateAndSanitizeState(parsed);
    if (result.valid) {
      if (result.migratedFromV1) {
        saveState(result.sanitized);
      }
      return result.sanitized;
    }
    return createDefaultState();
  } catch {
    return createDefaultState();
  }
}

/**
 * Persiste o estado completo no localStorage.
 */
export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.error('Erro ao salvar no localStorage:', err);
    return false;
  }
}

/**
 * Gera payload de exportação (v2 completo) e dispara o download de arquivo .json com data no nome.
 */
export function exportStateAsJSON(state) {
  const payload = {
    ...state,
    version: SCHEMA_VERSION,
    exportedAt: getCurrentDateTimeLabel()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bolsito-backup-${getTodayStr()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Reseta o estado no localStorage retornando o estado padrão limpo.
 */
export function resetState() {
  const fresh = createDefaultState();
  saveState(fresh);
  return fresh;
}
