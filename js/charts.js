// Chart.js wrappers. Colours come from CSS custom properties so light/dark both work.

import { loadScript, CDN } from './lib.js';
import { esc } from './util.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const seriesColor = (i) => css(`--series-${(i % 8) + 1}`);

const live = new Map();

/** HTML for a chart with a table fallback. rows: [[label, ...values]] */
export function chartFigure(id, title, headers, rows) {
  return `<figure class="chart-fig">
    <figcaption>${esc(title)}</figcaption>
    <div class="chart-wrap"><canvas id="${id}" role="img" aria-label="${esc(title)}"></canvas></div>
    <details class="small"><summary>Show as table</summary>
      <div class="table-wrap"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c ?? '–')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    </details></figure>`;
}

async function draw(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return;
  try {
    await loadScript(CDN.chart);
  } catch (err) {
    canvas.parentElement.innerHTML = `<p class="muted small">${esc(err.message)} The table below still has the data.</p>`;
    return;
  }
  if (!document.getElementById(id)) return;
  live.get(id)?.destroy();
  const Chart = window.Chart;
  Chart.defaults.font.family = css('--font');
  Chart.defaults.color = css('--text-2');
  live.set(id, new Chart(canvas, config));
}

const axis = () => ({
  grid: { color: css('--grid') },
  border: { color: css('--line') },
  ticks: { color: css('--text-2') },
});

/** Percent-over-time line chart. datasets: [{label, data:[{x: label, y}]}] with shared labels. */
export function lineChart(id, labels, datasets, { yMax = 100, ySuffix = '%' } = {}) {
  const multi = datasets.length > 1;
  return draw(id, {
    type: 'line',
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        label: d.label,
        data: d.data,
        borderColor: seriesColor(i),
        backgroundColor: seriesColor(i),
        borderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBorderColor: css('--surface'),
        pointBorderWidth: 2,
        spanGaps: true,
        tension: 0,
      })),
    },
    options: {
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: multi, position: 'bottom', labels: { boxWidth: 12, usePointStyle: true } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${c.parsed.y == null ? '–' : Math.round(c.parsed.y) + ySuffix}` } },
      },
      scales: { x: axis(), y: { ...axis(), min: 0, max: yMax, ticks: { ...axis().ticks, callback: (v) => v + ySuffix } } },
    },
  });
}

export function barChart(id, labels, data, { label = '', suffix = '' } = {}) {
  return draw(id, {
    type: 'bar',
    data: { labels, datasets: [{ label, data, backgroundColor: seriesColor(0), borderRadius: 4, maxBarThickness: 36 }] },
    options: {
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${c.parsed.y}${suffix}` } } },
      scales: { x: { ...axis(), grid: { display: false } }, y: { ...axis(), beginAtZero: true, suggestedMax: 60, ticks: { ...axis().ticks, precision: 0 } } },
    },
  });
}
