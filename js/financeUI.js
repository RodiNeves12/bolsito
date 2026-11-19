/**
 * Camada de Renderização do Domínio Financeiro do Bolsito.
 * Renderiza:
 * - 01 / Dashboard (4 KPIs Bento Grid, Donut SVG, Barras 12m, Pendências, Projeção CDI SVG)
 * - 02 / Despesas & Rendas (Renda fixa + extras, Contas Fixas + Passagens automático, Parcelamentos, Avulsos)
 * - 03 / Caixinhas CDI (Resumo consolidado, grid de caixinhas, modal de detalhes & simulador 1m/6m/12m)
 * - Modais de lançamento rápido e cadastros financeiros.
 *
 * 100% offline, SVG inline minimalista (zero emojis), tokens CSS do DESIGN_SYSTEM.md.
 */

import { calculateBoxProjection } from './cdiEngine.js';
import { addMonthsYM, EXPENSE_CATEGORIES, getCategoryMeta } from './financeEngine.js';
import {
  formatDisplayDate,
  formatShortDayMonth,
  getTodayStr,
  MONTH_NAMES
} from './holidays.js';
import { centsToInputValue, formatBRL } from './state.js';
import { escapeHtml } from './ui.js';

const ICON_ARROW_RIGHT_SVG = `
  <svg class="inline-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
`;

function formatPercentPT(num, decimals = 2) {
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toFixed(decimals).replace('.', ',');
}

function formatCompactMoney(cents) {
  const abs = Math.abs(cents);
  const sign = cents < 0 ? '-' : '';
  if (abs >= 100000000) {
    return `${sign}R$${(abs / 100000000).toFixed(1).replace('.', ',')}M`;
  }
  if (abs >= 100000) {
    return `${sign}R$${(abs / 100000).toFixed(1).replace('.', ',')}k`;
  }
  return `${sign}R$${Math.round(abs / 100)}`;
}

/**
 * Popula todos os <select> de categoria financeira da interface.
 */
export function populateCategorySelects() {
  const selectIds = [
    'input-quick-expense-category',
    'input-fixed-category',
    'input-installment-category',
    'filter-variable-category'
  ];

  for (const id of selectIds) {
    const sel = document.getElementById(id);
    if (!sel) continue;
    const isFilter = id === 'filter-variable-category';
    const currentValue = sel.value;

    const options = [];
    if (isFilter) {
      options.push('<option value="all">Todas as categorias</option>');
    }

    for (const cat of EXPENSE_CATEGORIES) {
      // Para gastos avulsos/fixos/parcelas, ainda permitimos Transporte caso haja gasto extra (ex.: Uber),
      // enquanto Passagens continua entrando automaticamente.
      options.push(`<option value="${cat.id}">${escapeHtml(cat.label)}</option>`);
    }

    sel.innerHTML = options.join('');
    if (isFilter) {
      sel.value = 'all';
      sel.selectedIndex = 0;
    } else if (currentValue && [...sel.options].some((o) => o.value === currentValue)) {
      sel.value = currentValue;
    } else if (id === 'input-installment-category') {
      sel.value = 'compras';
    } else {
      sel.value = 'alimentacao';
    }
  }
}

// ============================================================
// 01 / DASHBOARD (Bento Grid + Gráficos SVG Puros)
// ============================================================

export function renderDashboardView(
  financeMonth,
  finance12m,
  caixinhasSummary,
  uiState = {},
  netWorth = null
) {
  const monthLabelEl = document.getElementById('dashboard-month-label');
  if (monthLabelEl) {
    monthLabelEl.textContent = `${financeMonth.monthName} ${financeMonth.year}`;
  }

  renderDashboardNetWorth(netWorth, financeMonth);
  renderDashboardKpis(financeMonth, caixinhasSummary);
  renderCategoryDonutChart(financeMonth);
  renderEvolution12mChart(finance12m, financeMonth.ym, uiState.evolutionSeries);
  renderDashboardPendingList(financeMonth);
  renderCaixinhasProjectionChart(caixinhasSummary, uiState);
}

function renderDashboardNetWorth(netWorth, financeMonth) {
  const container = document.getElementById('dashboard-net-worth');
  if (!container || !netWorth) return;

  const isPositive = netWorth.netTotalCents >= 0;
  const parts = [
    `Caixinhas (<span class="money">${formatBRL(netWorth.totalRealTodayCents)}</span>)`
  ];
  if (netWorth.receivableIncomeCents > 0) {
    parts.push(`+ A receber (<span class="money">${formatBRL(netWorth.receivableIncomeCents)}</span>)`);
  }
  parts.push(`&minus; Pendências (<span class="money">${formatBRL(netWorth.pendingExpensesCents)}</span>)`);

  container.classList.toggle('is-negative', !isPositive);
  container.innerHTML = `
    <div class="net-worth-main">
      <div class="net-worth-heading-row">
        <span class="micro-label">PATRIMÔNIO DISPONÍVEL • TOTAL LÍQUIDO</span>
        <span class="pill pill-muted">${escapeHtml(financeMonth.monthName)} ${financeMonth.year}</span>
      </div>
      <strong class="net-worth-value money ${isPositive ? 'text-success' : 'text-danger'}">
        ${formatBRL(netWorth.netTotalCents)}
      </strong>
      <p class="net-worth-formula">${parts.join(' ')}</p>
    </div>

    <div class="net-worth-pillars">
      <div class="net-worth-pillar">
        <span>Caixinhas hoje</span>
        <strong class="money">${formatBRL(netWorth.totalRealTodayCents)}</strong>
      </div>
      <div class="net-worth-pillar">
        <span>A receber</span>
        <strong class="money ${netWorth.receivableIncomeCents > 0 ? 'text-success' : 'muted-text'}">
          ${netWorth.receivableIncomeCents > 0 ? '+' : ''}${formatBRL(netWorth.receivableIncomeCents)}
        </strong>
      </div>
      <div class="net-worth-pillar">
        <span>Pendências</span>
        <strong class="money ${netWorth.pendingExpensesCents > 0 ? 'text-warning' : 'text-success'}">
          ${netWorth.pendingExpensesCents > 0 ? '−' : ''}${formatBRL(netWorth.pendingExpensesCents)}
        </strong>
      </div>
    </div>
  `;
}

function renderDashboardKpis(financeMonth, caixinhasSummary) {
  const container = document.getElementById('dashboard-kpis');
  if (!container) return;

  const isPositiveBalance = financeMonth.freeBalanceCents >= 0;
  const balanceClass = isPositiveBalance ? 'kpi-tone-success' : 'kpi-tone-danger';
  const committedLabel =
    financeMonth.totalIncomeCents > 0
      ? `${financeMonth.committedPct}% da renda comprometida`
      : financeMonth.totalExpensesCents > 0
        ? 'Configure sua renda mensal fixa'
        : 'Sem movimentações no mês';

  const extrasSub =
    financeMonth.extrasTotalCents > 0
      ? `Base: ${formatBRL(financeMonth.baseMonthlyCents)} + Extras: ${formatBRL(financeMonth.extrasTotalCents)}`
      : financeMonth.baseMonthlyCents > 0
        ? 'Bolsa / renda mensal fixa configurada'
        : 'Defina sua renda em Fluxo ou Config';

  container.innerHTML = `
    <article class="annual-kpi-card fin-kpi-card">
      <span class="micro-label">01 / RENDA DO MÊS</span>
      <strong class="money">${formatBRL(financeMonth.totalIncomeCents)}</strong>
      <small class="privacy-mask">${extrasSub}</small>
    </article>

    <article class="annual-kpi-card fin-kpi-card">
      <span class="micro-label">02 / TOTAL DE DESPESAS</span>
      <strong class="money">${formatBRL(financeMonth.totalExpensesCents)}</strong>
      <small>
        Inclui <span class="money">${formatBRL(financeMonth.transportExpensesCents)}</span> em Passagens
        ${financeMonth.pendingExpensesCents > 0 ? `• Pendente: <span class="money text-warning">${formatBRL(financeMonth.pendingExpensesCents)}</span>` : '• Tudo pago'}
      </small>
    </article>

    <article class="annual-kpi-card fin-kpi-card ${balanceClass}">
      <span class="micro-label">03 / SALDO LIVRE</span>
      <strong class="money ${isPositiveBalance ? 'text-success' : 'text-danger'}">${formatBRL(financeMonth.freeBalanceCents)}</strong>
      <small>${committedLabel}</small>
    </article>

    <article class="annual-kpi-card fin-kpi-card">
      <span class="micro-label">04 / TOTAL NAS CAIXINHAS</span>
      <strong class="money">${formatBRL(caixinhasSummary.totalBalanceCents)}</strong>
      <small>
        ${
          caixinhasSummary.dailyCount > 0
            ? `Reservas: <span class="money">${formatBRL(caixinhasSummary.reserveBalanceCents)}</span> • Uso diário: <span class="money">${formatBRL(caixinhasSummary.dailyBalanceCents)}</span> • Mês: <span class="money text-success">+${formatBRL(caixinhasSummary.totalMonthYieldCents)}</span>`
            : `Rendimento no mês: <span class="money text-success">+${formatBRL(caixinhasSummary.totalMonthYieldCents)}</span> (${caixinhasSummary.boxes.length} ${caixinhasSummary.boxes.length === 1 ? 'caixinha' : 'caixinhas'})`
        }
      </small>
    </article>
  `;
}

function renderCategoryDonutChart(financeMonth) {
  const container = document.getElementById('dashboard-donut-container');
  const subtitleEl = document.getElementById('dashboard-donut-subtitle');
  if (!container) return;

  if (subtitleEl) {
    subtitleEl.textContent = `${financeMonth.monthName} ${financeMonth.year}`;
  }

  const breakdown = financeMonth.categoryBreakdown || [];
  if (breakdown.length === 0 || financeMonth.totalExpensesCents <= 0) {
    container.innerHTML = `
      <div class="empty-state-box">
        <p class="muted-text">Nenhuma despesa registrada em ${escapeHtml(financeMonth.monthName)} ${financeMonth.year}.</p>
        <button type="button" class="btn btn-outline btn-sm" data-open-quick-expense>
          + Registrar primeiro gasto
        </button>
      </div>
    `;
    return;
  }

  const radius = 56;
  const strokeWidth = 19;
  const circumference = 2 * Math.PI * radius;
  let cumulativeFraction = 0;

  const segmentsSvg = breakdown
    .map((item, idx) => {
      const fraction = item.amountCents / financeMonth.totalExpensesCents;
      const segLength = Math.max(2, fraction * circumference);
      const gap = breakdown.length > 1 ? 2.0 : 0;
      const dashLength = Math.max(1, segLength - gap);
      const dashOffset = -(cumulativeFraction * circumference);
      cumulativeFraction += fraction;

      return `
        <circle
          class="donut-segment"
          cx="80"
          cy="80"
          r="${radius}"
          fill="none"
          stroke="${item.colorVar}"
          stroke-width="${strokeWidth}"
          stroke-dasharray="${dashLength.toFixed(2)} ${circumference.toFixed(2)}"
          stroke-dashoffset="${dashOffset.toFixed(2)}"
          data-donut-idx="${idx}"
          data-label="${escapeHtml(item.label)}"
          data-value="${escapeHtml(formatBRL(item.amountCents))}"
          data-pct="${formatPercentPT(item.pct, 1)}%"
          tabindex="0"
        />
      `;
    })
    .join('');

  const legendHtml = breakdown
    .map(
      (item, idx) => `
      <div class="donut-legend-row" data-donut-idx="${idx}">
        <div class="donut-legend-left">
          <span class="cat-dot" style="background: ${item.colorVar};" aria-hidden="true"></span>
          <span class="donut-legend-name">${escapeHtml(item.label)}</span>
        </div>
        <div class="donut-legend-right">
          <strong class="money">${formatBRL(item.amountCents)}</strong>
          <span class="donut-legend-pct money">${formatPercentPT(item.pct, 1)}%</span>
        </div>
      </div>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="donut-layout">
      <div class="donut-svg-wrap">
        <svg viewBox="0 0 160 160" class="donut-svg" role="img" aria-label="Distribuição de despesas por categoria">
          <circle
            cx="80"
            cy="80"
            r="${radius}"
            fill="none"
            stroke="var(--bg-sub)"
            stroke-width="${strokeWidth}"
          />
          <g transform="rotate(-90 80 80)">
            ${segmentsSvg}
          </g>
        </svg>
        <div class="donut-center" id="donut-center-readout">
          <span class="donut-center-label">Total</span>
          <strong class="donut-center-value money">${formatBRL(financeMonth.totalExpensesCents)}</strong>
          <span class="donut-center-sub">${breakdown.length} ${breakdown.length === 1 ? 'categoria' : 'categorias'}</span>
        </div>
      </div>
      <div class="donut-legend">
        ${legendHtml}
      </div>
    </div>
  `;

  // Interação leve no hover/focus das fatias e itens da legenda
  const readout = container.querySelector('#donut-center-readout');
  const defaultHtml = readout ? readout.innerHTML : '';

  const highlightSlice = (idx) => {
    const item = breakdown[idx];
    if (!item || !readout) return;
    container.querySelectorAll('[data-donut-idx]').forEach((el) => {
      el.classList.toggle('is-highlighted', Number(el.dataset.donutIdx) === idx);
    });
    readout.innerHTML = `
      <span class="donut-center-label">${escapeHtml(item.label)}</span>
      <strong class="donut-center-value money">${formatBRL(item.amountCents)}</strong>
      <span class="donut-center-sub money">${formatPercentPT(item.pct, 1)}% do mês</span>
    `;
  };

  const resetHighlight = () => {
    container.querySelectorAll('[data-donut-idx]').forEach((el) => {
      el.classList.remove('is-highlighted');
    });
    if (readout) readout.innerHTML = defaultHtml;
  };

  container.querySelectorAll('[data-donut-idx]').forEach((el) => {
    const idx = Number(el.dataset.donutIdx);
    el.addEventListener('mouseenter', () => highlightSlice(idx));
    el.addEventListener('focus', () => highlightSlice(idx));
    el.addEventListener('mouseleave', resetHighlight);
    el.addEventListener('blur', resetHighlight);
  });
}

function renderEvolution12mChart(finance12m, activeYM, seriesState = null) {
  const chartEl = document.getElementById('dashboard-evolution-chart');
  if (!chartEl) return;

  const activeSeries = {
    income: seriesState ? seriesState.income !== false : true,
    expenses: seriesState ? seriesState.expenses !== false : true,
    contributions: seriesState ? seriesState.contributions !== false : true
  };

  // Sincroniza chips clicáveis da legenda
  document.querySelectorAll('.legend-chip[data-toggle-series]').forEach((chip) => {
    const key = chip.dataset.toggleSeries;
    const isOn = Boolean(activeSeries[key]);
    chip.classList.toggle('is-active', isOn);
    chip.setAttribute('aria-pressed', String(isOn));
  });

  // Recalcula escala máxima considerando APENAS as séries ativas
  let dynamicMax = 0;
  for (const m of finance12m.months) {
    if (activeSeries.income) dynamicMax = Math.max(dynamicMax, m.incomeCents);
    if (activeSeries.expenses) dynamicMax = Math.max(dynamicMax, m.expensesCents);
    if (activeSeries.contributions) dynamicMax = Math.max(dynamicMax, m.contributionsCents);
  }
  const maxCents = Math.max(1, dynamicMax);

  const barsHtml = finance12m.months
    .map((m, idx) => {
      const incPct =
        activeSeries.income && m.incomeCents > 0
          ? Math.max(3, Math.round((m.incomeCents / maxCents) * 100))
          : 0;
      const expPct =
        activeSeries.expenses && m.expensesCents > 0
          ? Math.max(3, Math.round((m.expensesCents / maxCents) * 100))
          : 0;
      const capPct =
        activeSeries.contributions && m.contributionsCents > 0
          ? Math.max(3, Math.round((m.contributionsCents / maxCents) * 100))
          : 0;
      const isActive = m.ym === activeYM;
      const tooltipEdgeClass = idx <= 1 ? 'tooltip-left' : idx >= 10 ? 'tooltip-right' : '';

      const barElements = [
        activeSeries.income ? `<div class="bar-fill-income" style="height: ${incPct}%;"></div>` : '',
        activeSeries.expenses ? `<div class="bar-fill-expense" style="height: ${expPct}%;"></div>` : '',
        activeSeries.contributions ? `<div class="bar-fill-contrib" style="height: ${capPct}%;"></div>` : ''
      ].join('');

      return `
        <button
          type="button"
          class="bar-col fin-bar-col ${isActive ? 'is-current-month' : ''} ${tooltipEdgeClass}"
          data-select-finance-ym="${m.ym}"
          style="--bar-index: ${idx};"
          aria-label="${escapeHtml(m.fullLabel)}: Receita ${formatBRL(m.incomeCents)}, Despesa ${formatBRL(m.expensesCents)}, Aportes ${formatBRL(m.contributionsCents)}"
        >
          <div class="bar-tooltip" role="tooltip">
            <strong class="bar-tooltip-title">${escapeHtml(m.fullLabel)}</strong>
            <div class="bar-tooltip-row">
              <span>Receita</span>
              <strong class="money text-success">${formatBRL(m.incomeCents)}</strong>
            </div>
            <div class="bar-tooltip-row">
              <span>Despesas</span>
              <strong class="money text-warning">${formatBRL(m.expensesCents)}</strong>
            </div>
            <div class="bar-tooltip-row">
              <span>Passagens</span>
              <span class="money">${formatBRL(m.transportCents)}</span>
            </div>
            <div class="bar-tooltip-row">
              <span>Aportes</span>
              <span class="money">${formatBRL(m.contributionsCents)}</span>
            </div>
            <div class="bar-tooltip-row">
              <span>Saldo livre</span>
              <strong class="money ${m.freeBalanceCents >= 0 ? 'text-success' : 'text-danger'}">${formatBRL(m.freeBalanceCents)}</strong>
            </div>
          </div>
          <div class="bar-track">
            <div class="bar-trio">
              ${barElements}
            </div>
          </div>
          <span class="bar-label">${escapeHtml(m.label)}</span>
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
    <div class="chart-bars-row fin-chart-bars-row">${barsHtml}</div>
  `;

  // Em telas com rolagem horizontal (mobile), inicia alinhado à direita (meses mais recentes)
  requestAnimationFrame(() => {
    if (chartEl.scrollWidth > chartEl.clientWidth) {
      chartEl.scrollLeft = chartEl.scrollWidth;
    }
  });
}

function renderDashboardPendingList(financeMonth) {
  const listEl = document.getElementById('dashboard-pending-list');
  const countBadge = document.getElementById('dashboard-pending-count');
  const footerEl = document.getElementById('dashboard-pending-footer');
  if (!listEl) return;

  const pending = financeMonth.pendingItems || [];
  if (countBadge) {
    countBadge.textContent =
      pending.length === 0
        ? 'Em dia'
        : `${pending.length} ${pending.length === 1 ? 'pendente' : 'pendentes'}`;
    countBadge.className = `pill ${pending.length === 0 ? 'pill-success' : 'pill-warning'}`;
  }

  const todayStr = getTodayStr();

  if (pending.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state-box empty-state-compact">
        <p class="muted-text">Nenhuma conta fixa ou parcela pendente em ${escapeHtml(financeMonth.monthName)} ${financeMonth.year}.</p>
      </div>
    `;
  } else {
    listEl.innerHTML = pending
      .map((item) => {
        const cat = getCategoryMeta(item.category);
        const isOverdue = Boolean(item.dueDate) && todayStr > item.dueDate;
        const overdueBadge = isOverdue ? '<span class="pill pill-overdue">Vencida</span>' : '';
        const dueLabel =
          item.kind === 'credit_card' && item.dueDate
            ? `Vence em ${formatShortDayMonth(item.dueDate)}`
            : `Dia ${String(item.dueDay).padStart(2, '0')}`;

        return `
          <div class="pending-row">
            <label class="pending-check-wrap">
              <input
                type="checkbox"
                class="pending-checkbox"
                data-toggle-paid-kind="${item.kind}"
                data-toggle-paid-id="${item.id}"
                aria-label="Marcar ${escapeHtml(item.name)} como pago"
              />
              <span class="pending-info">
                <span class="pending-title-line">
                  <strong class="pending-name">${escapeHtml(item.name)}</strong>
                  ${overdueBadge}
                </span>
                <span class="pending-meta">
                  ${dueLabel} • ${escapeHtml(item.metaLabel)} • ${escapeHtml(cat.label)}
                </span>
              </span>
            </label>
            <span class="pending-amount money">${formatBRL(item.amount)}</span>
          </div>
        `;
      })
      .join('');
  }

  if (footerEl) {
    footerEl.innerHTML = `
      <div class="card-footer-total">
        <span>Total pendente no mês</span>
        <strong class="money ${financeMonth.pendingExpensesCents > 0 ? 'text-warning' : 'text-success'}">${formatBRL(financeMonth.pendingExpensesCents)}</strong>
      </div>
      <button type="button" class="btn-inline-link" data-goto-view="flow">
        <span>Gerir despesas</span>
        ${ICON_ARROW_RIGHT_SVG}
      </button>
    `;
  }
}

function renderCaixinhasProjectionChart(caixinhasSummary, uiState = {}) {
  const container = document.getElementById('dashboard-cdi-projection');
  if (!container) return;

  const hasDaily = caixinhasSummary.dailyCount > 0;
  const includeDaily = hasDaily && Boolean(uiState.projectionIncludeDaily);

  const scopePill = document.getElementById('dashboard-proj-scope-pill');
  const dailyToggleLabel = document.getElementById('dashboard-proj-daily-toggle');
  const dailyChk = document.getElementById('chk-proj-include-daily');

  if (scopePill) {
    scopePill.textContent = includeDaily ? 'Reservas + Uso Diário' : 'Apenas reservas';
  }
  if (dailyToggleLabel) {
    dailyToggleLabel.classList.toggle('hidden', !hasDaily);
  }
  if (dailyChk) {
    dailyChk.checked = includeDaily;
  }

  const activeProj = includeDaily
    ? caixinhasSummary.projectionsAll || caixinhasSummary.projections
    : caixinhasSummary.projectionsReserve || caixinhasSummary.projections;

  const series = activeProj?.series12Months || [];
  const p1 = activeProj?.month1;
  const p6 = activeProj?.month6;
  const p12 = activeProj?.month12;
  const baseBalance = activeProj?.baseBalanceCents ?? caixinhasSummary.totalBalanceCents;

  if (baseBalance <= 0) {
    const emptyMsg =
      hasDaily && !includeDaily
        ? `Nenhuma caixinha de Reserva / Meta com saldo ainda. Crie uma reserva ou marque "Incluir conta diária" acima para simular (CDI ${formatPercentPT(caixinhasSummary.cdiAnnualRate)}% a.a.).`
        : `Adicione saldo em uma Caixinha CDI para visualizar a curva projetada de 12 meses (CDI ${formatPercentPT(caixinhasSummary.cdiAnnualRate)}% a.a.).`;

    container.innerHTML = `
      <div class="empty-state-box">
        <p class="muted-text">${emptyMsg}</p>
        <button type="button" class="btn btn-outline btn-sm" data-goto-view="caixinhas">
          Abrir Caixinhas CDI
        </button>
      </div>
    `;
    return;
  }

  const width = 460;
  const height = 165;
  const padLeft = 20;
  const padRight = 22;
  const padTop = 18;
  const padBottom = 28;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const values = series.map((pt) => pt.balanceCents);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const span = Math.max(100, maxVal - minVal);
  const yMin = Math.max(0, minVal - span * 0.15);
  const yMax = maxVal + span * 0.12;
  const ySpan = Math.max(1, yMax - yMin);

  const coords = series.map((pt, idx) => {
    const x = padLeft + (idx / Math.max(1, series.length - 1)) * plotW;
    const y = padTop + plotH - ((pt.balanceCents - yMin) / ySpan) * plotH;
    return { ...pt, x, y };
  });

  // Curva suave via segmentos quadráticos (Catmull-like midpoint smoothing)
  let linePath = `M ${coords[0].x.toFixed(1)} ${coords[0].y.toFixed(1)}`;
  for (let i = 1; i < coords.length; i++) {
    const prev = coords[i - 1];
    const curr = coords[i];
    const midX = ((prev.x + curr.x) / 2).toFixed(1);
    const midY = ((prev.y + curr.y) / 2).toFixed(1);
    linePath += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)}, ${midX} ${midY}`;
  }
  const last = coords[coords.length - 1];
  linePath += ` T ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;

  const baselineY = (padTop + plotH).toFixed(1);
  const areaPath = `${linePath} L ${last.x.toFixed(1)} ${baselineY} L ${coords[0].x.toFixed(1)} ${baselineY} Z`;

  const xLabelsIndices = [0, 3, 6, 9, 12];
  const xLabelsSvg = xLabelsIndices
    .filter((i) => coords[i])
    .map((i) => {
      const anchor = i === 0 ? 'start' : i === coords.length - 1 ? 'end' : 'middle';
      return `
      <text x="${coords[i].x.toFixed(1)}" y="${height - 8}" text-anchor="${anchor}" class="area-axis-label">
        ${escapeHtml(coords[i].label)}
      </text>
    `;
    })
    .join('');

  const pointsSvg = coords
    .map(
      (pt, idx) => `
      <g class="area-point-group" data-proj-idx="${idx}" tabindex="0">
        <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="10" fill="transparent" />
        <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="${idx === 0 || idx === 6 || idx === 12 ? 3.8 : 2.6}" class="area-point-dot" />
      </g>
    `
    )
    .join('');

  container.innerHTML = `
    <div class="area-chart-wrap">
      <div id="area-chart-readout" class="area-chart-readout">
        <span>Projeção em 12 meses (252 d.u.)</span>
        <strong class="money">${formatBRL(p12.balanceCents)}</strong>
        <span class="text-success money">+${formatBRL(p12.projectedYieldCents)} de rendimento</span>
      </div>
      <svg viewBox="0 0 ${width} ${height}" class="area-svg" role="img" aria-label="Projeção de 12 meses das Caixinhas CDI">
        <defs>
          <linearGradient id="bolsitoAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28" />
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.02" />
          </linearGradient>
        </defs>
        <line x1="${padLeft}" y1="${padTop}" x2="${width - padRight}" y2="${padTop}" class="area-gridline" />
        <line x1="${padLeft}" y1="${(padTop + plotH / 2).toFixed(1)}" x2="${width - padRight}" y2="${(padTop + plotH / 2).toFixed(1)}" class="area-gridline" />
        <line x1="${padLeft}" y1="${baselineY}" x2="${width - padRight}" y2="${baselineY}" class="area-gridline" />
        <path d="${areaPath}" fill="url(#bolsitoAreaGrad)" />
        <path d="${linePath}" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
        ${pointsSvg}
        ${xLabelsSvg}
      </svg>
      <div class="proj-mini-strip">
        <div class="proj-mini-cell">
          <span>1 mês (21 d.u.)</span>
          <strong class="money">${formatBRL(p1.balanceCents)}</strong>
          <small class="money text-success">+${formatBRL(p1.projectedYieldCents)}</small>
        </div>
        <div class="proj-mini-cell">
          <span>6 meses (126 d.u.)</span>
          <strong class="money">${formatBRL(p6.balanceCents)}</strong>
          <small class="money text-success">+${formatBRL(p6.projectedYieldCents)}</small>
        </div>
        <div class="proj-mini-cell">
          <span>12 meses (252 d.u.)</span>
          <strong class="money">${formatBRL(p12.balanceCents)}</strong>
          <small class="money text-success">+${formatBRL(p12.projectedYieldCents)}</small>
        </div>
      </div>
    </div>
  `;

  const readoutEl = container.querySelector('#area-chart-readout');
  const defaultReadout = readoutEl ? readoutEl.innerHTML : '';

  container.querySelectorAll('[data-proj-idx]').forEach((ptEl) => {
    const idx = Number(ptEl.dataset.projIdx);
    const pt = coords[idx];
    const showPoint = () => {
      if (!readoutEl || !pt) return;
      readoutEl.innerHTML = `
        <span>${escapeHtml(pt.label)} (${pt.monthOffset * 21} d.u.)</span>
        <strong class="money">${formatBRL(pt.balanceCents)}</strong>
        <span class="text-success money">+${formatBRL(pt.yieldCents)} acum.</span>
      `;
    };
    ptEl.addEventListener('mouseenter', showPoint);
    ptEl.addEventListener('focus', showPoint);
    ptEl.addEventListener('mouseleave', () => {
      if (readoutEl) readoutEl.innerHTML = defaultReadout;
    });
    ptEl.addEventListener('blur', () => {
      if (readoutEl) readoutEl.innerHTML = defaultReadout;
    });
  });
}

// ============================================================
// 02 / FLUXO MENSAL — DESPESAS & RENDAS
// ============================================================

export function renderFlowView(financeMonth, uiState) {
  const monthLabelEl = document.getElementById('flow-month-label');
  if (monthLabelEl) {
    monthLabelEl.textContent = `${financeMonth.monthName} ${financeMonth.year}`;
  }

  // Resumo compacto no topo (4 KPIs editoriais numerados)
  const summaryStrip = document.getElementById('flow-summary-strip');
  if (summaryStrip) {
    const isPos = financeMonth.freeBalanceCents >= 0;
    const paidPct =
      financeMonth.totalExpensesCents > 0
        ? Math.min(100, Math.round((financeMonth.paidExpensesCents / financeMonth.totalExpensesCents) * 100))
        : 100;

    summaryStrip.innerHTML = `
      <div class="flow-summary-tile">
        <span class="tile-kicker">01 / RENDA TOTAL</span>
        <strong class="tile-value money">${formatBRL(financeMonth.totalIncomeCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span class="tile-kicker">02 / TOTAL DESPESAS</span>
        <strong class="tile-value money">${formatBRL(financeMonth.totalExpensesCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span class="tile-kicker">03 / PAGO VS. PENDENTE</span>
        <strong class="tile-value money text-success">${formatBRL(financeMonth.paidExpensesCents)}</strong>
        <div class="tile-sub-row">
          <span class="tile-sub-text ${financeMonth.pendingExpensesCents > 0 ? 'text-warning' : 'text-success'}">
            ${
              financeMonth.pendingExpensesCents > 0
                ? `Pendente: <span class="money">${formatBRL(financeMonth.pendingExpensesCents)}</span>`
                : 'Tudo quitado'
            }
          </span>
          <span class="tile-sub-pct money">${paidPct}%</span>
        </div>
        <div class="progress-track progress-track-xs" aria-hidden="true">
          <div class="progress-fill" style="width: ${paidPct}%;"></div>
        </div>
      </div>
      <div class="flow-summary-tile ${isPos ? 'kpi-tone-success' : 'kpi-tone-danger'}">
        <span class="tile-kicker">04 / SALDO LIVRE</span>
        <strong class="tile-value money ${isPos ? 'text-success' : 'text-danger'}">${formatBRL(financeMonth.freeBalanceCents)}</strong>
      </div>
    `;
  }

  // Card de Rendas (Base fixa com toggle A receber / Recebida + Extras com toggle individual)
  const baseInput = document.getElementById('input-flow-base-income');
  if (baseInput && document.activeElement !== baseInput) {
    baseInput.value = centsToInputValue(financeMonth.baseMonthlyCents);
  }

  const baseStatusBtn = document.getElementById('btn-toggle-base-income-received');
  if (baseStatusBtn) {
    const isBaseRec = Boolean(financeMonth.baseReceived);
    baseStatusBtn.textContent = isBaseRec ? 'Recebida' : 'A receber';
    baseStatusBtn.classList.toggle('is-paid', isBaseRec);
    baseStatusBtn.classList.toggle('is-pending', !isBaseRec);
    baseStatusBtn.setAttribute('aria-pressed', String(isBaseRec));
  }

  const extrasListEl = document.getElementById('flow-extras-list');
  const extrasTotalEl = document.getElementById('flow-extras-total');
  if (extrasTotalEl) {
    extrasTotalEl.textContent = formatBRL(financeMonth.extrasTotalCents);
  }
  if (extrasListEl) {
    if (financeMonth.extras.length === 0) {
      extrasListEl.innerHTML =
        '<p class="muted-text">Nenhuma renda extra lançada neste mês.</p>';
    } else {
      extrasListEl.innerHTML = financeMonth.extras
        .map(
          (item) => `
          <div class="finance-row">
            <div class="finance-row-main">
              <strong>${escapeHtml(item.description)}</strong>
              <span class="finance-row-sub money">${formatDisplayDate(item.date)}</span>
            </div>
            <div class="finance-row-right">
              <span class="finance-row-amount money text-success">+ ${formatBRL(item.amount)}</span>
              <button
                type="button"
                class="pill-toggle ${item.received ? 'is-paid' : 'is-pending'}"
                data-toggle-extra-received="${item.id}"
                aria-pressed="${String(item.received)}"
              >
                ${item.received ? 'Recebida' : 'A receber'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-edit-extra-income="${item.id}">Editar</button>
              <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-extra-income="${item.id}">Excluir</button>
            </div>
          </div>
        `
        )
        .join('');
    }
  }

  // Contadores nas abas de filtro de bloco
  const activeTab = uiState.flowTab || 'all';
  document.querySelectorAll('[data-flow-tab]').forEach((btn) => {
    const isActive = btn.dataset.flowTab === activeTab;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });

  const blockFixed = document.getElementById('flow-block-fixed');
  const blockInst = document.getElementById('flow-block-installments');
  const blockVar = document.getElementById('flow-block-variable');
  if (blockFixed) blockFixed.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'fixed');
  if (blockInst) blockInst.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'installments');
  if (blockVar) blockVar.classList.toggle('hidden', activeTab !== 'all' && activeTab !== 'variable');

  // 1. Contas Fixas + Linha Automática Travada de Passagens + Fatura Rápida do Cartão
  const fixedListEl = document.getElementById('flow-fixed-list');
  const fixedTotalBadge = document.getElementById('flow-fixed-total');
  const fixedBlockTotal =
    financeMonth.fixedExpensesCents +
    financeMonth.transportExpensesCents +
    financeMonth.creditCardExpensesCents;
  if (fixedTotalBadge) {
    fixedTotalBadge.textContent = formatBRL(fixedBlockTotal);
  }
  if (fixedListEl) {
    const tItem = financeMonth.transportItem;
    const transportRowHtml = `
      <div class="finance-row finance-row-auto">
        <div class="finance-row-main">
          <div class="finance-row-title-line">
            <span class="cat-dot" style="background: var(--cat-transporte);" aria-hidden="true"></span>
            <strong>${escapeHtml(tItem.name)}</strong>
            <span class="pill pill-info">Automático • Passagens</span>
          </div>
          <span class="finance-row-sub">
            Categoria: Transporte • ${tItem.activeDaysCount} ${tItem.activeDaysCount === 1 ? 'dia ativo' : 'dias ativos'} no calendário
          </span>
        </div>
        <div class="finance-row-right">
          <strong class="finance-row-amount money">${formatBRL(tItem.amount)}</strong>
          <button type="button" class="btn btn-outline btn-sm" data-goto-view="monthly">
            Abrir Passagens
          </button>
        </div>
      </div>
    `;

    const bill = financeMonth.creditCardBill;
    const todayStr = getTodayStr();
    const isCardOverdue = bill.hasBill && !bill.paid && Boolean(bill.dueDate) && todayStr > bill.dueDate;
    const cardOverdueBadge = isCardOverdue ? '<span class="pill pill-overdue">Vencida</span>' : '';

    const cardBillRowHtml = `
      <div class="finance-row finance-row-card-bill ${bill.hasBill && bill.paid ? 'is-paid' : ''}">
        <div class="finance-row-main">
          <div class="finance-row-title-line">
            <span class="cat-dot" style="background: var(--cat-cartao);" aria-hidden="true"></span>
            <strong>${escapeHtml(bill.cardName || 'Cartão de Crédito')}</strong>
            <span class="pill pill-card-bill">Fatura do Cartão</span>
            ${cardOverdueBadge}
          </div>
          <span class="finance-row-sub">
            ${
              bill.hasBill
                ? `Vencimento: ${formatDisplayDate(bill.dueDate)} • Categoria: Cartão de Crédito`
                : `Vencimento sugerido: ${formatDisplayDate(bill.dueDate)} • Informe o total atual/fechado sem lançar gasto por gasto`
            }
          </span>
        </div>
        <div class="finance-row-right">
          <strong class="finance-row-amount money ${bill.hasBill ? '' : 'muted-text'}">${formatBRL(bill.amount)}</strong>
          ${
            bill.hasBill
              ? `
            <button
              type="button"
              class="pill-toggle ${bill.paid ? 'is-paid' : 'is-pending'}"
              data-toggle-paid-kind="credit_card"
              data-toggle-paid-id="${financeMonth.ym}"
              aria-pressed="${String(bill.paid)}"
            >
              ${bill.paid ? 'Pago' : 'Pendente'}
            </button>
          `
              : ''
          }
          <button type="button" class="btn btn-outline btn-sm" data-open-card-bill>
            ${bill.hasBill ? 'Atualizar fatura' : 'Informar fatura'}
          </button>
        </div>
      </div>
    `;

    const fixedRowsHtml = financeMonth.fixedItems
      .map((item) => {
        const cat = getCategoryMeta(item.category);
        return `
          <div class="finance-row ${item.paid ? 'is-paid' : ''}">
            <div class="finance-row-main">
              <div class="finance-row-title-line">
                <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                <strong>${escapeHtml(item.name)}</strong>
                <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
              </div>
              <span class="finance-row-sub">Vencimento: Dia ${String(item.dueDay).padStart(2, '0')}</span>
            </div>
            <div class="finance-row-right">
              <strong class="finance-row-amount money">${formatBRL(item.amount)}</strong>
              <button
                type="button"
                class="pill-toggle ${item.paid ? 'is-paid' : 'is-pending'}"
                data-toggle-paid-kind="fixed"
                data-toggle-paid-id="${item.id}"
                aria-pressed="${String(item.paid)}"
              >
                ${item.paid ? 'Pago' : 'Pendente'}
              </button>
              <button type="button" class="btn btn-ghost btn-sm" data-edit-fixed="${item.id}">Editar</button>
              <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-fixed="${item.id}">Excluir</button>
            </div>
          </div>
        `;
      })
      .join('');

    fixedListEl.innerHTML =
      transportRowHtml +
      cardBillRowHtml +
      (fixedRowsHtml || '<p class="muted-text mt-12">Nenhuma conta fixa recorrente cadastrada ainda.</p>');
  }

  // 2. Dívidas e Parcelamentos
  const instListEl = document.getElementById('flow-installments-list');
  const instTotalBadge = document.getElementById('flow-installments-total');
  if (instTotalBadge) {
    instTotalBadge.textContent = formatBRL(financeMonth.installmentsExpensesCents);
  }
  if (instListEl) {
    if (financeMonth.installmentItems.length === 0) {
      instListEl.innerHTML =
        '<p class="muted-text">Nenhum parcelamento ou dívida ativa neste mês.</p>';
    } else {
      instListEl.innerHTML = financeMonth.installmentItems
        .map((item) => {
          const cat = getCategoryMeta(item.category);
          // Barra de progresso baseada estritamente no número de parcelas PAGAS
          let paidInstallmentsCount = 0;
          for (let offset = 0; offset < item.totalInstallments; offset++) {
            const mKey = addMonthsYM(item.startMonth, offset);
            if (item.paidByMonth && item.paidByMonth[mKey]) {
              paidInstallmentsCount++;
            }
          }
          const paidProgressPct = Math.min(
            100,
            Math.round((paidInstallmentsCount / Math.max(1, item.totalInstallments)) * 100)
          );

          return `
            <div class="finance-row finance-row-installment ${item.paid ? 'is-paid' : ''}">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                  <strong>${escapeHtml(item.name)}</strong>
                  <span class="pill pill-info money">Parcela ${item.currentNumber}/${item.totalInstallments}</span>
                  <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
                </div>
                <span class="finance-row-sub">
                  Venc. Dia ${String(item.dueDay).padStart(2, '0')} • Restante: <strong class="money">${formatBRL(item.remainingAmountCents)}</strong> (${item.remainingInstallments} ${item.remainingInstallments === 1 ? 'parcela' : 'parcelas'}) • ${paidInstallmentsCount}/${item.totalInstallments} ${paidInstallmentsCount === 1 ? 'paga' : 'pagas'}
                </span>
                <div class="progress-track progress-track-sm mt-6" aria-hidden="true">
                  <div class="progress-fill" style="width: ${paidProgressPct}%;"></div>
                </div>
              </div>
              <div class="finance-row-right">
                <strong class="finance-row-amount money">${formatBRL(item.installmentAmount)}</strong>
                <button
                  type="button"
                  class="pill-toggle ${item.paid ? 'is-paid' : 'is-pending'}"
                  data-toggle-paid-kind="installment"
                  data-toggle-paid-id="${item.id}"
                  aria-pressed="${String(item.paid)}"
                >
                  ${item.paid ? 'Pago' : 'Pendente'}
                </button>
                <button type="button" class="btn btn-ghost btn-sm" data-edit-installment="${item.id}">Editar</button>
                <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-installment="${item.id}">Excluir</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }

  // 3. Gastos Avulsos (com filtro por categoria e busca)
  const varListEl = document.getElementById('flow-variable-list');
  const varTotalBadge = document.getElementById('flow-variable-total');
  const filterCat = uiState.variableFilterCategory || 'all';
  const filterCatSel = document.getElementById('filter-variable-category');
  if (filterCatSel && filterCatSel.value !== filterCat) {
    filterCatSel.value = filterCat;
  }
  const filterQuery = (uiState.variableSearchQuery || '').trim().toLowerCase();

  const filteredVars = financeMonth.variableItems.filter((item) => {
    if (filterCat !== 'all' && item.category !== filterCat) return false;
    if (filterQuery && !item.description.toLowerCase().includes(filterQuery)) return false;
    return true;
  });

  const filteredTotalCents = filteredVars.reduce((acc, item) => acc + item.amount, 0);
  if (varTotalBadge) {
    varTotalBadge.textContent = formatBRL(filteredTotalCents);
  }

  if (varListEl) {
    if (financeMonth.variableItems.length === 0) {
      varListEl.innerHTML =
        '<p class="muted-text">Nenhum gasto avulso registrado neste mês. Use "+ Novo Gasto" ou pressione a tecla N.</p>';
    } else if (filteredVars.length === 0) {
      varListEl.innerHTML =
        '<p class="muted-text">Nenhum gasto avulso corresponde aos filtros aplicados.</p>';
    } else {
      varListEl.innerHTML = filteredVars
        .map((item) => {
          const cat = getCategoryMeta(item.category);
          return `
            <div class="finance-row">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="cat-dot" style="background: ${cat.colorVar};" aria-hidden="true"></span>
                  <strong>${escapeHtml(item.description)}</strong>
                  <span class="pill pill-muted">${escapeHtml(cat.label)}</span>
                </div>
                <span class="finance-row-sub money">${formatDisplayDate(item.date)}</span>
              </div>
              <div class="finance-row-right">
                <strong class="finance-row-amount money">${formatBRL(item.amount)}</strong>
                <button type="button" class="btn btn-ghost btn-sm" data-edit-variable="${item.id}">Editar</button>
                <button type="button" class="btn btn-ghost btn-danger-ghost btn-sm" data-delete-variable="${item.id}">Excluir</button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

// ============================================================
// 03 / RESERVAS — CAIXINHAS CDI
// ============================================================

export function renderCaixinhasView(caixinhasSummary) {
  const rateLabel = document.getElementById('caixinhas-cdi-rate-label');
  if (rateLabel) {
    rateLabel.textContent = `${formatPercentPT(caixinhasSummary.cdiAnnualRate)}% a.a.`;
  }

  const summaryEl = document.getElementById('caixinhas-summary-kpis');
  if (summaryEl) {
    const splitSub =
      caixinhasSummary.dailyCount > 0
        ? `Reservas: <span class="money">${formatBRL(caixinhasSummary.reserveBalanceCents)}</span> • Uso diário: <span class="money">${formatBRL(caixinhasSummary.dailyBalanceCents)}</span>`
        : 'Saldo atual bruto (sem IR)';

    summaryEl.innerHTML = `
      <article class="annual-kpi-card fin-kpi-card">
        <span class="micro-label">01 / TOTAL GUARDADO</span>
        <strong class="money">${formatBRL(caixinhasSummary.totalBalanceCents)}</strong>
        <small>${splitSub}</small>
      </article>
      <article class="annual-kpi-card fin-kpi-card">
        <span class="micro-label">02 / TOTAL APORTADO</span>
        <strong class="money">${formatBRL(caixinhasSummary.totalPrincipalCents)}</strong>
        <small>Principal líquido em aplicação</small>
      </article>
      <article class="annual-kpi-card fin-kpi-card kpi-tone-success">
        <span class="micro-label">03 / RENDIMENTO ACUMULADO</span>
        <strong class="money text-success">+ ${formatBRL(caixinhasSummary.totalYieldCents)}</strong>
        <small>No mês: <span class="money text-success">+${formatBRL(caixinhasSummary.totalMonthYieldCents)}</span></small>
      </article>
    `;
  }

  const gridEl = document.getElementById('caixinhas-grid');
  if (!gridEl) return;

  if (caixinhasSummary.boxes.length === 0) {
    gridEl.innerHTML = `
      <section class="card caixinha-empty-card">
        <div class="empty-state-box">
          <h3 class="serif-heading-sm">Nenhuma caixinha criada ainda</h3>
          <p class="muted-text">
            Crie caixinhas para sua reserva de emergência, viagens ou metas com rendimento automático baseado no CDI em dias úteis reais.
          </p>
          <button type="button" class="btn btn-primary btn-sm" id="btn-empty-new-box">
            + Criar primeira caixinha
          </button>
        </div>
      </section>
    `;
    return;
  }

  gridEl.innerHTML = caixinhasSummary.boxes
    .map((box) => {
      const goalHtml =
        box.goalAmount !== null
          ? `
          <div class="caixinha-goal-block">
            <div class="caixinha-goal-row">
              <span>Meta: <strong class="money">${formatBRL(box.goalAmount)}</strong></span>
              <span class="money">${box.goalProgressPct}%</span>
            </div>
            <div class="progress-track progress-track-sm" aria-hidden="true">
              <div class="progress-fill" style="width: ${box.goalProgressPct}%;"></div>
            </div>
          </div>
        `
          : '';

      const isDaily = box.kind === 'daily';
      const roleLabel = isDaily ? 'CONTA • USO DIÁRIO' : 'RESERVA CDI';
      const actionsHtml = isDaily
        ? `
          <div class="caixinha-actions caixinha-actions-daily">
            <div class="caixinha-actions-left">
              <button type="button" class="btn btn-accent-soft btn-sm" data-box-adjust="${box.id}">
                Atualizar saldo
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="deposit" data-box-id="${box.id}" title="Registrar aporte">
                + Aporte
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="withdraw" data-box-id="${box.id}" title="Registrar resgate">
                - Resgate
              </button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm caixinha-actions-detail" data-box-details="${box.id}">
              Detalhes / Projeção
            </button>
          </div>
        `
        : `
          <div class="caixinha-actions">
            <div class="caixinha-actions-left">
              <button type="button" class="btn btn-accent-soft btn-sm" data-box-tx-type="deposit" data-box-id="${box.id}">
                + Aporte
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="withdraw" data-box-id="${box.id}">
                - Resgate
              </button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm caixinha-actions-detail" data-box-details="${box.id}">
              Detalhes / Projeção
            </button>
          </div>
        `;

      return `
        <article class="card caixinha-card ${isDaily ? 'caixinha-card-daily' : ''}">
          <div class="card-header-row">
            <div>
              <span class="micro-label ${isDaily ? 'micro-label-daily' : ''}">${roleLabel}</span>
              <h3 class="card-title serif-heading-sm">${escapeHtml(box.name)}</h3>
            </div>
            <span class="pill ${isDaily ? 'pill-info' : 'pill-active-fare'} money">${formatPercentPT(box.cdiPercent, box.cdiPercent % 1 === 0 ? 0 : 1)}% CDI</span>
          </div>

          <div class="caixinha-balance-block">
            <span class="caixinha-balance-label">Saldo atual bruto</span>
            <strong class="caixinha-balance-value money">${formatBRL(box.currentBalanceCents)}</strong>
            <div class="caixinha-sub-metrics">
              <span>Principal: <strong class="money">${formatBRL(box.principalCents)}</strong></span>
              <span>Rendimento: <strong class="money text-success">+${formatBRL(box.yieldCents)}</strong></span>
            </div>
          </div>

          ${goalHtml}

          ${actionsHtml}
        </article>
      `;
    })
    .join('');
}

/**
 * Renderiza o conteúdo interno do modal de Detalhes & Projeção de uma caixinha.
 */
export function renderBoxDetailModal(boxPerf, cdiAnnualRate, simulatedMonthlyCents = 0) {
  const modal = document.getElementById('caixinha-detail-modal');
  const titleEl = document.getElementById('box-detail-title');
  const subEl = document.getElementById('box-detail-subtitle');
  const metricsEl = document.getElementById('box-detail-metrics');
  const projEl = document.getElementById('box-detail-projections');
  const historyEl = document.getElementById('box-detail-history');
  const simInput = document.getElementById('input-box-sim-monthly');

  if (!modal || !boxPerf) return;

  if (titleEl) titleEl.textContent = boxPerf.name;
  if (subEl) {
    const kindDesc = boxPerf.kind === 'daily' ? 'Conta / Uso Diário' : 'Reserva / Meta';
    subEl.textContent = `${kindDesc} • ${formatPercentPT(boxPerf.cdiPercent, boxPerf.cdiPercent % 1 === 0 ? 0 : 1)}% do CDI (${formatPercentPT(cdiAnnualRate)}% a.a.) • ${boxPerf.businessDaysWithYield} dias úteis rendidos`;
  }

  if (metricsEl) {
    metricsEl.innerHTML = `
      <div class="flow-summary-tile">
        <span>Saldo Atual Bruto</span>
        <strong class="money">${formatBRL(boxPerf.currentBalanceCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span>Total Aportado (Principal)</span>
        <strong class="money">${formatBRL(boxPerf.principalCents)}</strong>
      </div>
      <div class="flow-summary-tile">
        <span>Rendimento Acumulado</span>
        <strong class="money text-success">+ ${formatBRL(boxPerf.yieldCents)}</strong>
      </div>
    `;
  }

  if (simInput && document.activeElement !== simInput) {
    simInput.value = simulatedMonthlyCents > 0 ? centsToInputValue(simulatedMonthlyCents) : '';
  }

  const proj = calculateBoxProjection(
    boxPerf.currentBalanceCents,
    cdiAnnualRate,
    boxPerf.cdiPercent,
    simulatedMonthlyCents
  );

  if (projEl) {
    projEl.innerHTML = `
      <div class="proj-mini-strip">
        <div class="proj-mini-cell">
          <span>1 mês (21 d.u.)</span>
          <strong class="money">${formatBRL(proj.month1.balanceCents)}</strong>
          <small class="money text-success">Rendimento: +${formatBRL(proj.month1.projectedYieldCents)}</small>
        </div>
        <div class="proj-mini-cell">
          <span>6 meses (126 d.u.)</span>
          <strong class="money">${formatBRL(proj.month6.balanceCents)}</strong>
          <small class="money text-success">Rendimento: +${formatBRL(proj.month6.projectedYieldCents)}</small>
        </div>
        <div class="proj-mini-cell">
          <span>12 meses (252 d.u.)</span>
          <strong class="money">${formatBRL(proj.month12.balanceCents)}</strong>
          <small class="money text-success">Rendimento: +${formatBRL(proj.month12.projectedYieldCents)}</small>
        </div>
      </div>
    `;
  }

  if (historyEl) {
    if (boxPerf.transactionsDesc.length === 0) {
      historyEl.innerHTML = '<p class="muted-text">Nenhuma movimentação registrada ainda.</p>';
    } else {
      historyEl.innerHTML = boxPerf.transactionsDesc
        .map((tx) => {
          const isDeposit = tx.type === 'deposit';
          return `
            <div class="finance-row">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="pill ${tx.isAdjustment ? 'pill-muted' : isDeposit ? 'pill-success' : 'pill-warning'}">
                    ${tx.isAdjustment ? 'Ajuste' : isDeposit ? 'Aporte' : 'Resgate'}
                  </span>
                  <span class="finance-row-sub money">${formatDisplayDate(tx.date)}</span>
                </div>
                ${tx.note ? `<span class="finance-row-sub">${escapeHtml(tx.note)}</span>` : ''}
              </div>
              <div class="finance-row-right">
                <strong class="finance-row-amount money ${isDeposit ? 'text-success' : 'text-danger'}">
                  ${isDeposit ? '+' : '-'} ${formatBRL(tx.amount)}
                </strong>
                <button
                  type="button"
                  class="btn btn-ghost btn-danger-ghost btn-sm"
                  data-delete-box-tx="${tx.id}"
                  data-box-id="${boxPerf.id}"
                >
                  Excluir
                </button>
              </div>
            </div>
          `;
        })
        .join('');
    }
  }
}

// ============================================================
// Helpers de Abertura e Fechamento dos Modais Financeiros
// ============================================================

export function openQuickExpenseModal(editingItem = null) {
  const modal = document.getElementById('quick-expense-modal');
  if (!modal) return;
  document.getElementById('input-quick-expense-id').value = editingItem ? editingItem.id : '';
  document.getElementById('quick-expense-modal-title').textContent = editingItem
    ? 'Editar Gasto Avulso'
    : 'Novo Gasto Rápido';
  document.getElementById('input-quick-expense-amount').value = editingItem
    ? centsToInputValue(editingItem.amount)
    : '';
  document.getElementById('input-quick-expense-desc').value = editingItem ? editingItem.description : '';
  document.getElementById('input-quick-expense-category').value = editingItem
    ? editingItem.category
    : 'alimentacao';
  document.getElementById('input-quick-expense-date').value = editingItem
    ? editingItem.date
    : getTodayStr();

  modal.classList.remove('hidden');
  document.getElementById('input-quick-expense-amount')?.focus();
}

export function openExtraIncomeModal(editingItem = null, defaultDate = null) {
  const modal = document.getElementById('extra-income-modal');
  if (!modal) return;
  document.getElementById('input-extra-income-id').value = editingItem ? editingItem.id : '';
  document.getElementById('extra-income-modal-title').textContent = editingItem
    ? 'Editar Renda Extra'
    : 'Nova Renda Extra';
  document.getElementById('input-extra-income-amount').value = editingItem
    ? centsToInputValue(editingItem.amount)
    : '';
  document.getElementById('input-extra-income-desc').value = editingItem ? editingItem.description : '';
  document.getElementById('input-extra-income-date').value = editingItem
    ? editingItem.date
    : defaultDate || getTodayStr();
  document.getElementById('chk-extra-income-received').checked = editingItem
    ? editingItem.received !== false
    : true;

  modal.classList.remove('hidden');
  document.getElementById('input-extra-income-amount')?.focus();
}

export function openFixedExpenseModal(editingItem = null, defaultStartMonth = null) {
  const modal = document.getElementById('fixed-expense-modal');
  if (!modal) return;
  document.getElementById('input-fixed-id').value = editingItem ? editingItem.id : '';
  document.getElementById('fixed-expense-modal-title').textContent = editingItem
    ? 'Editar Conta Fixa'
    : 'Nova Conta Fixa';
  document.getElementById('input-fixed-name').value = editingItem ? editingItem.name : '';
  document.getElementById('input-fixed-amount').value = editingItem
    ? centsToInputValue(editingItem.amount)
    : '';
  document.getElementById('input-fixed-dueday').value = editingItem ? String(editingItem.dueDay) : '10';
  document.getElementById('input-fixed-category').value = editingItem ? editingItem.category : 'moradia';
  document.getElementById('input-fixed-start-month').value = editingItem
    ? editingItem.startMonth
    : defaultStartMonth || getTodayStr().slice(0, 7);

  modal.classList.remove('hidden');
  document.getElementById('input-fixed-name')?.focus();
}

export function openInstallmentModal(editingItem = null, defaultStartMonth = null) {
  const modal = document.getElementById('installment-modal');
  if (!modal) return;
  document.getElementById('input-installment-id').value = editingItem ? editingItem.id : '';
  document.getElementById('installment-modal-title').textContent = editingItem
    ? 'Editar Parcelamento'
    : 'Novo Parcelamento / Dívida';
  document.getElementById('input-installment-name').value = editingItem ? editingItem.name : '';
  document.getElementById('input-installment-amount').value = editingItem
    ? centsToInputValue(editingItem.installmentAmount)
    : '';
  document.getElementById('input-installment-count').value = editingItem
    ? String(editingItem.totalInstallments)
    : '6';
  document.getElementById('input-installment-start-month').value = editingItem
    ? editingItem.startMonth
    : defaultStartMonth || getTodayStr().slice(0, 7);
  document.getElementById('input-installment-dueday').value = editingItem
    ? String(editingItem.dueDay)
    : '10';
  document.getElementById('input-installment-category').value = editingItem
    ? editingItem.category
    : 'compras';

  modal.classList.remove('hidden');
  document.getElementById('input-installment-name')?.focus();
}

export function setCaixinhaKindSelection(kind) {
  const safeKind = kind === 'daily' ? 'daily' : 'reserve';
  const hiddenInput = document.getElementById('input-box-kind');
  if (hiddenInput) hiddenInput.value = safeKind;
  document.querySelectorAll('[data-box-kind-choice]').forEach((btn) => {
    const isActive = btn.dataset.boxKindChoice === safeKind;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  });
}

export function openCaixinhaModal(editingBox = null) {
  const modal = document.getElementById('caixinha-modal');
  if (!modal) return;
  document.getElementById('input-box-id').value = editingBox ? editingBox.id : '';
  document.getElementById('caixinha-modal-title').textContent = editingBox
    ? 'Editar Caixinha'
    : 'Nova Caixinha CDI';
  setCaixinhaKindSelection(editingBox?.kind === 'daily' ? 'daily' : 'reserve');
  document.getElementById('input-box-name').value = editingBox ? editingBox.name : '';
  document.getElementById('input-box-cdi-percent').value = editingBox
    ? String(editingBox.cdiPercent).replace('.', ',')
    : '100';
  document.getElementById('input-box-goal').value =
    editingBox && editingBox.goalAmount ? centsToInputValue(editingBox.goalAmount) : '';

  modal.classList.remove('hidden');
  document.getElementById('input-box-name')?.focus();
}

export function openCaixinhaAdjustModal(boxPerf) {
  const modal = document.getElementById('caixinha-adjust-modal');
  if (!modal || !boxPerf) return;
  document.getElementById('input-adjust-box-id').value = boxPerf.id;
  document.getElementById('adjust-box-modal-subtitle').textContent = boxPerf.name;
  document.getElementById('adjust-box-current-balance').textContent = formatBRL(
    boxPerf.currentBalanceCents
  );
  const input = document.getElementById('input-adjust-box-balance');
  if (input) {
    input.value = centsToInputValue(boxPerf.currentBalanceCents);
  }
  modal.classList.remove('hidden');
  input?.focus();
  input?.select();
}

export function openCaixinhaTxModal(box, type = 'deposit') {
  const modal = document.getElementById('caixinha-tx-modal');
  if (!modal || !box) return;
  const isDeposit = type === 'deposit';
  document.getElementById('input-box-tx-box-id').value = box.id;
  document.getElementById('input-box-tx-type').value = isDeposit ? 'deposit' : 'withdraw';
  document.getElementById('caixinha-tx-modal-title').textContent = isDeposit
    ? `Aporte em ${box.name}`
    : `Resgate de ${box.name}`;
  document.getElementById('btn-box-tx-submit').textContent = isDeposit
    ? 'Registrar aporte'
    : 'Registrar resgate';
  document.getElementById('input-box-tx-amount').value = '';
  document.getElementById('input-box-tx-date').value = getTodayStr();
  document.getElementById('input-box-tx-note').value = '';

  modal.classList.remove('hidden');
  document.getElementById('input-box-tx-amount')?.focus();
}

export function openCaixinhaDetailModal(boxPerf, cdiAnnualRate, simulatedMonthlyCents = 0) {
  const modal = document.getElementById('caixinha-detail-modal');
  if (!modal || !boxPerf) return;
  renderBoxDetailModal(boxPerf, cdiAnnualRate, simulatedMonthlyCents);
  modal.classList.remove('hidden');
}

export function openCreditCardBillModal(creditCardBill, monthLabel = '') {
  const modal = document.getElementById('credit-card-bill-modal');
  if (!modal || !creditCardBill) return;
  const subEl = document.getElementById('card-bill-modal-subtitle');
  const clearBtn = document.getElementById('btn-clear-card-bill');

  if (subEl) subEl.textContent = monthLabel ? `Competência atual: ${monthLabel}` : '';
  document.getElementById('input-card-bill-original-month').value = creditCardBill.ym;
  document.getElementById('input-card-bill-month').value = creditCardBill.ym;
  document.getElementById('input-card-bill-amount').value = creditCardBill.hasBill
    ? centsToInputValue(creditCardBill.amount)
    : '';
  document.getElementById('input-card-bill-duedate').value = creditCardBill.dueDate;
  document.getElementById('input-card-bill-name').value =
    creditCardBill.cardName && creditCardBill.cardName !== 'Cartão de Crédito'
      ? creditCardBill.cardName
      : '';

  const isNextMonthByDate =
    typeof creditCardBill.dueDate === 'string' &&
    creditCardBill.dueDate.slice(0, 7) > creditCardBill.ym;
  document.getElementById('chk-card-bill-next-month').checked =
    Boolean(creditCardBill.dueInNextMonth) || isNextMonthByDate;

  if (clearBtn) {
    clearBtn.classList.toggle('hidden', !creditCardBill.hasBill);
  }

  modal.classList.remove('hidden');
  document.getElementById('input-card-bill-amount')?.focus();
}

export function closeAllFinanceModals() {
  const modalIds = [
    'quick-expense-modal',
    'extra-income-modal',
    'fixed-expense-modal',
    'installment-modal',
    'caixinha-modal',
    'caixinha-adjust-modal',
    'caixinha-tx-modal',
    'caixinha-detail-modal',
    'credit-card-bill-modal'
  ];
  for (const id of modalIds) {
    document.getElementById(id)?.classList.add('hidden');
  }
}

export { formatCompactMoney };
