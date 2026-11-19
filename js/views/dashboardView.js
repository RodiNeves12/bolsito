/**
 * 01 / Dashboard — Renderização da visão geral financeira:
 * Total Líquido Consolidado, 4 KPIs Bento Grid, Donut SVG, Barras 12m,
 * Pendências do mês e Projeção CDI 12m SVG (com delegação de eventos).
 */

import { getCategoryMeta } from '../financeEngine.js';
import { formatShortDayMonth, getTodayStr } from '../holidays.js';
import { formatBRL } from '../state.js';
import { escapeHtml } from '../ui.js';

const ICON_ARROW_RIGHT_SVG = `
  <svg class="inline-link-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M5 12h14" />
    <path d="m12 5 7 7-7 7" />
  </svg>
`;

const donutStateByContainer = new WeakMap();
const projStateByContainer = new WeakMap();

function formatPercentPT(num, decimals = 2) {
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toFixed(decimals).replace('.', ',');
}

function bindDonutDelegatedEvents(container) {
  if (container.dataset.donutDelegated === '1') return;
  container.dataset.donutDelegated = '1';

  const highlightFromTarget = (target) => {
    const el = target?.closest?.('[data-donut-idx]');
    if (!el || !container.contains(el)) return;
    const state = donutStateByContainer.get(container);
    if (!state) return;
    const idx = Number(el.dataset.donutIdx);
    const item = state.breakdown[idx];
    const readout = container.querySelector('#donut-center-readout');
    if (!item || !readout) return;

    container.querySelectorAll('[data-donut-idx]').forEach((node) => {
      node.classList.toggle('is-highlighted', Number(node.dataset.donutIdx) === idx);
    });
    readout.innerHTML = `
      <span class="donut-center-label">${escapeHtml(item.label)}</span>
      <strong class="donut-center-value money">${formatBRL(item.amountCents)}</strong>
      <span class="donut-center-sub money">${formatPercentPT(item.pct, 1)}% do mês</span>
    `;
  };

  const resetHighlight = (relatedTarget) => {
    const nextEl = relatedTarget?.closest?.('[data-donut-idx]');
    if (nextEl && container.contains(nextEl)) return;
    const state = donutStateByContainer.get(container);
    const readout = container.querySelector('#donut-center-readout');
    container.querySelectorAll('[data-donut-idx]').forEach((node) => {
      node.classList.remove('is-highlighted');
    });
    if (readout && state) readout.innerHTML = state.defaultHtml;
  };

  container.addEventListener('mouseover', (e) => highlightFromTarget(e.target));
  container.addEventListener('focusin', (e) => highlightFromTarget(e.target));
  container.addEventListener('mouseout', (e) => resetHighlight(e.relatedTarget));
  container.addEventListener('focusout', (e) => resetHighlight(e.relatedTarget));
}

function bindProjectionDelegatedEvents(container) {
  if (container.dataset.projDelegated === '1') return;
  container.dataset.projDelegated = '1';

  const showFromTarget = (target) => {
    const el = target?.closest?.('[data-proj-idx]');
    if (!el || !container.contains(el)) return;
    const state = projStateByContainer.get(container);
    const readoutEl = container.querySelector('#area-chart-readout');
    if (!state || !readoutEl) return;
    const pt = state.coords[Number(el.dataset.projIdx)];
    if (!pt) return;
    readoutEl.innerHTML = `
      <span>${escapeHtml(pt.label)} (${pt.monthOffset * 21} d.u.)</span>
      <strong class="money">${formatBRL(pt.balanceCents)}</strong>
      <span class="text-success money">+${formatBRL(pt.yieldCents)} acum.</span>
    `;
  };

  const resetReadout = (relatedTarget) => {
    const nextEl = relatedTarget?.closest?.('[data-proj-idx]');
    if (nextEl && container.contains(nextEl)) return;
    const state = projStateByContainer.get(container);
    const readoutEl = container.querySelector('#area-chart-readout');
    if (readoutEl && state) readoutEl.innerHTML = state.defaultHtml;
  };

  container.addEventListener('mouseover', (e) => showFromTarget(e.target));
  container.addEventListener('focusin', (e) => showFromTarget(e.target));
  container.addEventListener('mouseout', (e) => resetReadout(e.relatedTarget));
  container.addEventListener('focusout', (e) => resetReadout(e.relatedTarget));
}

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

  const hasReceivable = netWorth.receivableIncomeCents > 0;
  const receivablePillarHtml = hasReceivable
    ? `
      <button
        type="button"
        class="net-worth-pillar net-worth-pillar-action"
        data-goto-view="flow"
        data-scroll-target="flow-income-card"
        title="Abrir seção de Rendas em Despesas & Rendas"
      >
        <span class="net-worth-pillar-label-row">
          <span>A receber</span>
          <svg class="net-worth-pillar-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </span>
        <strong class="money text-success">+${formatBRL(netWorth.receivableIncomeCents)}</strong>
      </button>
    `
    : `
      <div class="net-worth-pillar">
        <span>A receber</span>
        <strong class="money muted-text">${formatBRL(0)}</strong>
      </div>
    `;

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
      ${receivablePillarHtml}
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

  const readout = container.querySelector('#donut-center-readout');
  donutStateByContainer.set(container, {
    breakdown,
    defaultHtml: readout ? readout.innerHTML : ''
  });
  bindDonutDelegatedEvents(container);
}

function renderEvolution12mChart(finance12m, activeYM, seriesState = null) {
  const chartEl = document.getElementById('dashboard-evolution-chart');
  if (!chartEl) return;

  const activeSeries = {
    income: seriesState ? seriesState.income !== false : true,
    expenses: seriesState ? seriesState.expenses !== false : true,
    contributions: seriesState ? seriesState.contributions !== false : true
  };

  document.querySelectorAll('.legend-chip[data-toggle-series]').forEach((chip) => {
    const key = chip.dataset.toggleSeries;
    const isOn = Boolean(activeSeries[key]);
    chip.classList.toggle('is-active', isOn);
    chip.setAttribute('aria-pressed', String(isOn));
  });

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
          aria-label="${escapeHtml(m.fullLabel)}: Receita ${formatBRL(m.incomeCents)}, Despesa ${formatBRL(m.expensesCents)}, Aportes líquidos ${formatBRL(m.contributionsCents)}"
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
              <span>Aportes (líq.)</span>
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
                data-toggle-paid-kind="${escapeHtml(item.kind)}"
                data-toggle-paid-id="${escapeHtml(item.id)}"
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
  projStateByContainer.set(container, {
    coords,
    defaultHtml: readoutEl ? readoutEl.innerHTML : ''
  });
  bindProjectionDelegatedEvents(container);
}
