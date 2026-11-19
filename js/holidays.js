/**
 * Motor de Feriados 100% Offline (Brasil + Rio de Janeiro)
 * e utilitários seguros de datas locais (YYYY-MM-DD, sem deslocamento UTC).
 */

export const WEEKDAY_NAMES_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WEEKDAY_NAMES_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado'
];

export const MONTH_NAMES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro'
];

export const MONTH_NAMES_SHORT = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
];

// ============================================================
// Utilitários de Data Local (NUNCA usar new Date('YYYY-MM-DD'))
// ============================================================

export function pad2(num) {
  return String(num).padStart(2, '0');
}

export function isValidDateStr(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const check = new Date(y, m - 1, d, 12, 0, 0);
  return (
    check.getFullYear() === y &&
    check.getMonth() === m - 1 &&
    check.getDate() === d
  );
}

/**
 * Converte 'YYYY-MM-DD' para objeto Date local às 12:00:00.
 * Usar meio-dia evita problemas de mudança de horário de verão (DST)
 * ao somar ou subtrair dias.
 */
export function parseLocalDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function formatLocalDate(year, month, day) {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function dateToStr(date) {
  return formatLocalDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate()
  );
}

export function getTodayStr() {
  return dateToStr(new Date());
}

export function getCurrentDateTimeLabel() {
  const now = new Date();
  return `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}/${now.getFullYear()} às ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function addDaysStr(dateStr, deltaDays) {
  const dt = parseLocalDate(dateStr);
  dt.setDate(dt.getDate() + deltaDays);
  return dateToStr(dt);
}

export function getDayOfWeek(dateStr) {
  return parseLocalDate(dateStr).getDay(); // 0 = Dom .. 6 = Sáb
}

export function getDaysInMonth(year, month) {
  // month: 1..12
  return new Date(year, month, 0).getDate();
}

export function getYearMonthKey(year, month) {
  return `${year}-${pad2(month)}`;
}

export function splitDateStr(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

export function formatDisplayDate(dateStr) {
  if (!isValidDateStr(dateStr)) return '--/--/----';
  const { year, month, day } = splitDateStr(dateStr);
  return `${pad2(day)}/${pad2(month)}/${year}`;
}

export function formatShortDayMonth(dateStr) {
  if (!isValidDateStr(dateStr)) return '--/--';
  const { month, day } = splitDateStr(dateStr);
  return `${pad2(day)}/${pad2(month)}`;
}

/**
 * Monta uma data ISO local ('YYYY-MM-DD') a partir de uma competência ('YYYY-MM'),
 * um dia do mês (1..31, ajustado ao último dia válido do mês) e flag opcional
 * `nextMonth` (true = vence no mês seguinte).
 */
export function buildDateForYearMonth(ym, day, nextMonth = false) {
  if (typeof ym !== 'string' || !/^\d{4}-\d{2}$/.test(ym)) {
    return getTodayStr();
  }
  const [rawYear, rawMonth] = ym.split('-').map(Number);
  let targetYear = rawYear;
  let targetMonth = rawMonth;
  if (nextMonth) {
    if (targetMonth === 12) {
      targetYear += 1;
      targetMonth = 1;
    } else {
      targetMonth += 1;
    }
  }
  const maxDay = getDaysInMonth(targetYear, targetMonth);
  const safeDay = Math.min(maxDay, Math.max(1, Math.round(Number(day) || 1)));
  return formatLocalDate(targetYear, targetMonth, safeDay);
}

export function formatDisplayDateWithWeekday(dateStr) {
  if (!isValidDateStr(dateStr)) return '--';
  const dow = getDayOfWeek(dateStr);
  return `${WEEKDAY_NAMES_SHORT[dow]}, ${formatDisplayDate(dateStr)}`;
}

export function diffDaysInclusive(startStr, endStr) {
  const start = parseLocalDate(startStr);
  const end = parseLocalDate(endStr);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((end.getTime() - start.getTime()) / msPerDay) + 1;
}

// ============================================================
// Algoritmo de Meeus / Jones / Butcher para o Domingo de Páscoa
// ============================================================

/**
 * Calcula a data do Domingo de Páscoa no calendário Gregoriano
 * para qualquer ano, retornando 'YYYY-MM-DD'.
 */
export function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = Março, 4 = Abril
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return formatLocalDate(year, month, day);
}

// ============================================================
// Catálogo Embutido de Feriados (Brasil + Rio de Janeiro)
// ============================================================

/**
 * Gera todos os feriados embutidos (fixos e móveis) para um ano específico,
 * aplicando as personalizações do usuário (enabled, name, effect).
 */
export function getBuiltInHolidaysForYear(year, holidayOverrides = {}) {
  const easter = getEasterDate(year);

  const definitions = [
    // Feriados Nacionais Fixos
    {
      key: 'ano_novo',
      date: formatLocalDate(year, 1, 1),
      defaultName: 'Confraternização Universal',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Feriado Municipal RJ
    {
      key: 'sao_sebastiao',
      date: formatLocalDate(year, 1, 20),
      defaultName: 'São Sebastião (Município do RJ)',
      scope: 'Municipal RJ',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Feriados Móveis (Carnaval e Cinzas)
    {
      key: 'carnaval_seg',
      date: addDaysStr(easter, -48),
      defaultName: 'Segunda-feira de Carnaval',
      scope: 'Facultativo',
      type: 'movel',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'carnaval_ter',
      date: addDaysStr(easter, -47),
      defaultName: 'Terça-feira de Carnaval (RJ)',
      scope: 'Estadual RJ',
      type: 'movel',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'cinzas',
      date: addDaysStr(easter, -46),
      defaultName: 'Quarta-feira de Cinzas',
      scope: 'Facultativo',
      type: 'movel',
      defaultEnabled: false, // Opcional/desligado por padrão; configurável como meia viagem ou feriado
      defaultEffect: 'meia_viagem'
    },
    // Semana Santa e Páscoa
    {
      key: 'sexta_santa',
      date: addDaysStr(easter, -2),
      defaultName: 'Sexta-feira Santa',
      scope: 'Nacional',
      type: 'movel',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'pascoa',
      date: easter,
      defaultName: 'Domingo de Páscoa',
      scope: 'Nacional',
      type: 'movel',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Abril (Nacional + Estadual RJ)
    {
      key: 'tiradentes',
      date: formatLocalDate(year, 4, 21),
      defaultName: 'Tiradentes',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'sao_jorge',
      date: formatLocalDate(year, 4, 23),
      defaultName: 'São Jorge (Estado do RJ)',
      scope: 'Estadual RJ',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Maio
    {
      key: 'trabalho',
      date: formatLocalDate(year, 5, 1),
      defaultName: 'Dia do Trabalho',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Corpus Christi
    {
      key: 'corpus_christi',
      date: addDaysStr(easter, 60),
      defaultName: 'Corpus Christi',
      scope: 'Nacional / Facultativo',
      type: 'movel',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    // Segundo Semestre (Fixos Nacionais)
    {
      key: 'independencia',
      date: formatLocalDate(year, 9, 7),
      defaultName: 'Independência do Brasil',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'aparecida',
      date: formatLocalDate(year, 10, 12),
      defaultName: 'Nossa Sra. Aparecida',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'finados',
      date: formatLocalDate(year, 11, 2),
      defaultName: 'Finados',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'republica',
      date: formatLocalDate(year, 11, 15),
      defaultName: 'Proclamação da República',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'consciencia_negra',
      date: formatLocalDate(year, 11, 20),
      defaultName: 'Dia de Zumbi e da Consciência Negra',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    },
    {
      key: 'natal',
      date: formatLocalDate(year, 12, 25),
      defaultName: 'Natal',
      scope: 'Nacional',
      type: 'fixo',
      defaultEnabled: true,
      defaultEffect: 'zero'
    }
  ];

  return definitions
    .map((def) => {
      const ov = holidayOverrides[def.key] || {};
      return {
        key: def.key,
        date: def.date,
        name: typeof ov.name === 'string' && ov.name.trim() ? ov.name.trim() : def.defaultName,
        defaultName: def.defaultName,
        scope: def.scope,
        type: def.type,
        enabled: typeof ov.enabled === 'boolean' ? ov.enabled : def.defaultEnabled,
        effect: ov.effect === 'meia_viagem' || ov.effect === 'zero' ? ov.effect : def.defaultEffect,
        isBuiltIn: true
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Retorna um Map<'YYYY-MM-DD', Array<HolidayItem>> com todos os feriados ATIVOS
 * (embutidos e manuais) que incidem em um determinado ano.
 */
export function buildActiveHolidayMapForYear(year, state) {
  const map = new Map();
  const addToMap = (dateStr, item) => {
    if (!map.has(dateStr)) {
      map.set(dateStr, []);
    }
    map.get(dateStr).push(item);
  };

  // 1. Feriados embutidos ativos
  const builtIns = getBuiltInHolidaysForYear(year, state.holidayOverrides || {});
  for (const h of builtIns) {
    if (h.enabled) {
      addToMap(h.date, h);
    }
  }

  // 2. Feriados, emendas e recessos manuais ativos (suporta data única ou intervalo)
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const customs = Array.isArray(state.customHolidays) ? state.customHolidays : [];

  for (const ch of customs) {
    if (!ch.enabled || !isValidDateStr(ch.startDate)) continue;
    const endDate = isValidDateStr(ch.endDate) && ch.endDate >= ch.startDate
      ? ch.endDate
      : ch.startDate;

    // Pula intervalos fora do ano solicitado
    if (endDate < yearStart || ch.startDate > yearEnd) continue;

    const clampedStart = ch.startDate < yearStart ? yearStart : ch.startDate;
    const clampedEnd = endDate > yearEnd ? yearEnd : endDate;

    let cursor = clampedStart;
    while (cursor <= clampedEnd) {
      addToMap(cursor, {
        id: ch.id,
        date: cursor,
        name: ch.name,
        scope: ch.category || 'Manual',
        type: ch.startDate === endDate ? 'manual' : 'recesso',
        enabled: true,
        effect: ch.effect === 'meia_viagem' ? 'meia_viagem' : 'zero',
        isBuiltIn: false
      });
      cursor = addDaysStr(cursor, 1);
    }
  }

  return map;
}

/**
 * Consulta o feriado ativo efetivo em uma data específica 'YYYY-MM-DD'.
 * Se houver mais de um feriado no mesmo dia (ex.: embutido + manual),
 * prioriza efeito 'zero' sobre 'meia_viagem' e combina os nomes.
 */
export function getActiveHolidayForDate(dateStr, state, yearCache = null) {
  const { year } = splitDateStr(dateStr);
  let yearMap;
  if (yearCache && yearCache.has(year)) {
    yearMap = yearCache.get(year);
  } else {
    yearMap = buildActiveHolidayMapForYear(year, state);
    if (yearCache) {
      yearCache.set(year, yearMap);
    }
  }

  const list = yearMap.get(dateStr);
  if (!list || list.length === 0) return null;

  const hasZero = list.some((item) => item.effect === 'zero');
  return {
    date: dateStr,
    name: list.map((item) => item.name).join(' / '),
    scope: list[0].scope,
    effect: hasZero ? 'zero' : 'meia_viagem',
    items: list
  };
}

// ============================================================
// Dias Úteis Bancários Nacionais (Motor CDI 100% Offline)
// ============================================================

/**
 * Chaves do catálogo embutido que correspondem a feriados nacionais/bancários
 * (padrão ANBIMA / Febraban para contagem de 252 dias úteis/ano no CDI).
 * Feriados estaduais/municipais do RJ (São Sebastião, São Jorge), Quarta de Cinzas
 * e férias/recessos pessoais não suspendem o rendimento do CDI.
 */
export const NATIONAL_CDI_HOLIDAY_KEYS = new Set([
  'ano_novo',
  'carnaval_seg',
  'carnaval_ter',
  'sexta_santa',
  'tiradentes',
  'trabalho',
  'corpus_christi',
  'independencia',
  'aparecida',
  'finados',
  'republica',
  'consciencia_negra',
  'natal'
]);

/**
 * Retorna um Set<'YYYY-MM-DD'> com todos os feriados nacionais/bancários ATIVOS
 * em um determinado ano (reutilizando o motor offline de datas fixas e móveis).
 */
export function buildNationalBusinessHolidaySetForYear(year, holidayOverrides = {}) {
  const set = new Set();
  const builtIns = getBuiltInHolidaysForYear(year, holidayOverrides || {});
  for (const h of builtIns) {
    if (h.enabled && NATIONAL_CDI_HOLIDAY_KEYS.has(h.key)) {
      set.add(h.date);
    }
  }
  return set;
}

/**
 * Verifica se uma data 'YYYY-MM-DD' é dia útil bancário nacional
 * (segunda a sexta, excluindo feriados nacionais/bancários ativos).
 * Aceita um Map<year, Set<string>> opcional para cache O(1) em loops longos.
 */
export function isNationalBusinessDay(dateStr, state = {}, yearCache = null) {
  if (!isValidDateStr(dateStr)) return false;
  const dow = getDayOfWeek(dateStr);
  if (dow === 0 || dow === 6) return false;

  const { year } = splitDateStr(dateStr);
  let holidaySet;
  if (yearCache && yearCache.has(year)) {
    holidaySet = yearCache.get(year);
  } else {
    holidaySet = buildNationalBusinessHolidaySetForYear(year, state?.holidayOverrides || {});
    if (yearCache) {
      yearCache.set(year, holidaySet);
    }
  }

  return !holidaySet.has(dateStr);
}
