/**
 * Property Graph Component
 *
 * Renders a simple sparkline graph for time-series data like MoneyGraph.
 */

export interface GraphOptions {
  width?: number;
  height?: number;
  lineColor?: string;
  fillColor?: string;
  showLabels?: boolean;
  showGrid?: boolean;
}

const DEFAULT_OPTIONS: GraphOptions = {
  width: 280,
  height: 60,
  lineColor: '#4a90e2',
  fillColor: 'rgba(74, 144, 226, 0.2)',
  showLabels: true,
  showGrid: false,
};

/**
 * Render a sparkline graph
 */
export function renderSparklineGraph(
  values: number[],
  options: GraphOptions = {}
): HTMLElement {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const container = document.createElement('div');
  container.className = 'property-graph';

  if (values.length < 2) {
    container.innerHTML = '<div class="graph-empty">No data</div>';
    return container;
  }

  // Create canvas
  const canvas = document.createElement('canvas');
  canvas.className = 'graph-canvas';
  canvas.width = opts.width!;
  canvas.height = opts.height!;
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    container.innerHTML = '<div class="graph-error">Canvas not supported</div>';
    return container;
  }

  // Calculate min/max
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  // Padding
  const padding = { top: 5, right: 5, bottom: 5, left: 5 };
  const graphWidth = canvas.width - padding.left - padding.right;
  const graphHeight = canvas.height - padding.top - padding.bottom;

  // Calculate points
  const points: { x: number; y: number }[] = [];
  const stepX = graphWidth / (values.length - 1);

  for (let i = 0; i < values.length; i++) {
    const x = padding.left + i * stepX;
    const normalizedY = (values[i] - minVal) / range;
    const y = padding.top + graphHeight - normalizedY * graphHeight;
    points.push({ x, y });
  }

  // Draw fill
  ctx.beginPath();
  ctx.moveTo(points[0].x, canvas.height - padding.bottom);
  for (const point of points) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.lineTo(points[points.length - 1].x, canvas.height - padding.bottom);
  ctx.closePath();
  ctx.fillStyle = opts.fillColor!;
  ctx.fill();

  // Draw line
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.strokeStyle = opts.lineColor!;
  ctx.lineWidth = 2;
  ctx.stroke();

  // Draw dots at start and end
  ctx.fillStyle = opts.lineColor!;
  ctx.beginPath();
  ctx.arc(points[0].x, points[0].y, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(points[points.length - 1].x, points[points.length - 1].y, 3, 0, Math.PI * 2);
  ctx.fill();

  // Add labels if enabled
  if (opts.showLabels) {
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'graph-labels';

    const minLabel = document.createElement('span');
    minLabel.className = 'graph-label graph-label-min';
    minLabel.textContent = formatGraphValue(minVal);

    const maxLabel = document.createElement('span');
    maxLabel.className = 'graph-label graph-label-max';
    maxLabel.textContent = formatGraphValue(maxVal);

    const currentLabel = document.createElement('span');
    currentLabel.className = 'graph-label graph-label-current';
    const current = values[values.length - 1];
    currentLabel.textContent = `Current: ${formatGraphValue(current)}`;

    // Trend indicator
    const trend = current - values[0];
    const trendSpan = document.createElement('span');
    trendSpan.className = 'graph-trend';
    if (trend > 0) {
      trendSpan.classList.add('trend-up');
      trendSpan.textContent = ` (+${formatGraphValue(trend)})`;
    } else if (trend < 0) {
      trendSpan.classList.add('trend-down');
      trendSpan.textContent = ` (${formatGraphValue(trend)})`;
    }
    currentLabel.appendChild(trendSpan);

    labelsContainer.appendChild(minLabel);
    labelsContainer.appendChild(maxLabel);
    labelsContainer.appendChild(currentLabel);
    container.appendChild(labelsContainer);
  }

  return container;
}

/**
 * Format a graph value for display
 */
function formatGraphValue(value: number): string {
  const absVal = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absVal >= 1e9) {
    return `${sign}$${(absVal / 1e9).toFixed(1)}B`;
  } else if (absVal >= 1e6) {
    return `${sign}$${(absVal / 1e6).toFixed(1)}M`;
  } else if (absVal >= 1e3) {
    return `${sign}$${(absVal / 1e3).toFixed(1)}K`;
  }
  return `${sign}$${absVal.toFixed(0)}`;
}

/**
 * Render a mini bar chart (alternative visualization)
 */
export function renderBarChart(
  values: number[],
  labels?: string[],
  options: GraphOptions = {}
): HTMLElement {
  const opts = { ...DEFAULT_OPTIONS, ...options, height: 80 };
  const container = document.createElement('div');
  container.className = 'property-bar-chart';

  if (values.length === 0) {
    container.innerHTML = '<div class="chart-empty">No data</div>';
    return container;
  }

  const maxVal = Math.max(...values, 1);
  const barWidth = Math.min(30, (opts.width! - 20) / values.length - 4);

  const barsContainer = document.createElement('div');
  barsContainer.className = 'bars-container';
  barsContainer.style.height = `${opts.height}px`;

  values.forEach((val, idx) => {
    const barWrapper = document.createElement('div');
    barWrapper.className = 'bar-wrapper';
    barWrapper.style.width = `${barWidth}px`;

    const bar = document.createElement('div');
    bar.className = 'bar';
    const height = (val / maxVal) * (opts.height! - 20);
    bar.style.height = `${height}px`;
    bar.style.backgroundColor = val >= 0 ? opts.lineColor! : '#ef4444';

    const label = document.createElement('div');
    label.className = 'bar-label';
    label.textContent = labels?.[idx] || (idx + 1).toString();

    barWrapper.appendChild(bar);
    barWrapper.appendChild(label);
    barsContainer.appendChild(barWrapper);
  });

  container.appendChild(barsContainer);
  return container;
}
