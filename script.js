const colors = {
  ink: "#111827",
  muted: "#5b6678",
  grid: "rgba(17, 24, 39, 0.14)",
  approved: "#0f766e",
  cancelled: "#c2413b",
  total: "#1d4ed8",
  average: "#d97706",
  rate: "#7c3aed",
};
const numberFormat = new Intl.NumberFormat("en-US");
let trendData = null;
let modelResults = null;

function formatCount(value) {
  return Number.isFinite(value) ? numberFormat.format(value) : "—";
}

function formatPercent(value, digits = 1) {
  return Number.isFinite(value) ? `${(value * 100).toFixed(digits)}%` : "—";
}

function monthLabel(value) {
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en", { month: "short", year: "2-digit", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}

function updateTrendTable(rows) {
  const body = document.getElementById("trendTableBody");
  body.replaceChildren();
  if (!rows.length) {
    const row = body.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 9;
    cell.textContent = "No monthly records are available for this filter.";
    return;
  }
  rows.forEach((item) => {
    const row = body.insertRow();
    const values = [
      monthLabel(item.month),
      item.observed ? formatCount(item.totalApplications) : "No observed records",
      item.observed ? formatCount(item.approved) : "—",
      item.observed ? formatCount(item.cancelled) : "—",
      item.observed ? formatCount(item.unknownOrPending) : "—",
      formatPercent(item.approvalRate),
      formatCount(item.threeMonthAverageApplications),
      formatPercent(item.periodChangeRate),
      item.partialDateCoverage ? "Partial date range" : item.observed ? "Observed" : "No observed records",
    ];
    values.forEach((value) => {
      const cell = row.insertCell();
      cell.textContent = value;
    });
  });
}

function drawLineChart(canvasId, tooltipId, rows, series, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const bounds = canvas.getBoundingClientRect();
  const width = Math.max(280, bounds.width);
  const height = Number(canvas.getAttribute("height")) || 320;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const pad = { top: 42, right: 18, bottom: 48, left: 58 };
  const plotWidth = width - pad.left - pad.right;
  const plotHeight = height - pad.top - pad.bottom;
  const allValues = series.flatMap((line) => rows.map((row) => row[line.key])).filter(Number.isFinite);
  const max = options.fixedMax || Math.max(1, Math.ceil(Math.max(0, ...allValues) * 1.12));
  const min = options.fixedMin || 0;
  const yFor = (value) => pad.top + plotHeight - ((value - min) / (max - min || 1)) * plotHeight;
  const xFor = (index) => pad.left + (rows.length < 2 ? plotWidth / 2 : (index * plotWidth) / (rows.length - 1));

  context.font = "12px Inter, sans-serif";
  context.lineWidth = 1;
  context.strokeStyle = colors.grid;
  context.fillStyle = colors.muted;
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = min + ((max - min) * tick) / 4;
    const y = yFor(value);
    context.beginPath();
    context.moveTo(pad.left, y);
    context.lineTo(width - pad.right, y);
    context.stroke();
    const label = options.percent ? `${Math.round(value * 100)}%` : numberFormat.format(Math.round(value));
    context.fillText(label, 4, y + 4);
  }

  const labelStep = rows.length > 36 ? 6 : rows.length > 18 ? 3 : rows.length > 10 ? 2 : 1;
  rows.forEach((row, index) => {
    if (index % labelStep !== 0 && index !== rows.length - 1) return;
    const x = xFor(index);
    context.save();
    context.translate(x, height - 18);
    context.rotate(-0.35);
    context.fillStyle = colors.muted;
    context.fillText(monthLabel(row.month), -20, 0);
    context.restore();
  });

  series.forEach((line, lineIndex) => {
    context.beginPath();
    let drawing = false;
    rows.forEach((row, index) => {
      const value = row[line.key];
      if (!Number.isFinite(value)) {
        drawing = false;
        return;
      }
      const x = xFor(index);
      const y = yFor(value);
      if (!drawing) context.moveTo(x, y);
      else context.lineTo(x, y);
      drawing = true;
    });
    context.strokeStyle = line.color;
    context.lineWidth = lineIndex === 0 ? 2.8 : 2.2;
    context.setLineDash(line.dash || []);
    context.stroke();
    context.setLineDash([]);

    rows.forEach((row, index) => {
      const value = row[line.key];
      if (!Number.isFinite(value)) return;
      context.beginPath();
      context.arc(xFor(index), yFor(value), 3, 0, Math.PI * 2);
      context.fillStyle = line.color;
      context.fill();
    });
  });

  let legendX = pad.left;
  series.forEach((line) => {
    context.fillStyle = line.color;
    context.fillRect(legendX, 14, 14, 3);
    context.fillStyle = colors.ink;
    context.fillText(line.label, legendX + 20, 19);
    legendX += Math.min(185, context.measureText(line.label).width + 48);
  });

  const tooltip = document.getElementById(tooltipId);
  canvas.onpointermove = (event) => {
    if (!rows.length) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const index = Math.max(0, Math.min(rows.length - 1, Math.round(((x - pad.left) / plotWidth) * (rows.length - 1))));
    const row = rows[index];
    if (x < pad.left || x > width - pad.right) return;
    const details = series.map((line) => `${line.label}: ${options.percent ? formatPercent(row[line.key]) : formatCount(row[line.key])}`).join(" · ");
    tooltip.textContent = `${monthLabel(row.month)}${row.partialDateCoverage ? " (partial date range)" : ""} · ${details}`;
  };
  canvas.onpointerleave = () => {
    tooltip.textContent = "Point to a month for details. The table provides keyboard-accessible values.";
  };
}

function drawModelChart(metrics) {
  const canvas = document.getElementById("modelMetricsChart");
  if (!canvas || !metrics.length) return;
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(280, rect.width);
  const height = Number(canvas.getAttribute("height")) || 360;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.floor(width * ratio);
  canvas.height = Math.floor(height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const pad = { top: 28, right: 12, bottom: 72, left: 42 };
  const plotHeight = height - pad.top - pad.bottom;
  const plotWidth = width - pad.left - pad.right;
  ctx.font = "11px Inter, sans-serif";
  ctx.strokeStyle = colors.grid;
  ctx.fillStyle = colors.muted;
  for (let tick = 0; tick <= 4; tick += 1) {
    const value = tick / 4;
    const y = pad.top + plotHeight - value * plotHeight;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(width - pad.right, y); ctx.stroke();
    ctx.fillText(value.toFixed(2), 2, y + 4);
  }
  const slot = plotWidth / metrics.length;
  const barWidth = Math.max(8, Math.min(24, slot * 0.26));
  metrics.forEach((metric, index) => {
    const center = pad.left + slot * (index + 0.5);
    [[metric.macroF1, colors.approved], [metric.rocAuc, colors.rate]].forEach(([value, color], j) => {
      const barHeight = value * plotHeight;
      ctx.fillStyle = color;
      ctx.fillRect(center + (j === 0 ? -barWidth - 2 : 2), pad.top + plotHeight - barHeight, barWidth, barHeight);
    });
    ctx.save();
    ctx.translate(center, height - 16);
    ctx.rotate(-0.4);
    ctx.fillStyle = colors.ink;
    ctx.fillText(metric.model, -28, 0);
    ctx.restore();
  });
  ctx.fillStyle = colors.approved; ctx.fillRect(pad.left, 6, 12, 12);
  ctx.fillStyle = colors.ink; ctx.fillText("Macro-F1", pad.left + 18, 16);
  ctx.fillStyle = colors.rate; ctx.fillRect(pad.left + 105, 6, 12, 12);
  ctx.fillStyle = colors.ink; ctx.fillText("ROC-AUC", pad.left + 123, 16);
}

function updateModelResults(results) {
  const body = document.getElementById("modelMetricsBody");
  body.replaceChildren();
  results.metrics.forEach((metric) => {
    const row = body.insertRow();
    [metric.model, metric.accuracy, metric.precisionApproved, metric.recallApproved, metric.f1Approved, metric.macroF1, metric.rocAuc]
      .forEach((value, index) => {
        const cell = row.insertCell();
        cell.textContent = index === 0 ? value : Number(value).toFixed(3);
      });
  });
  drawModelChart(results.metrics);
  const matrix = document.getElementById("confusionMatrix");
  matrix.replaceChildren();
  if (results.confusionMatrix?.counts) {
    const counts = results.confusionMatrix.counts;
    const table = document.createElement("table");
    table.innerHTML = '<caption>Actual vs predicted outcomes</caption><thead><tr><th scope="col">Actual / predicted</th><th scope="col">Approved</th><th scope="col">Cancelled</th></tr></thead><tbody></tbody>';
    const body = table.querySelector("tbody");
    [["Approved", counts.actualApprovedPredictedApproved, counts.actualApprovedPredictedCancelled], ["Cancelled", counts.actualCancelledPredictedApproved, counts.actualCancelledPredictedCancelled]].forEach((values) => {
      const row = body.insertRow();
      values.forEach((value, index) => { const cell = row.insertCell(); cell.textContent = index === 0 ? value : formatCount(value); });
    });
    matrix.append(table);
  } else {
    matrix.textContent = results.confusionMatrix?.note || "Counts are unavailable pending verification of the matching model run.";
  }
}

function currentRows() {
  const selectedYear = document.getElementById("trendYearFilter").value;
  return trendData.monthly.filter((item) => selectedYear === "all" || item.month.startsWith(`${selectedYear}-`));
}

function periodChange(rows) {
  if (rows.length < 2) return null;
  const current = rows[rows.length - 1];
  const previous = rows[rows.length - 2];
  if (!current.observed || !previous.observed || current.partialDateCoverage || previous.partialDateCoverage || !previous.totalApplications) return null;
  return (current.totalApplications - previous.totalApplications) / previous.totalApplications;
}

function updateTrendView() {
  if (!trendData) return;
  const rows = currentRows();
  const observed = rows.filter((item) => item.observed);
  const totals = observed.reduce((sum, item) => sum + item.totalApplications, 0);
  const approved = observed.reduce((sum, item) => sum + item.approved, 0);
  const cancelled = observed.reduce((sum, item) => sum + item.cancelled, 0);
  const unknown = observed.reduce((sum, item) => sum + item.unknownOrPending, 0);
  document.getElementById("kpiApplications").textContent = formatCount(totals);
  document.getElementById("kpiApproved").textContent = formatCount(approved);
  document.getElementById("kpiCancelled").textContent = formatCount(cancelled);
  document.getElementById("kpiUnknown").textContent = formatCount(unknown);
  document.getElementById("kpiRate").textContent = formatPercent(approved + cancelled ? approved / (approved + cancelled) : null);
  document.getElementById("kpiChange").textContent = formatPercent(periodChange(rows));

  drawLineChart("trendVolumeChart", "trendVolumeTooltip", rows, [
    { key: "totalApplications", label: "Applications", color: colors.total },
    { key: "threeMonthAverageApplications", label: "3-month average", color: colors.average, dash: [6, 4] },
  ]);
  drawLineChart("trendOutcomeChart", "trendOutcomeTooltip", rows, [
    { key: "approved", label: "Approved", color: colors.approved },
    { key: "cancelled", label: "Cancelled", color: colors.cancelled },
  ]);
  drawLineChart("trendRateChart", "trendRateTooltip", rows, [
    { key: "approvalRate", label: "Approval rate", color: colors.rate },
  ], { percent: true, fixedMax: 1, fixedMin: 0 });
  updateTrendTable(rows);

  const peak = observed.reduce((best, item) => !best || item.totalApplications > best.totalApplications ? item : best, null);
  const peakText = peak ? `${monthLabel(peak.month)} had the highest observed volume at ${formatCount(peak.totalApplications)} applications${peak.partialDateCoverage ? " (partial date range)" : ""}.` : "No observed monthly records are available for this filter.";
  const nonEdgeMonths = observed.filter((item) => !item.partialDateCoverage);
  const firstFull = nonEdgeMonths[0];
  const lastFull = nonEdgeMonths[nonEdgeMonths.length - 1];
  let volumeText = " No non-edge months are available for a span comparison.";
  if (firstFull && lastFull && firstFull.totalApplications > 0) {
    const spanChange = (lastFull.totalApplications - firstFull.totalApplications) / firstFull.totalApplications;
    volumeText = ` Across non-edge months, volume moved from ${formatCount(firstFull.totalApplications)} in ${monthLabel(firstFull.month)} to ${formatCount(lastFull.totalApplications)} in ${monthLabel(lastFull.month)} (${formatPercent(spanChange)} over the span).`;
  }
  const rates = nonEdgeMonths.filter((item) => Number.isFinite(item.approvalRate));
  let rateText = " Approval-rate comparisons are unavailable for this filter.";
  if (rates.length) {
    const lowRate = rates.reduce((best, item) => item.approvalRate < best.approvalRate ? item : best);
    const highRate = rates.reduce((best, item) => item.approvalRate > best.approvalRate ? item : best);
    rateText = ` Among non-edge months, approval rate ranged from ${formatPercent(lowRate.approvalRate)} (${monthLabel(lowRate.month)}) to ${formatPercent(highRate.approvalRate)} (${monthLabel(highRate.month)}).`;
  }
  const latest = rows[rows.length - 1];
  const latestText = latest?.partialDateCoverage ? ` The latest period, ${monthLabel(latest.month)}, is partial and is not used for a month-over-month change.` : "";
  document.getElementById("storyWhat").textContent = peakText + volumeText + rateText + latestText;

  const selectedYear = document.getElementById("trendYearFilter").value;
  const meta = trendData.metadata;
  const rangeText = selectedYear === "all" ? `${meta.coverageStartDate} to ${meta.coverageEndDate}` : `Selected year: ${selectedYear}`;
  document.getElementById("trendRange").textContent = rangeText;
}

async function loadTrendData() {
  const response = await fetch("assets/loan-trends.json");
  if (!response.ok) throw new Error("Trend aggregate is unavailable.");
  trendData = await response.json();
  const select = document.getElementById("trendYearFilter");
  [...new Set(trendData.monthly.map((item) => item.month.slice(0, 4)))].forEach((year) => {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    select.append(option);
  });
  const meta = trendData.metadata;
  document.getElementById("sourcePopulationSummary").textContent = `Supplied extract: ${formatCount(meta.rawRows)} rows; ${formatCount(meta.uniqueDatedApplications)} usable unique applications after duplicate handling; ${formatCount(meta.clearOutcomeApplications)} exclusive clear outcomes (${formatCount(meta.approvedApplications)} approved, ${formatCount(meta.cancelledApplications)} cancelled; ${formatPercent(meta.approvalRate)} approval rate) and ${formatCount(meta.unknownOrPendingApplications)} unknown or ambiguous outcomes. These are distinct from the earlier summary and model populations above.`;
  const audit = meta.relatedDateAudit;
  document.getElementById("trendDateAudit").textContent = `The range is ${meta.coverageStartDate} to ${meta.coverageEndDate}; all retained dates parse. It matches the related export’s transaction date on ${formatCount(audit?.transDateMatchesTransactionDate)} of ${formatCount(audit?.matchedUniqueApplicationIds)} matched IDs and differs from its submitted-on date for ${formatCount(audit?.transDateDiffersFromSubmittedOn)}.`;
  document.getElementById("duplicateSummary").textContent = `${formatCount(meta.duplicateIds)} duplicate application IDs were found (${formatCount(meta.duplicateRowsCollapsedOrExcluded)} extra rows). ${formatCount(meta.conflictingDuplicateIdsExcluded)} inconsistent duplicate groups were excluded. ${formatCount(meta.ambiguousApprovedAndCancelled)} records had both outcome flags set and are counted as ambiguous.`;
  document.getElementById("seasonalitySummary").textContent = `${meta.seasonalityNote} ${meta.forecastNote}`;
  document.getElementById("joinedPopulationSummary").textContent = `The related-file join has ${formatCount(audit?.matchedClearOutcomeApplications)} clear outcomes.`;
  updateTrendView();
}

function setupLightbox() {
  const dialog = document.getElementById("imageLightbox");
  const image = document.getElementById("lightboxImage");
  const caption = document.getElementById("lightboxCaption");
  if (!dialog || !image || !caption || typeof dialog.showModal !== "function") return;
  document.querySelectorAll(".lightbox-trigger").forEach((button) => {
    button.addEventListener("click", () => {
      const source = button.querySelector("img");
      if (!source) return;
      image.src = source.currentSrc || source.src;
      image.alt = source.alt;
      caption.textContent = button.dataset.caption || source.alt;
      dialog.showModal();
    });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
}

function setupResumeFallback() {
  const links = [...document.querySelectorAll(".resume-download")];
  if (!links.length) return;
  const pdfUrl = links[0].href;
  const fallback = links[0].dataset.fallback;
  fetch(pdfUrl, { method: "HEAD" }).then((response) => {
    if (response.ok) return;
    links.forEach((link) => { link.href = fallback; link.textContent = "Download Resume (DOCX)"; });
  }).catch(() => {
    links.forEach((link) => { link.href = fallback; link.textContent = "Download Resume (DOCX)"; });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("trendYearFilter")?.addEventListener("change", updateTrendView);
  window.addEventListener("resize", () => {
    if (!trendData) return;
    window.clearTimeout(window.__portfolioResize);
    window.__portfolioResize = window.setTimeout(() => {
      updateTrendView();
      if (modelResults) drawModelChart(modelResults.metrics);
    }, 140);
  });
  setupLightbox();
  setupResumeFallback();
  loadTrendData().catch(() => {
    document.getElementById("sourcePopulationSummary").textContent = "Aggregate data could not be loaded. Regenerate assets/loan-trends.json with the documented script.";
    document.getElementById("storyWhat").textContent = "No calculated highlights are available.";
  });
  fetch("projects/loan-approval-analysis/results.json")
    .then((response) => { if (!response.ok) throw new Error("Model results are unavailable."); return response.json(); })
    .then((results) => { modelResults = results; updateModelResults(results); })
    .catch(() => {
      document.getElementById("modelMetricsBody").innerHTML = '<tr><td colspan="7">Model results could not be loaded.</td></tr>';
    });
});
