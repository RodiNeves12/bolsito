/**
 * 03 / Reservas — Caixinhas CDI:
 * Resumo consolidado, grade de caixinhas e modal de detalhes / simulador 1m/6m/12m.
 */

import { calculateBoxProjection } from '../cdiEngine.js';
import { formatDisplayDate } from '../holidays.js';
import { centsToInputValue, formatBRL } from '../state.js';
import { escapeHtml } from '../ui.js';

function formatPercentPT(num, decimals = 2) {
  const safe = Number.isFinite(num) ? num : 0;
  return safe.toFixed(decimals).replace('.', ',');
}

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

      const safeBoxId = escapeHtml(box.id);
      const isDaily = box.kind === 'daily';
      const roleLabel = isDaily ? 'CONTA • USO DIÁRIO' : 'RESERVA CDI';
      const actionsHtml = isDaily
        ? `
          <div class="caixinha-actions caixinha-actions-daily">
            <div class="caixinha-actions-left">
              <button type="button" class="btn btn-accent-soft btn-sm" data-box-adjust="${safeBoxId}">
                Atualizar saldo
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="deposit" data-box-id="${safeBoxId}" title="Registrar aporte">
                + Aporte
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="withdraw" data-box-id="${safeBoxId}" title="Registrar resgate">
                - Resgate
              </button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm caixinha-actions-detail" data-box-details="${safeBoxId}">
              Detalhes / Projeção
            </button>
          </div>
        `
        : `
          <div class="caixinha-actions">
            <div class="caixinha-actions-left">
              <button type="button" class="btn btn-accent-soft btn-sm" data-box-tx-type="deposit" data-box-id="${safeBoxId}">
                + Aporte
              </button>
              <button type="button" class="btn btn-outline btn-sm" data-box-tx-type="withdraw" data-box-id="${safeBoxId}">
                - Resgate
              </button>
            </div>
            <button type="button" class="btn btn-ghost btn-sm caixinha-actions-detail" data-box-details="${safeBoxId}">
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
      const safeBoxId = escapeHtml(boxPerf.id);
      historyEl.innerHTML = boxPerf.transactionsDesc
        .map((tx) => {
          const isDeposit = tx.type === 'deposit';
          const futureBadge = tx.isFuture
            ? '<span class="pill pill-info" title="Movimentação com data futura — ainda não somada ao saldo atual">Agendada</span>'
            : '';
          return `
            <div class="finance-row">
              <div class="finance-row-main">
                <div class="finance-row-title-line">
                  <span class="pill ${tx.isAdjustment ? 'pill-muted' : isDeposit ? 'pill-success' : 'pill-warning'}">
                    ${tx.isAdjustment ? 'Ajuste' : isDeposit ? 'Aporte' : 'Resgate'}
                  </span>
                  ${futureBadge}
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
                  data-delete-box-tx="${escapeHtml(tx.id)}"
                  data-box-id="${safeBoxId}"
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
