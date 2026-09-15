const chartTheme = {
  ink: "#111827",
  muted: "#5b6678",
  aqua: "#2ab7ca",
  coral: "#ef6262",
  gold: "#f2c14e",
  leaf: "#65a30d",
  white: "#ffffff",
  grid: "rgba(255,255,255,0.12)",
};

function setupCanvas(canvas) {
  const context = canvas.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(Number(canvas.getAttribute("height")) * ratio));
  context.scale(ratio, ratio);
  return { context, width: rect.width, height: Number(canvas.getAttribute("height")) };
}

function drawBars(canvasId, data) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { context, width, height } = setupCanvas(canvas);
  const pad = { top: 18, right: 18, bottom: 46, left: 42 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const max = Math.max(...data.map((item) => item.value)) + 6;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = chartTheme.grid;
  context.lineWidth = 1;
  context.font = "12px Inter, sans-serif";
  context.fillStyle = "#cbd5e1";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + chartHeight - (chartHeight * i) / 4;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    context.fillText(`${Math.round((max * i) / 4)}%`, 4, y + 4);
  }

  const gap = 14;
  const barWidth = Math.max(28, (chartWidth - gap * (data.length - 1)) / data.length);
  data.forEach((item, index) => {
    const x = pad.left + index * (barWidth + gap);
    const barHeight = (item.value / max) * chartHeight;
    const y = pad.top + chartHeight - barHeight;
    context.fillStyle = item.color;
    context.fillRect(x, y, barWidth, barHeight);
    context.fillStyle = "#ffffff";
    context.font = "700 12px Inter, sans-serif";
    context.fillText(`${item.value}%`, x, y - 8);
    context.fillStyle = "#cbd5e1";
    context.font = "12px Inter, sans-serif";
    context.fillText(item.label, x, height - 18);
  });
}

function drawRadar(canvasId, axes) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { context, width, height } = setupCanvas(canvas);
  const centerX = width / 2;
  const centerY = height / 2 + 8;
  const radius = Math.min(width, height) * 0.31;
  const levels = 4;

  context.clearRect(0, 0, width, height);
  context.strokeStyle = chartTheme.grid;
  context.fillStyle = "#cbd5e1";
  context.font = "12px Inter, sans-serif";

  for (let level = 1; level <= levels; level += 1) {
    context.beginPath();
    axes.forEach((axis, index) => {
      const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
      const pointRadius = (radius * level) / levels;
      const x = centerX + Math.cos(angle) * pointRadius;
      const y = centerY + Math.sin(angle) * pointRadius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.closePath();
    context.stroke();
  }

  axes.forEach((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (radius + 28);
    const y = centerY + Math.sin(angle) * (radius + 22);
    context.fillText(axis.label, x - 24, y);
  });

  context.beginPath();
  axes.forEach((axis, index) => {
    const angle = (Math.PI * 2 * index) / axes.length - Math.PI / 2;
    const pointRadius = radius * axis.value;
    const x = centerX + Math.cos(angle) * pointRadius;
    const y = centerY + Math.sin(angle) * pointRadius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
  context.fillStyle = "rgba(42, 183, 202, 0.35)";
  context.strokeStyle = chartTheme.aqua;
  context.lineWidth = 3;
  context.fill();
  context.stroke();
}

function drawLineChart(canvasId, series) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const { context, width, height } = setupCanvas(canvas);
  const pad = { top: 18, right: 18, bottom: 42, left: 42 };
  const chartWidth = width - pad.left - pad.right;
  const chartHeight = height - pad.top - pad.bottom;
  const max = Math.max(...series.flatMap((item) => item.values)) + 20;
  const labels = ["Race 1", "Race 2", "Race 3", "Race 4", "Race 5"];

  context.clearRect(0, 0, width, height);
  context.strokeStyle = "rgba(17, 24, 39, 0.12)";
  context.lineWidth = 1;
  context.font = "12px Inter, sans-serif";
  context.fillStyle = chartTheme.muted;

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + chartHeight - (chartHeight * i) / 4;
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
  }

  labels.forEach((label, index) => {
    const x = pad.left + (chartWidth * index) / (labels.length - 1);
    context.fillText(label, x - 18, height - 14);
  });

  series.forEach((item) => {
    context.beginPath();
    item.values.forEach((value, index) => {
      const x = pad.left + (chartWidth * index) / (item.values.length - 1);
      const y = pad.top + chartHeight - (value / max) * chartHeight;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    });
    context.strokeStyle = item.color;
    context.lineWidth = 3;
    context.stroke();

    item.values.forEach((value, index) => {
      const x = pad.left + (chartWidth * index) / (item.values.length - 1);
      const y = pad.top + chartHeight - (value / max) * chartHeight;
      context.fillStyle = item.color;
      context.beginPath();
      context.arc(x, y, 4, 0, Math.PI * 2);
      context.fill();
    });
  });

  series.forEach((item, index) => {
    const x = pad.left + index * 118;
    context.fillStyle = item.color;
    context.fillRect(x, 4, 12, 12);
    context.fillStyle = chartTheme.ink;
    context.fillText(item.label, x + 18, 14);
  });
}

const tekkenData = [
  { label: "Rush", value: 58, color: chartTheme.coral },
  { label: "Mishima", value: 54, color: chartTheme.gold },
  { label: "Poke", value: 61, color: chartTheme.aqua },
  { label: "Grapple", value: 49, color: chartTheme.leaf },
  { label: "Zoner", value: 52, color: "#a78bfa" },
];

const skillData = [
  { label: "SQL", value: 0.88 },
  { label: "Python", value: 0.84 },
  { label: "EDA", value: 0.86 },
  { label: "BI", value: 0.82 },
  { label: "Databricks", value: 0.74 },
  { label: "Story", value: 0.8 },
];

const f1Data = [
  { label: "Red Bull", values: [38, 64, 91, 116, 145], color: chartTheme.coral },
  { label: "Ferrari", values: [30, 58, 76, 105, 126], color: chartTheme.gold },
  { label: "McLaren", values: [22, 49, 71, 96, 132], color: chartTheme.aqua },
];

function renderCharts() {
  drawBars("tekkenWinChart", tekkenData);
  drawRadar("skillRadar", skillData);
  drawLineChart("f1PointsChart", f1Data);
}

window.addEventListener("load", renderCharts);
window.addEventListener("resize", () => {
  window.clearTimeout(window.__portfolioResize);
  window.__portfolioResize = window.setTimeout(renderCharts, 120);
});
