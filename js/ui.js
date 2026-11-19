/**
 * Camada de Renderização (UI) da Calculadora de Passagens.
 * Responsável por renderizar o calendário, painéis de métricas, saldo do cartão,
 * seletor de intervalo, visão anual (gráfico CSS + tabela), tarifas, feriados e modais.
 */

import {
  formatDisplayDate,
  formatDisplayDateWithWeekday,
  getBuiltInHolidaysForYear,
  getTodayStr,
  MONTH_NAMES,
  MONTH_NAMES_SHORT,
  splitDateStr,
  WEEKDAY_NAMES_SHORT
} from './holidays.js';
import { centsToInputValue, formatBRL, sortFareSchedules, VALID_PALETTES } from './state.js';
import { getActiveFareSchedule } from './calculator.js';

/**
 * Escapa texto de usuário antes de inserir em HTML.
 */
export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const ICON_SUN_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2" />
    <path d="M12 20v2" />
    <path d="m4.93 4.93 1.41 1.41" />
    <path d="m17.66 17.66 1.41 1.41" />
    <path d="M2 12h2" />
    <path d="M20 12h2" />
    <path d="m6.34 17.66-1.41 1.41" />
    <path d="m19.07 4.93-1.41 1.41" />
  </svg>
`;

const ICON_MOON_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
`;

const ICON_EYE_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
`;

const ICON_EYE_OFF_SVG = `
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" />
    <path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />
    <path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" />
    <path d="m2 2 20 20" />
  </svg>
`;

const VIEW_HEADERS = {
  dashboard: { kicker: '01 / VISÃO GERAL', title: 'Dashboard' },
  flow: { kicker: '02 / FLUXO MENSAL', title: 'Despesas & Rendas' },
  caixinhas: { kicker: '03 / RESERVAS', title: 'Caixinhas CDI' },
  monthly: { kicker: '04 / CONTROLE DIÁRIO', title: 'Visão Mensal' },
  annual: { kicker: '05 / PANORAMA ANUAL', title: 'Visão Anual' },
  fares: { kicker: '06 / VIGÊNCIAS', title: 'Tarifas e Histórico' },
  holidays: { kicker: '07 / CALENDÁRIO OFICIAL', title: 'Feriados e Recessos' },
  backup: { kicker: '08 / SISTEMA', title: 'Backup e Configurações' }
};

const MOBILE_SECONDARY_VIEWS = new Set(['annual', 'fares', 'holidays', 'backup']);

const PALETTE_THEME_COLORS = {
  floresta: { light: '#263529', dark: '#0e110e' },
  editorial: { light: '#1d1e1c', dark: '#10100f' },
  ardosia: { light: '#181e29', dark: '#0b0e14' },
  cafe: { light: '#2c1f1a', dark: '#120d0b' },
  ameixa: { light: '#2b1e33', dark: '#110c14' }
};

/**
 * Aplica tema claro/escuro e paleta de cores no elemento raiz, sincronizando os controles.
 */
export function applyTheme(themePref, palettePref = 'floresta') {
  const prefersDark =
    window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const effectiveTheme =
    themePref === 'dark' || (themePref === 'auto' && prefersDark) ? 'dark' : 'light';
  const safePalette = VALID_PALETTES.includes(palettePref) ? palettePref : 'floresta';

  document.documentElement.setAttribute('data-theme', effectiveTheme);
  document.documentElement.setAttribute('data-palette', safePalette);

  const iconEl = document.getElementById('theme-icon');
  if (iconEl) {
    iconEl.innerHTML = effectiveTheme === 'dark' ? ICON_SUN_SVG : ICON_MOON_SVG;
  }

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    const colorMap = PALETTE_THEME_COLORS[safePalette] || PALETTE_THEME_COLORS.floresta;
    metaTheme.setAttribute('content', colorMap[effectiveTheme]);
  }

  const selectTheme = document.getElementById('select-theme-pref');
  if (selectTheme) {
    selectTheme.value = themePref;
  }

  document.querySelectorAll('[data-theme-pref]').forEach((btn) => {
    const isActive = btn.dataset.themePref === themePref;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  document.querySelectorAll('[data-palette-choice]').forEach((card) => {
    const isActive = card.dataset.paletteChoice === safePalette;
    card.classList.toggle('is-active', isActive);
    card.setAttribute('aria-pressed', String(isActive));
  });
}

/**
 * Aplica o Modo Privacidade (mascaramento com blur em todos os valores monetários).
 */
export function applyPrivacyMode(enabled) {
  const isPrivate = Boolean(enabled);
  document.documentElement.setAttribute('data-privacy', isPrivate ? 'on' : 'off');

  const btn = document.getElementById('btn-privacy-toggle');
  const iconEl = document.getElementById('privacy-icon');
  if (btn) {
    btn.classList.toggle('is-privacy-active', isPrivate);
    btn.setAttribute('aria-pressed', String(isPrivate));
    btn.title = isPrivate
      ? 'Modo Privacidade ativo — clique ou pressione P para mostrar valores'
      : 'Modo Privacidade (tecla P)';
  }
  if (iconEl) {
    iconEl.innerHTML = isPrivate ? ICON_EYE_OFF_SVG : ICON_EYE_SVG;
  }
}

/**
 * Exibe notificação flutuante temporária (toast).
 */
export function showToast(message, variant = 'default') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${variant === 'error' ? 'toast-error' : variant === 'success' ? 'toast-success' : ''}`;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.2s ease';
    setTimeout(() => toast.remove(), 220);
  }, 2800);
}

/**
 * Alterna a aba/seção ativa.
 */
export function setActiveView(viewName) {
  document.querySelectorAll('.nav-tab[data-view]').forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('is-active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  document.querySelectorAll('.mobile-more-item[data-view]').forEach((btn) => {
    const isActive = btn.dataset.view === viewName;
    btn.classList.toggle('is-active', isActive);
    if (isActive) {
      btn.setAttribute('aria-current', 'page');
    } else {
      btn.removeAttribute('aria-current');
    }
  });

  const moreBtn = document.getElementById('btn-mobile-more-nav');
  if (moreBtn) {
    moreBtn.classList.toggle('is-active', MOBILE_SECONDARY_VIEWS.has(viewName));
  }

  document.querySelectorAll('.view-section').forEach((sec) => {
    sec.classList.toggle('is-active', sec.id === `view-${viewName}`);
  });

  const headerInfo = VIEW_HEADERS[viewName] || VIEW_HEADERS.monthly;
  const kickerEl = document.getElementById('editorial-kicker');
  const titleEl = document.getElementById('editorial-view-title');
  const dateTextEl = document.getElementById('editorial-date-text');

  if (kickerEl) kickerEl.textContent = headerInfo.kicker;
  if (titleEl) titleEl.textContent = headerInfo.title;
  if (dateTextEl) {
    const { year, month, day } = splitDateStr(getTodayStr());
    dateTextEl.textContent = `${day} ${MONTH_NAMES_SHORT[month - 1].toLowerCase()} ${year}`;
  }
}

/**
 * Preenche os seletores de Mês e Ano do calendário mensal.
 */
export function populateMonthYearSelectors(selectedYear, selectedMonth) {
  const monthSelect = document.getElementById('select-month');
  const yearSelect = document.getElementById('select-year');
  if (!monthSelect || !yearSelect) return;

  if (monthSelect.options.length === 0) {
    MONTH_NAMES.forEach((name, idx) => {
      const opt = document.createElement('option');
      opt.value = String(idx + 1);
      opt.textContent = name;
      monthSelect.appendChild(opt);
    });
  }
  monthSelect.value = String(selectedMonth);

  const currentYear = Number(getTodayStr().slice(0, 4));
  const minYear = Math.min(currentYear - 3, selectedYear - 2);
  const maxYear = Math.max(currentYear + 5, selectedYear + 2);

  yearSelect.innerHTML = '';
  for (let y = minYear; y <= maxYear; y++) {
    const opt = document.createElement('option');
    opt.value = String(y);
    opt.textContent = String(y);
    yearSelect.appendChild(opt);
  }
  yearSelect.value = String(selectedYear);
}

/**
 * Renderiza o painel sempre acessível de Saldo Atual do Cartão e Autonomia.
 */
export function renderCardBalance(projection, state) {
  const inputBalance = document.getElementById('input-card-balance');
  const updatedAtEl = document.getElementById('balance-updated-at');
  const metricsEl = document.getElementById('balance-metrics');
  const chkToday = document.getElementById('chk-include-today');
  const chkTodaySettings = document.getElementById('chk-include-today-settings');

  if (inputBalance && document.activeElement !== inputBalance) {
    inputBalance.value = centsToInputValue(projection.balanceCents);
  }

  if (updatedAtEl) {
    updatedAtEl.textContent = projection.updatedAt
      ? `Atualizado em ${projection.updatedAt}`
      : 'Informe seu saldo atual para calcular recarga e autonomia';
  }

  const includeToday = state.settings?.includeTodayInProjection !== false;
  if (chkToday) chkToday.checked = includeToday;
  if (chkTodaySettings) chkTodaySettings.checked = includeToday;

  if (!metricsEl) return;

  // Bloco 1: Saldo informado & Restante do mês atual
  const tile1 = `
    <div class="balance-metric-tile">
      <div class="metric-label">01 / RESTANTE NO MÊS</div>
      <div class="metric-value money">${formatBRL(projection.remainingMonthCostCents)}</div>
      <div class="metric-sub">
        ${projection.remainingMonthActiveDays} ${projection.remainingMonthActiveDays === 1 ? 'dia com transporte' : 'dias com transporte'}
        (${projection.includeToday ? 'a partir de hoje' : 'a partir de amanhã'})
      </div>
    </div>
  `;

  // Bloco 2: Quanto falta recarregar para fechar o mês atual (nunca negativo)
  let tile2;
  if (projection.rechargeNeededThisMonthCents > 0) {
    tile2 = `
      <div class="balance-metric-tile tile-warning">
        <div class="metric-label">02 / RECARGA</div>
        <div class="metric-value money">${formatBRL(projection.rechargeNeededThisMonthCents)}</div>
        <div class="metric-sub">
          Falta recarregar para cobrir os dias restantes
          <small class="metric-sub metric-footnote">Baseado na estimativa do mês corrente</small>
        </div>
      </div>
    `;
  } else {
    tile2 = `
      <div class="balance-metric-tile tile-success">
        <div class="metric-label">02 / RECARGA</div>
        <div class="metric-value money">R$ 0,00</div>
        <div class="metric-sub">
          Mês atual coberto • sobra prevista: <strong>${formatBRL(projection.projectedMonthEndSurplusCents)}</strong>
          <small class="metric-sub metric-footnote">Baseado na estimativa do mês corrente</small>
        </div>
      </div>
    `;
  }

  // Bloco 3: Autonomia ("Seu saldo dura até")
  let autonomyTitle = '03 / AUTONOMIA';
  let autonomyValue = '--';
  let autonomySub = '';
  let autonomyClass = 'tile-accent';

  if (projection.exceededHorizon) {
    autonomyValue = 'Mais de 2 anos';
    autonomySub = 'Sem gastos futuros suficientes para esgotar o saldo';
    autonomyClass = 'tile-success';
  } else if (projection.coveredActiveDays === 0) {
    autonomyClass = 'tile-danger';
    autonomyValue = projection.balanceCents === 0 ? 'Saldo zerado' : 'Insuficiente';
    autonomySub = projection.firstUncoveredActiveDate
      ? `Próximo gasto em ${formatDisplayDate(projection.firstUncoveredActiveDate)} (${formatBRL(projection.firstUncoveredCostCents)}; faltam ${formatBRL(projection.shortfallOnFirstUncoveredCents)})`
      : 'Nenhum dia com gasto previsto';
  } else {
    const endDateLabel = projection.lastCoveredDate
      ? formatDisplayDateWithWeekday(projection.lastCoveredDate)
      : '--';
    autonomyValue = endDateLabel;
    const leftoverText =
      projection.leftoverCents > 0
        ? ` • troco de ${formatBRL(projection.leftoverCents)}`
        : '';
    const nextNeedText = projection.firstUncoveredActiveDate
      ? ` • recarregar p/ ${formatDisplayDate(projection.firstUncoveredActiveDate)}`
      : '';
    autonomySub = `Cobre ${projection.coveredActiveDays} ${projection.coveredActiveDays === 1 ? 'dia ativo' : 'dias ativos'}${leftoverText}${nextNeedText}`;
  }

  const tile3 = `
    <div class="balance-metric-tile ${autonomyClass}">
      <div class="metric-label">${autonomyTitle}</div>
      <div class="metric-value">${autonomyValue}</div>
      <div class="metric-sub">${autonomySub}</div>
    </div>
  `;

  metricsEl.innerHTML = tile1 + tile2 + tile3;
}

/**
 * Renderiza a barra de dica de modo ativo (clique rápido / intervalo) e o painel de intervalo.
 */
export function renderCalendarInteractionState(uiState, rangeSummary) {
  // Atualiza botões de modo de clique
  document.querySelectorAll('.mode-btn').forEach((btn) => {
    const isActive = !uiState.rangeMode && btn.dataset.clickMode === uiState.clickMode;
    btn.classList.toggle('is-active', isActive);
  });

  const rangeToggleBtn = document.getElementById('btn-toggle-range-mode');
  if (rangeToggleBtn) {
    rangeToggleBtn.setAttribute('aria-pressed', String(uiState.rangeMode));
  }

  // Dica contextual
  const hintEl = document.getElementById('calendar-mode-hint');
  if (hintEl) {
    if (uiState.rangeMode) {
      hintEl.classList.remove('hidden');
      if (!uiState.rangeStart) {
        hintEl.textContent = 'Modo Intervalo ativo: clique na data inicial no calendário.';
      } else if (!uiState.rangeEnd) {
        hintEl.textContent = `Início selecionado (${formatDisplayDate(uiState.rangeStart)}). Agora clique na data final (você pode mudar de mês).`;
      } else {
        hintEl.textContent = `Intervalo ativo: ${formatDisplayDate(uiState.rangeStart)} até ${formatDisplayDate(uiState.rangeEnd)}. Clique em qualquer data para iniciar uma nova seleção.`;
      }
    } else if (uiState.clickMode !== 'popover') {
      hintEl.classList.remove('hidden');
      const labels = {
        nao_gastei: 'Clique rápido ativo: cada clique marca o dia como "Não gastei (R$ 0,00)".',
        meia_viagem: 'Clique rápido ativo: cada clique marca o dia como "Meia viagem (50%)".',
        normal: 'Clique rápido ativo: cada clique restaura o dia para o padrão Normal.'
      };
      hintEl.textContent = labels[uiState.clickMode] || '';
    } else {
      hintEl.classList.add('hidden');
      hintEl.textContent = '';
    }
  }

  // Painel de intervalo
  const rangePanel = document.getElementById('range-panel');
  const startInput = document.getElementById('input-range-start');
  const endInput = document.getElementById('input-range-end');
  const summaryEl = document.getElementById('range-summary-content');

  const showRangePanel = uiState.rangeMode || Boolean(uiState.rangeStart || uiState.rangeEnd);
  if (rangePanel) {
    rangePanel.classList.toggle('hidden', !showRangePanel);
  }

  if (startInput && startInput.value !== (uiState.rangeStart || '')) {
    startInput.value = uiState.rangeStart || '';
  }
  if (endInput && endInput.value !== (uiState.rangeEnd || '')) {
    endInput.value = uiState.rangeEnd || '';
  }

  if (!summaryEl) return;

  if (!rangeSummary) {
    summaryEl.innerHTML =
      'Selecione uma data inicial e uma data final no calendário (inclusive cruzando meses) ou preencha os campos acima.';
    return;
  }

  let rechargeHtml;
  if (rangeSummary.isPastOnly) {
    rechargeHtml = `
      <div class="range-stat">
        <span>Status do período</span>
        <strong>Período passado</strong>
      </div>
    `;
  } else if (rangeSummary.rechargeNeededCents > 0) {
    const labelSuffix = rangeSummary.startsInFutureOrToday ? '' : ' (parcela restante)';
    rechargeHtml = `
      <div class="range-stat">
        <span>Falta recarregar${labelSuffix}</span>
        <strong class="money text-warning">${formatBRL(rangeSummary.rechargeNeededCents)}</strong>
      </div>
    `;
  } else {
    rechargeHtml = `
      <div class="range-stat">
        <span>Coberto pelo saldo!</span>
        <strong class="money text-success">Sobra ${formatBRL(rangeSummary.surplusAfterRangeCents)}</strong>
      </div>
    `;
  }

  const truncatedWarning = rangeSummary.truncated
    ? `<p class="helper-text text-warning">Intervalo limitado aos primeiros ${rangeSummary.totalDays} dias para manter o desempenho.</p>`
    : '';

  summaryEl.innerHTML = `
    <div class="range-stats-grid">
      <div class="range-stat">
        <span>Período (${rangeSummary.totalDays} dias)</span>
        <strong>${formatDisplayDate(rangeSummary.startDate)} → ${formatDisplayDate(rangeSummary.endDate)}</strong>
      </div>
      <div class="range-stat">
        <span>Dias no intervalo</span>
        <strong>${rangeSummary.activeDays} com gasto • ${rangeSummary.holidayDays} fer. • ${rangeSummary.zeroedDays} zerados</strong>
      </div>
      <div class="range-stat">
        <span>Total necessário</span>
        <strong class="money">${formatBRL(rangeSummary.totalCents)}</strong>
      </div>
      ${rechargeHtml}
    </div>
    ${truncatedWarning}
  `;
}

/**
 * Renderiza a grade interativa de dias do calendário mensal.
 */
export function renderCalendarGrid(monthData, uiState) {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const todayStr = getTodayStr();
  const firstDow = monthData.days[0].dayOfWeek; // 0 (Dom) .. 6 (Sáb)

  let normalizedStart = uiState.rangeStart || null;
  let normalizedEnd = uiState.rangeEnd || null;
  if (normalizedStart && normalizedEnd && normalizedStart > normalizedEnd) {
    [normalizedStart, normalizedEnd] = [normalizedEnd, normalizedStart];
  }

  const fragments = [];

  // Células vazias antes do dia 1
  for (let i = 0; i < firstDow; i++) {
    fragments.push('<div class="day-cell-empty" aria-hidden="true"></div>');
  }

  for (const day of monthData.days) {
    const dayNum = Number(day.dateStr.slice(8, 10));
    const isToday = day.dateStr === todayStr;

    let isInRange = false;
    let isRangeEdge = false;
    if (normalizedStart && normalizedEnd) {
      isInRange = day.dateStr >= normalizedStart && day.dateStr <= normalizedEnd;
      isRangeEdge = day.dateStr === normalizedStart || day.dateStr === normalizedEnd;
    } else if (normalizedStart) {
      isRangeEdge = day.dateStr === normalizedStart;
      isInRange = isRangeEdge;
    }

    let statusIndicatorHtml = '';
    if (day.status === 'feriado' || day.status === 'feriado_meia') {
      statusIndicatorHtml = '<span class="day-status-dot" aria-hidden="true"></span>';
    } else if (day.status === 'nao_gastei') {
      statusIndicatorHtml = '<span class="day-badge">R$ 0</span>';
    } else if (day.status === 'meia_viagem') {
      statusIndicatorHtml = '<span class="day-badge">50%</span>';
    } else if (day.status === 'valor_personalizado') {
      statusIndicatorHtml = '<span class="day-badge">Custom</span>';
    } else if (day.status === 'forcar_normal') {
      statusIndicatorHtml = '<span class="day-badge">Normal</span>';
    }

    const metaParts = [];
    if (day.holiday) metaParts.push(day.holiday.name);
    if (day.exception?.note) metaParts.push(day.exception.note);
    const metaText = metaParts.join(' • ');
    const hasNote = Boolean(day.exception?.note);

    const classes = [
      'day-cell',
      `status-${day.status}`,
      isToday ? 'is-today' : '',
      isInRange ? 'is-in-range' : '',
      isRangeEdge ? 'is-range-edge' : '',
      hasNote ? 'has-note' : ''
    ]
      .filter(Boolean)
      .join(' ');

    const ariaLabel = `${formatDisplayDateWithWeekday(day.dateStr)}: ${formatBRL(day.effectiveCents)}${metaText ? ` — ${metaText}` : ''}`;

    fragments.push(`
      <button
        type="button"
        class="${classes}"
        data-date="${day.dateStr}"
        aria-label="${escapeHtml(ariaLabel)}"
        title="${escapeHtml(ariaLabel)}"
      >
        <div class="day-cell-top">
          <span class="day-number">${dayNum}</span>
          ${statusIndicatorHtml}
        </div>
        <div class="day-value money"><span class="currency-prefix">R$&nbsp;</span>${centsToInputValue(day.effectiveCents)}</div>
        <div class="day-meta">${escapeHtml(metaText)}</div>
      </button>
    `);
  }

  grid.innerHTML = fragments.join('');
}

/**
 * Renderiza o painel lateral de resumo mensal, compensação mês a mês e métricas extras.
 */
export function renderMonthlySummary(monthData, yearSummary, cardProjection) {
  const titleEl = document.getElementById('monthly-summary-title');
  const badgeEl = document.getElementById('monthly-active-days-badge');
  const kpisEl = document.getElementById('monthly-kpis');
  const rechargeInput = document.getElementById('input-monthly-recharge');
  const clearRechargeBtn = document.getElementById('btn-clear-monthly-recharge');
  const carryInfoEl = document.getElementById('monthly-carry-info');
  const extraMetricsEl = document.getElementById('extra-metrics');

  if (titleEl) {
    titleEl.textContent = `${MONTH_NAMES[monthData.month - 1]} ${monthData.year}`;
  }
  if (badgeEl) {
    badgeEl.textContent = `${monthData.activeDaysCount} ${monthData.activeDaysCount === 1 ? 'dia ativo' : 'dias ativos'}`;
  }

  // Compensação vinda do mês anterior
  let compensationRow = '';
  if (monthData.previousCreditCents > 0) {
    compensationRow = `
      <div class="kpi-row">
        <span class="kpi-label">Crédito compensado (mês anterior)</span>
        <span class="kpi-value money text-success">- ${formatBRL(monthData.previousCreditCents)}</span>
      </div>
    `;
  } else if (monthData.previousCreditCents < 0) {
    compensationRow = `
      <div class="kpi-row">
        <span class="kpi-label">Déficit trazido (mês anterior)</span>
        <span class="kpi-value money text-danger">+ ${formatBRL(Math.abs(monthData.previousCreditCents))}</span>
      </div>
    `;
  } else {
    compensationRow = `
      <div class="kpi-row">
        <span class="kpi-label">Compensação do mês anterior</span>
        <span class="kpi-value money muted-text">R$ 0,00</span>
      </div>
    `;
  }

  if (kpisEl) {
    const ratioPct =
      monthData.predictedBaseCents > 0
        ? Math.min(100, Math.max(0, Math.round((monthData.actualTotalCents / monthData.predictedBaseCents) * 100)))
        : 0;
    const isOverBase = monthData.actualTotalCents > monthData.predictedBaseCents;

    kpisEl.innerHTML = `
      <div class="kpi-row">
        <span class="kpi-label">Previsto base do mês</span>
        <span class="kpi-value money">${formatBRL(monthData.predictedBaseCents)}</span>
      </div>
      <div class="kpi-row">
        <span class="kpi-label">Total ajustado / real do mês</span>
        <span class="kpi-value money">${formatBRL(monthData.actualTotalCents)}</span>
      </div>
      ${
        monthData.predictedBaseCents > 0
          ? `
        <div class="kpi-progress-wrap" aria-hidden="true">
          <div class="progress-track">
            <div class="progress-fill ${isOverBase ? 'is-warning' : ''}" style="width: ${ratioPct}%;"></div>
          </div>
          <span class="progress-caption">${ratioPct}% do previsto base</span>
        </div>
      `
          : ''
      }
      ${compensationRow}
      <div class="kpi-row kpi-highlight">
        <span class="kpi-label">Líquido necessário no mês</span>
        <span class="kpi-value money">${formatBRL(monthData.netNeededCents)}</span>
      </div>
    `;
  }

  // Recarga efetiva do mês
  if (rechargeInput && document.activeElement !== rechargeInput) {
    rechargeInput.value =
      monthData.recordedRechargeCents !== null
        ? centsToInputValue(monthData.recordedRechargeCents)
        : '';
  }
  if (clearRechargeBtn) {
    clearRechargeBtn.classList.toggle('hidden', monthData.recordedRechargeCents === null);
  }

  if (carryInfoEl) {
    const sourceLabel =
      monthData.recordedRechargeCents !== null
        ? `Com recarga efetiva de ${formatBRL(monthData.recordedRechargeCents)}`
        : `Usando orçamento previsto (${formatBRL(monthData.plannedDepositCents)})`;

    if (monthData.carryOutCents > 0) {
      carryInfoEl.innerHTML = `${sourceLabel}: gera <strong class="text-success">crédito de ${formatBRL(monthData.carryOutCents)}</strong> que abate automaticamente o mês seguinte.`;
    } else if (monthData.carryOutCents < 0) {
      carryInfoEl.innerHTML = `${sourceLabel}: gera <strong class="text-danger">déficit de ${formatBRL(Math.abs(monthData.carryOutCents))}</strong> acumulado para o mês seguinte.`;
    } else {
      carryInfoEl.textContent = `${sourceLabel}: saldo zerado na virada para o próximo mês.`;
    }
  }

  // Métricas Extras
  if (extraMetricsEl) {
    const { year: todayYear, month: todayMonth } = splitDateStr(getTodayStr());
    const isCurrentMonth = monthData.year === todayYear && monthData.month === todayMonth;

    const yearRatioPct =
      yearSummary.totalPredictedBaseCents > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round((yearSummary.totalActualCents / yearSummary.totalPredictedBaseCents) * 100)
            )
          )
        : 0;

    const monthDaysRatioPct =
      isCurrentMonth && monthData.activeDaysCount > 0
        ? Math.min(
            100,
            Math.max(
              0,
              Math.round(
                ((monthData.activeDaysCount - cardProjection.remainingMonthActiveDays) /
                  monthData.activeDaysCount) *
                  100
              )
            )
          )
        : 0;

    const remainingRow = isCurrentMonth
      ? `
        <div class="metric-item metric-item-with-bar">
          <div class="metric-item-top">
            <div>
              <span class="metric-item-label">Dias com transporte restantes</span>
              <span class="metric-item-sub">No mês atual (${cardProjection.includeToday ? 'incl. hoje' : 'a partir de amanhã'})</span>
            </div>
            <span class="metric-item-value">${cardProjection.remainingMonthActiveDays} dias</span>
          </div>
          ${
            monthData.activeDaysCount > 0
              ? `<div class="progress-track progress-track-sm" aria-hidden="true"><div class="progress-fill" style="width: ${monthDaysRatioPct}%;"></div></div>`
              : ''
          }
        </div>
      `
      : `
        <div class="metric-item">
          <div>
            <span class="metric-item-label">Dias restantes no mês atual</span>
            <span class="metric-item-sub">${MONTH_NAMES[todayMonth - 1]}/${todayYear}</span>
          </div>
          <span class="metric-item-value">${cardProjection.remainingMonthActiveDays} dias</span>
        </div>
      `;

    extraMetricsEl.innerHTML = `
      <div class="metric-item metric-item-with-bar">
        <div class="metric-item-top">
          <div>
            <span class="metric-item-label">Total de ${yearSummary.year} (Realizado)</span>
            <span class="metric-item-sub">Previsto base: ${formatBRL(yearSummary.totalPredictedBaseCents)}</span>
          </div>
          <span class="metric-item-value money">${formatBRL(yearSummary.totalActualCents)}</span>
        </div>
        ${
          yearSummary.totalPredictedBaseCents > 0
            ? `<div class="progress-track progress-track-sm" aria-hidden="true"><div class="progress-fill" style="width: ${yearRatioPct}%;"></div></div>`
            : ''
        }
      </div>

      <div class="metric-item">
        <div>
          <span class="metric-item-label">Economia no mês</span>
          <span class="metric-item-sub">Feriados: ${formatBRL(monthData.holidaySavingsCents)} • Manual: ${formatBRL(monthData.manualSavingsCents)}</span>
        </div>
        <span class="metric-item-value money text-success">${formatBRL(monthData.totalSavingsCents)}</span>
      </div>

      <div class="metric-item">
        <div>
          <span class="metric-item-label">Economia acumulada em ${yearSummary.year}</span>
          <span class="metric-item-sub">Feriados: ${formatBRL(yearSummary.totalHolidaySavingsCents)} • Manual: ${formatBRL(yearSummary.totalManualSavingsCents)}</span>
        </div>
        <span class="metric-item-value money text-success">${formatBRL(yearSummary.totalSavingsCents)}</span>
      </div>

      <div class="metric-item">
        <div>
          <span class="metric-item-label">Média real no mês</span>
          <span class="metric-item-sub">Por dia ativo: ${formatBRL(monthData.avgPerActiveDayCents)}</span>
        </div>
        <span class="metric-item-value money">${formatBRL(monthData.avgPerWeekCents)}/sem</span>
      </div>

      ${remainingRow}
    `;
  }
}

/**
 * Renderiza a Visão Anual: cards KPI, gráfico de barras CSS puro e tabela dos 12 meses.
 */
export function renderAnnualView(yearSummary) {
  const yearLabel = document.getElementById('annual-year-label');
  const kpisEl = document.getElementById('annual-kpis');
  const chartEl = document.getElementById('annual-chart');
  const tbodyEl = document.getElementById('annual-table-body');
  const tfootEl = document.getElementById('annual-table-foot');

  if (yearLabel) yearLabel.textContent = String(yearSummary.year);

  if (kpisEl) {
    kpisEl.innerHTML = `
      <div class="annual-kpi-card">
        <span>Previsto Base (${yearSummary.year})</span>
        <strong class="money">${formatBRL(yearSummary.totalPredictedBaseCents)}</strong>
        <small>Grade semanal descontando feriados</small>
      </div>
      <div class="annual-kpi-card">
        <span>Total Realizado (${yearSummary.year})</span>
        <strong class="money">${formatBRL(yearSummary.totalActualCents)}</strong>
        <small>${yearSummary.totalActiveDays} dias com transporte no ano</small>
      </div>
      <div class="annual-kpi-card">
        <span>Economia Total no Ano</span>
        <strong class="money text-success">${formatBRL(yearSummary.totalSavingsCents)}</strong>
        <small>Feriados: ${formatBRL(yearSummary.totalHolidaySavingsCents)} • Manual: ${formatBRL(yearSummary.totalManualSavingsCents)}</small>
      </div>
      <div class="annual-kpi-card">
        <span>Média Real de Gasto</span>
        <strong class="money">${formatBRL(yearSummary.avgPerWeekCents)}/sem</strong>
        <small>Por dia ativo: ${formatBRL(yearSummary.avgPerActiveDayCents)}</small>
      </div>
    `;
  }

  const { year: curYear, month: curMonth } = splitDateStr(getTodayStr());

  // Encontra o valor máximo entre previsto e real para escalar o gráfico proporcionalmente
  const maxBarCents = Math.max(
    1,
    ...yearSummary.months.map((m) => Math.max(m.predictedBaseCents, m.actualTotalCents))
  );

  if (chartEl) {
    const barsHtml = yearSummary.months
      .map((m, idx) => {
        const predPct = Math.max(2, Math.round((m.predictedBaseCents / maxBarCents) * 100));
        const actualPct = Math.max(2, Math.round((m.actualTotalCents / maxBarCents) * 100));
        const isCurrent = m.year === curYear && m.month === curMonth;
        const shortMoney =
          m.actualTotalCents >= 10000
            ? `R$${Math.round(m.actualTotalCents / 100)}`
            : formatBRL(m.actualTotalCents).replace('R$\u00a0', 'R$');
        const tooltipEdgeClass = idx <= 1 ? 'tooltip-left' : idx >= 10 ? 'tooltip-right' : '';

        return `
          <button
            type="button"
            class="bar-col ${isCurrent ? 'is-current-month' : ''} ${tooltipEdgeClass}"
            data-open-month="${m.month}"
            style="--bar-index: ${idx};"
            aria-label="${MONTH_NAMES[m.month - 1]} de ${m.year}: Real ${formatBRL(m.actualTotalCents)}, Previsto ${formatBRL(m.predictedBaseCents)}, Economia ${formatBRL(m.totalSavingsCents)}"
          >
            <div class="bar-tooltip" role="tooltip">
              <strong class="bar-tooltip-title">${MONTH_NAMES[m.month - 1]} ${m.year}</strong>
              <div class="bar-tooltip-row">
                <span>Real</span>
                <strong class="money">${formatBRL(m.actualTotalCents)}</strong>
              </div>
              <div class="bar-tooltip-row">
                <span>Previsto</span>
                <span class="money">${formatBRL(m.predictedBaseCents)}</span>
              </div>
              <div class="bar-tooltip-row">
                <span>Economia</span>
                <span class="money text-success">${formatBRL(m.totalSavingsCents)}</span>
              </div>
            </div>
            <span class="bar-amount money">${shortMoney}</span>
            <div class="bar-track">
              <div class="bar-pair">
                <div class="bar-fill-predicted" style="height: ${m.predictedBaseCents > 0 ? predPct : 0}%;"></div>
                <div class="bar-fill-actual" style="height: ${m.actualTotalCents > 0 ? actualPct : 0}%;"></div>
              </div>
            </div>
            <span class="bar-label">${MONTH_NAMES_SHORT[m.month - 1]}</span>
          </button>
        `;
      })
      .join('');

    chartEl.innerHTML = `
      <div class="chart-gridlines" aria-hidden="true">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <div class="chart-bars-row">${barsHtml}</div>
    `;
  }

  if (tbodyEl) {
    tbodyEl.innerHTML = yearSummary.months
      .map((m) => {
        const isCurrent = m.year === curYear && m.month === curMonth;
        let compCell = '<span class="muted-text">R$ 0,00</span>';
        if (m.previousCreditCents > 0) {
          compCell = `<span class="text-success">- ${formatBRL(m.previousCreditCents)}</span>`;
        } else if (m.previousCreditCents < 0) {
          compCell = `<span class="text-danger">+ ${formatBRL(Math.abs(m.previousCreditCents))}</span>`;
        }

        const rechargeTag =
          m.recordedRechargeCents !== null
            ? `<span class="pill pill-muted" title="Recarga efetiva informada">Rec. ${formatBRL(m.recordedRechargeCents)}</span>`
            : '';

        return `
          <tr class="${isCurrent ? 'is-current-month' : ''}" data-open-month="${m.month}" tabindex="0">
            <td>
              <strong>${MONTH_NAMES[m.month - 1]}</strong>
              ${isCurrent ? '<span class="pill pill-info">Atual</span>' : ''}
              ${rechargeTag}
            </td>
            <td class="num money">${formatBRL(m.predictedBaseCents)}</td>
            <td class="num money"><strong>${formatBRL(m.actualTotalCents)}</strong></td>
            <td class="num money text-success">${formatBRL(m.totalSavingsCents)}</td>
            <td class="num money">${compCell}</td>
            <td class="num money"><strong>${formatBRL(m.netNeededCents)}</strong></td>
          </tr>
        `;
      })
      .join('');
  }

  if (tfootEl) {
    tfootEl.innerHTML = `
      <tr>
        <td>Total de ${yearSummary.year}</td>
        <td class="num money">${formatBRL(yearSummary.totalPredictedBaseCents)}</td>
        <td class="num money">${formatBRL(yearSummary.totalActualCents)}</td>
        <td class="num money text-success">${formatBRL(yearSummary.totalSavingsCents)}</td>
        <td class="num muted-text">—</td>
        <td class="num money">${formatBRL(yearSummary.totalNetNeededCents)}</td>
      </tr>
    `;
  }
}

/**
 * Renderiza a aba Tarifas e Histórico de Vigências.
 */
export function renderFaresView(state) {
  const listEl = document.getElementById('fare-schedules-list');
  if (!listEl) return;

  const sorted = sortFareSchedules(state.fareSchedules);
  const todayStr = getTodayStr();
  const activeToday = getActiveFareSchedule(todayStr, sorted);

  // Ordem visual na listagem: mais recente primeiro
  const displayOrder = [...sorted].reverse();
  const dayDisplayOrder = [1, 2, 3, 4, 5, 6, 0]; // Seg..Dom

  listEl.innerHTML = displayOrder
    .map((sched) => {
      const isCurrent = activeToday && activeToday.id === sched.id;
      const isFuture = sched.effectiveDate > todayStr;
      const canDelete = sorted.length > 1;

      const statusPill = isCurrent
        ? '<span class="pill pill-active-fare">Vigente hoje</span>'
        : isFuture
          ? '<span class="pill pill-warning">Vigência futura</span>'
          : '<span class="pill pill-muted">Histórico anterior</span>';

      const chips = dayDisplayOrder
        .map(
          (dow) =>
            `<span class="day-chip"><strong>${WEEKDAY_NAMES_SHORT[dow]}</strong><span class="day-chip-value money">${formatBRL(sched.weekdays[dow])}</span></span>`
        )
        .join('');

      return `
        <article class="schedule-item ${isCurrent ? 'is-active-today' : ''}">
          <div class="schedule-item-top">
            <div>
              <div class="schedule-title-row">
                <strong>${escapeHtml(sched.label)}</strong>
                ${statusPill}
              </div>
              <p class="muted-text">Vigente a partir de <strong>${formatDisplayDate(sched.effectiveDate)}</strong></p>
            </div>
            <div class="holiday-row-actions">
              <button type="button" class="btn btn-outline btn-sm" data-edit-fare="${sched.id}">
                Editar
              </button>
              ${
                canDelete
                  ? `<button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-fare="${sched.id}">Excluir</button>`
                  : ''
              }
            </div>
          </div>
          <div class="schedule-weekdays-chips">${chips}</div>
        </article>
      `;
    })
    .join('');
}

/**
 * Renderiza a aba de Feriados (Embutidos do ano + Manuais/Emendas/Recessos).
 */
export function renderHolidaysView(year, state) {
  const yearLabel = document.getElementById('holidays-year-label');
  const builtInListEl = document.getElementById('builtin-holidays-list');
  const builtInCountEl = document.getElementById('holidays-builtin-count');
  const customListEl = document.getElementById('custom-holidays-list');
  const customCountEl = document.getElementById('holidays-custom-count');

  if (yearLabel) yearLabel.textContent = String(year);

  // 1. Embutidos (Brasil + Rio de Janeiro)
  const builtIns = getBuiltInHolidaysForYear(year, state.holidayOverrides || {});
  const activeCount = builtIns.filter((h) => h.enabled).length;
  if (builtInCountEl) {
    builtInCountEl.textContent = `${activeCount}/${builtIns.length} ativos`;
  }

  if (builtInListEl) {
    builtInListEl.innerHTML = builtIns
      .map((h) => {
        const effectBadge = h.enabled
          ? h.effect === 'meia_viagem'
            ? '<span class="pill pill-warning">Meia 50%</span>'
            : '<span class="pill pill-holiday">R$ 0,00</span>'
          : '<span class="pill pill-muted">Desativado</span>';
        const scopeBadge = `<span class="pill pill-muted">${escapeHtml(h.scope)}</span>`;

        return `
          <div class="holiday-row ${h.enabled ? '' : 'is-disabled'}">
            <div class="holiday-row-info">
              <div class="holiday-row-title">
                <span>${escapeHtml(h.name)}</span>
                ${scopeBadge}
              </div>
              <div class="holiday-row-meta">
                ${formatDisplayDateWithWeekday(h.date)} • ${h.type === 'movel' ? 'Data móvel' : 'Data fixa'}
              </div>
            </div>
            <div class="holiday-row-actions">
              ${effectBadge}
              <button
                type="button"
                class="btn btn-ghost btn-sm"
                data-edit-builtin-holiday="${h.key}"
                title="Editar nome ou efeito"
              >
                Editar
              </button>
              <label class="switch" title="${h.enabled ? 'Desativar feriado' : 'Ativar feriado'}">
                <input
                  type="checkbox"
                  data-toggle-builtin-holiday="${h.key}"
                  ${h.enabled ? 'checked' : ''}
                  aria-label="Ativar ${escapeHtml(h.name)}"
                />
                <span class="switch-slider"></span>
              </label>
            </div>
          </div>
        `;
      })
      .join('');
  }

  // 2. Manuais / Emendas / Férias
  const customs = [...(state.customHolidays || [])].sort((a, b) =>
    a.startDate.localeCompare(b.startDate)
  );

  if (customCountEl) {
    customCountEl.textContent = `${customs.length} ${customs.length === 1 ? 'item' : 'itens'}`;
  }

  if (customListEl) {
    if (customs.length === 0) {
      customListEl.innerHTML =
        '<p class="muted-text">Nenhum feriado manual, emenda ou recesso cadastrado ainda.</p>';
    } else {
      customListEl.innerHTML = customs
        .map((ch) => {
          const rangeText =
            ch.endDate && ch.endDate !== ch.startDate
              ? `${formatDisplayDate(ch.startDate)} até ${formatDisplayDate(ch.endDate)}`
              : formatDisplayDateWithWeekday(ch.startDate);
          const effectBadge = ch.enabled
            ? ch.effect === 'meia_viagem'
              ? '<span class="pill pill-warning">Meia 50%</span>'
              : '<span class="pill pill-holiday">R$ 0,00</span>'
            : '<span class="pill pill-muted">Desativado</span>';

          return `
            <div class="holiday-row ${ch.enabled ? '' : 'is-disabled'}">
              <div class="holiday-row-info">
                <div class="holiday-row-title">
                  <span>${escapeHtml(ch.name)}</span>
                  <span class="pill pill-muted">${escapeHtml(ch.category || 'Manual')}</span>
                </div>
                <div class="holiday-row-meta">${rangeText}</div>
              </div>
              <div class="holiday-row-actions">
                ${effectBadge}
                <button type="button" class="btn btn-ghost btn-sm" data-edit-custom-holiday="${ch.id}">
                  Editar
                </button>
                <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-custom-holiday="${ch.id}">
                  Excluir
                </button>
                <label class="switch" title="${ch.enabled ? 'Desativar' : 'Ativar'}">
                  <input
                    type="checkbox"
                    data-toggle-custom-holiday="${ch.id}"
                    ${ch.enabled ? 'checked' : ''}
                    aria-label="Ativar ${escapeHtml(ch.name)}"
                  />
                  <span class="switch-slider"></span>
                </label>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

/**
 * Renderiza informações de armazenamento na aba Backup e Configurações.
 */
export function renderBackupView(state) {
  const finance = state.finance || {};
  const cdiRate = finance.caixinhas?.cdiAnnualRate ?? 10.65;
  const baseIncomeCents = finance.income?.baseMonthly || 0;

  const baseIncomeInput = document.getElementById('input-config-base-income');
  if (baseIncomeInput && document.activeElement !== baseIncomeInput) {
    baseIncomeInput.value = centsToInputValue(baseIncomeCents);
  }

  const cdiRateInput = document.getElementById('input-config-cdi-rate');
  if (cdiRateInput && document.activeElement !== cdiRateInput) {
    cdiRateInput.value = Number(cdiRate).toFixed(2).replace('.', ',');
  }

  const statsEl = document.getElementById('storage-stats');
  if (!statsEl) return;

  const exceptionsCount = Object.keys(state.exceptions || {}).length;
  const rechargesCount = Object.keys(state.monthlyRecharges || {}).length;
  const schedulesCount = (state.fareSchedules || []).length;
  const customHolCount = (state.customHolidays || []).length;

  const fixedCount = (finance.expenses?.fixed || []).length;
  const instCount = (finance.expenses?.installments || []).length;
  const varCount = (finance.expenses?.variable || []).length;
  const cardBillsCount = Object.values(finance.expenses?.creditCardBills || {}).filter(
    (b) => b && b.amount > 0
  ).length;
  const extrasCount = (finance.income?.extras || []).length;
  const boxesCount = (finance.caixinhas?.boxes || []).length;

  statsEl.innerHTML = `
    <strong>Resumo dos dados salvos localmente (v${state.version || 2}):</strong><br />
    • Financeiro: ${fixedCount} ${fixedCount === 1 ? 'conta fixa' : 'contas fixas'} • ${cardBillsCount} ${cardBillsCount === 1 ? 'fatura de cartão' : 'faturas de cartão'} • ${instCount} ${instCount === 1 ? 'parcelamento' : 'parcelamentos'} • ${varCount} ${varCount === 1 ? 'gasto avulso' : 'gastos avulsos'} • ${extrasCount} ${extrasCount === 1 ? 'renda extra' : 'rendas extras'}<br />
    • Reservas: ${boxesCount} ${boxesCount === 1 ? 'caixinha' : 'caixinhas'} (CDI: <strong>${String(cdiRate).replace('.', ',')}% a.a.</strong>)<br />
    • Passagens: ${schedulesCount} ${schedulesCount === 1 ? 'vigência' : 'vigências'} • ${exceptionsCount} ${exceptionsCount === 1 ? 'exceção diária' : 'exceções diárias'} • ${rechargesCount} ${rechargesCount === 1 ? 'recarga registrada' : 'recargas registradas'} • ${customHolCount} ${customHolCount === 1 ? 'feriado manual' : 'feriados manuais'}<br />
    • Saldo atual do cartão: <strong class="money">${formatBRL(state.cardBalance?.cents || 0)}</strong>
  `;
}

/**
 * Abre e preenche o modal/popover compacto de edição rápida de um dia.
 */
export function openDayModal(dayCalc) {
  const backdrop = document.getElementById('day-modal-backdrop');
  const titleEl = document.getElementById('day-modal-title');
  const subtitleEl = document.getElementById('day-modal-subtitle');
  const holidayBanner = document.getElementById('day-modal-holiday-banner');
  const normalLabel = document.getElementById('btn-day-normal-label');
  const normalVal = document.getElementById('btn-day-normal-value');
  const halfVal = document.getElementById('btn-day-half-value');
  const customInput = document.getElementById('input-day-custom-value');
  const noteInput = document.getElementById('input-day-note');
  const clearBtn = document.getElementById('btn-day-clear-exception');

  if (!backdrop) return;

  titleEl.textContent = formatDisplayDateWithWeekday(dayCalc.dateStr);
  subtitleEl.textContent = `Tarifa base vigente: ${formatBRL(dayCalc.scheduledBaseCents)} (${dayCalc.schedule?.label || 'Sem tabela'}) • Atual: ${formatBRL(dayCalc.effectiveCents)}`;

  if (dayCalc.holiday) {
    holidayBanner.classList.remove('hidden');
    const effectDesc =
      dayCalc.holiday.effect === 'meia_viagem' ? 'Meia viagem (50%)' : 'Isento (R$ 0,00)';
    holidayBanner.textContent = `Feriado ativo: ${dayCalc.holiday.name} (${effectDesc})`;
    normalLabel.textContent = 'Forçar normal';
  } else {
    holidayBanner.classList.add('hidden');
    holidayBanner.textContent = '';
    normalLabel.textContent = 'Normal';
  }

  normalVal.textContent = formatBRL(dayCalc.scheduledBaseCents);
  halfVal.textContent = formatBRL(Math.round(dayCalc.scheduledBaseCents / 2));

  // Destaca qual opção está selecionada
  document.getElementById('btn-day-normal')?.classList.toggle(
    'is-selected',
    dayCalc.status === 'normal' || dayCalc.status === 'forcar_normal'
  );
  document.getElementById('btn-day-zero')?.classList.toggle(
    'is-selected',
    dayCalc.status === 'nao_gastei'
  );
  document.getElementById('btn-day-half')?.classList.toggle(
    'is-selected',
    dayCalc.status === 'meia_viagem'
  );

  if (customInput) {
    customInput.value =
      dayCalc.exception?.type === 'valor_personalizado'
        ? centsToInputValue(dayCalc.exception.customCents)
        : '';
  }

  if (noteInput) {
    noteInput.value = dayCalc.exception?.note || '';
  }

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !dayCalc.exception);
  }

  backdrop.classList.remove('hidden');
  document.getElementById('btn-day-zero')?.focus();
}

export function closeDayModal() {
  document.getElementById('day-modal-backdrop')?.classList.add('hidden');
}

/**
 * Abre modal para editar nome e efeito de um feriado embutido.
 */
export function openBuiltInHolidayModal(holidayItem) {
  const modal = document.getElementById('builtin-holiday-modal');
  if (!modal) return;
  document.getElementById('input-builtin-key').value = holidayItem.key;
  document.getElementById('input-builtin-name').value = holidayItem.name;
  document.getElementById('select-builtin-effect').value = holidayItem.effect;
  modal.classList.remove('hidden');
  document.getElementById('input-builtin-name').focus();
}

export function closeBuiltInHolidayModal() {
  document.getElementById('builtin-holiday-modal')?.classList.add('hidden');
}
