// build: 2026-07-06b (redeploy trigger)
const DEFAULT_CATEGORIES = [
  "Housing/Rent", "Utilities", "Groceries", "Transportation", "Insurance",
  "Debt/Loan Payments", "Dining Out", "Entertainment", "Subscriptions",
  "Health/Medical", "Personal Care", "Savings/Investments", "Miscellaneous",
];

function zeroBudgets(cats) {
  const b = {};
  cats.forEach((c) => (b[c] = 0));
  return b;
}

function deriveCategoriesFromData(data) {
  const set = new Set(DEFAULT_CATEGORIES);
  Object.values(data.budgetsByMonth || {}).forEach((monthBudgets) => {
    Object.keys(monthBudgets).forEach((c) => set.add(c));
  });
  (data.transactions || []).forEach((t) => set.add(t.category));
  return Array.from(set);
}

const DEFAULT_CURRENCIES = [
  { code: "AUD", symbol: "$" },
  { code: "INR", symbol: "₹" },
];
const DEFAULT_EXCHANGE_RATE = 55; // starting default: units of a new currency per 1 home-currency unit

function currencySymbol(code) {
  const c = (state.currencies || []).find((x) => x.code === code);
  return c ? c.symbol : code;
}

function getCategoryCurrency(c) {
  return (state.categoryCurrency && state.categoryCurrency[c]) || state.homeCurrency;
}

// Returns this month's home->currency rate, auto-carrying forward from the
// most recent prior month (per currency) the same way budgets do.
function getExchangeRateForMonth(month, currency) {
  if (currency === state.homeCurrency) return 1;
  if (state.exchangeRatesByMonth[month] && state.exchangeRatesByMonth[month][currency] != null) {
    return state.exchangeRatesByMonth[month][currency];
  }
  const priorMonths = Object.keys(state.exchangeRatesByMonth).filter((m) => m < month).sort();
  for (let i = priorMonths.length - 1; i >= 0; i--) {
    const pm = state.exchangeRatesByMonth[priorMonths[i]];
    if (pm && pm[currency] != null) {
      if (!state.exchangeRatesByMonth[month]) state.exchangeRatesByMonth[month] = {};
      state.exchangeRatesByMonth[month][currency] = pm[currency];
      saveData();
      return pm[currency];
    }
  }
  if (!state.exchangeRatesByMonth[month]) state.exchangeRatesByMonth[month] = {};
  state.exchangeRatesByMonth[month][currency] = DEFAULT_EXCHANGE_RATE;
  saveData();
  return DEFAULT_EXCHANGE_RATE;
}

function toAUD(amount, currency, month) {
  if (currency === state.homeCurrency) return amount;
  const rate = getExchangeRateForMonth(month, currency) || DEFAULT_EXCHANGE_RATE;
  return amount / rate;
}

function fromAUD(amountAUD, toCurrency, month) {
  if (toCurrency === state.homeCurrency) return amountAUD;
  const rate = getExchangeRateForMonth(month, toCurrency) || DEFAULT_EXCHANGE_RATE;
  return amountAUD * rate;
}

const DEFAULT_INCOME_SOURCES = ["Primary Income"];

function getIncomeSourceCurrency(name) {
  return (state.incomeSourceCurrency && state.incomeSourceCurrency[name]) || state.homeCurrency;
}

// Returns this month's income-by-source object, auto-carrying forward from
// the most recent prior month the first time a new month is viewed.
function getIncomeForMonth(month) {
  if (state.incomeByMonth[month]) return state.incomeByMonth[month];
  const priorMonths = Object.keys(state.incomeByMonth).filter((m) => m < month).sort();
  const source = priorMonths.length ? state.incomeByMonth[priorMonths[priorMonths.length - 1]] : zeroBudgets(state.incomeSources);
  state.incomeByMonth[month] = { ...source };
  saveData();
  return state.incomeByMonth[month];
}

function getTotalIncomeAUD(month) {
  const income = getIncomeForMonth(month);
  return state.incomeSources.reduce((s, name) => s + toAUD(income[name] || 0, getIncomeSourceCurrency(name), month), 0);
}

const CATEGORY_COLORS = [
  "#2563EB", "#D97706", "#16A34A", "#0D9488", "#4F46E5", "#DB2777",
  "#7C3AED", "#0891B2", "#CA8A04", "#DC2626", "#059669", "#EA580C", "#4338CA",
  "#65A30D", "#9333EA", "#0369A1",
];

function categoryColor(c) {
  const i = state.categories.indexOf(c);
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

function lerpColor(hex1, hex2, t) {
  const c1 = parseInt(hex1.slice(1), 16), c2 = parseInt(hex2.slice(1), 16);
  const r1 = (c1 >> 16) & 255, g1 = (c1 >> 8) & 255, b1 = c1 & 255;
  const r2 = (c2 >> 16) & 255, g2 = (c2 >> 8) & 255, b2 = c2 & 255;
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Smoothly blends green -> lime as spending approaches the budget (0-100%),
// only breaking to a solid red once actually over budget.
function progressColor(pct, over) {
  if (over) return "#DC2626";
  return lerpColor("#16A34A", "#84CC16", Math.max(0, Math.min(1, pct)));
}

const STORAGE_KEY = "expensePlanner_v2";

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function addMonths(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function blankData() {
  const today = new Date();
  const y = today.getFullYear(), m = today.getMonth();
  const pad = (n) => String(n).padStart(2, "0");
  const thisMonth = `${y}-${pad(m + 1)}`;
  return {
    savingsGoal: 0,
    categories: [...DEFAULT_CATEGORIES],
    categoryCurrency: {},
    incomeSources: [...DEFAULT_INCOME_SOURCES],
    incomeSourceCurrency: {},
    incomeByMonth: { [thisMonth]: zeroBudgets(DEFAULT_INCOME_SOURCES) },
    currencies: DEFAULT_CURRENCIES.map((c) => ({ ...c })),
    homeCurrency: "AUD",
    displayCurrency: "AUD",
    exchangeRatesByMonth: { [thisMonth]: {} },
    budgetsByMonth: { [thisMonth]: zeroBudgets(DEFAULT_CATEGORIES) },
    transactions: [],
    recurringTemplates: [],
    plannedExpenses: [],
    skippedRecurring: {},
    lastBackupAt: null,
  };
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let state = loadData();
let currentMonth = null;
let currentView = "dashboard";
let selectedChip = state.categories[0];
let txSearchQuery = "";

// Brings an older (or imported) data object up to the current arbitrary-currency
// schema: migrates the old Australia/India country tags into currency codes,
// migrates flat per-month exchange-rate numbers into per-currency maps, and
// fills in defaults for fields that didn't exist yet.
function migrateCurrencyFields(parsed) {
  if (!parsed.homeCurrency) parsed.homeCurrency = "AUD";
  if (!Array.isArray(parsed.currencies) || !parsed.currencies.length) {
    parsed.currencies = DEFAULT_CURRENCIES.map((c) => ({ ...c }));
  }
  if (!parsed.categoryCurrency || typeof parsed.categoryCurrency !== "object") {
    parsed.categoryCurrency = {};
    if (parsed.categoryCountry && typeof parsed.categoryCountry === "object") {
      Object.entries(parsed.categoryCountry).forEach(([cat, country]) => {
        parsed.categoryCurrency[cat] = country === "India" ? "INR" : "AUD";
      });
    }
  }
  if (!parsed.incomeSourceCurrency || typeof parsed.incomeSourceCurrency !== "object") {
    parsed.incomeSourceCurrency = {};
    if (parsed.incomeSourceCountry && typeof parsed.incomeSourceCountry === "object") {
      Object.entries(parsed.incomeSourceCountry).forEach(([src, country]) => {
        parsed.incomeSourceCurrency[src] = country === "India" ? "INR" : "AUD";
      });
    }
  }
  if (!parsed.displayCurrency) parsed.displayCurrency = "AUD";
  if (!parsed.exchangeRatesByMonth || typeof parsed.exchangeRatesByMonth !== "object") parsed.exchangeRatesByMonth = {};
  // migrate old single-number-per-month rates (always meant AUD->INR) into the new per-currency map
  Object.keys(parsed.exchangeRatesByMonth).forEach((m) => {
    if (typeof parsed.exchangeRatesByMonth[m] === "number") {
      parsed.exchangeRatesByMonth[m] = { INR: parsed.exchangeRatesByMonth[m] };
    }
  });
  // make sure every currency actually in use is registered in the currencies list
  const usedCodes = new Set([
    parsed.homeCurrency,
    ...Object.values(parsed.categoryCurrency || {}),
    ...Object.values(parsed.incomeSourceCurrency || {}),
  ]);
  usedCodes.forEach((code) => {
    if (code && !parsed.currencies.some((c) => c.code === code)) {
      const known = DEFAULT_CURRENCIES.find((c) => c.code === code);
      parsed.currencies.push(known ? { ...known } : { code, symbol: code });
    }
  });
  return parsed;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const blank = blankData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blank));
    return blank;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.categories) || !parsed.categories.length) {
      parsed.categories = deriveCategoriesFromData(parsed);
    }
    if (!Array.isArray(parsed.recurringTemplates)) parsed.recurringTemplates = [];
    if (typeof parsed.savingsGoal !== "number") parsed.savingsGoal = 0;
    migrateCurrencyFields(parsed);
    if (!Array.isArray(parsed.plannedExpenses)) parsed.plannedExpenses = [];
    if (!parsed.skippedRecurring || typeof parsed.skippedRecurring !== "object") parsed.skippedRecurring = {};
    if (!Array.isArray(parsed.incomeSources) || !parsed.incomeSources.length) {
      const earliestMonth = Object.keys(parsed.budgetsByMonth || {}).sort()[0] || monthKey(todayStr());
      parsed.incomeSources = [...DEFAULT_INCOME_SOURCES];
      parsed.incomeSourceCurrency = {};
      parsed.incomeByMonth = { [earliestMonth]: { [DEFAULT_INCOME_SOURCES[0]]: Number(parsed.income) || 0 } };
    }
    if (!parsed.incomeByMonth || typeof parsed.incomeByMonth !== "object") parsed.incomeByMonth = {};
    if (parsed.lastBackupAt === undefined) parsed.lastBackupAt = null;
    return parsed;
  } catch {
    const blank = blankData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(blank));
    return blank;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function fmt(n, currency = "AUD") {
  const symbol = currencySymbol(currency);
  const sign = n < 0 ? "-" : "";
  return sign + symbol + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function getAvailableMonths() {
  const set = new Set(state.transactions.map((t) => monthKey(t.date)));
  Object.keys(state.budgetsByMonth).forEach((m) => set.add(m));
  set.add(monthKey(todayStr()));
  return Array.from(set).sort();
}

// Returns the budget object for a month, auto-carrying forward the most
// recent prior month's budget the first time a new month is viewed.
function getBudgetsForMonth(month) {
  if (state.budgetsByMonth[month]) return state.budgetsByMonth[month];
  const priorMonths = Object.keys(state.budgetsByMonth).filter((m) => m < month).sort();
  const source = priorMonths.length ? state.budgetsByMonth[priorMonths[priorMonths.length - 1]] : zeroBudgets(state.categories);
  state.budgetsByMonth[month] = { ...source };
  saveData();
  return state.budgetsByMonth[month];
}

function populateMonthSelector() {
  const sel = document.getElementById("monthSelect");
  const months = getAvailableMonths();
  if (!currentMonth || !months.includes(currentMonth)) {
    currentMonth = monthKey(todayStr());
  }
  sel.innerHTML = months.map((m) => `<option value="${m}" ${m === currentMonth ? "selected" : ""}>${monthLabel(m)}</option>`).join("");
  sel.onchange = () => {
    currentMonth = sel.value;
    render();
  };
}

function categoryTotalsForMonth(month) {
  const totals = {};
  state.categories.forEach((c) => (totals[c] = 0));
  state.transactions.filter((t) => monthKey(t.date) === month).forEach((t) => {
    totals[t.category] = (totals[t.category] || 0) + Number(t.amount);
  });
  return totals;
}

const CURRENCY_COLORS = ["#0D9488", "#D97706", "#4F46E5", "#DC2626", "#0EA5E9", "#059669", "#DB2777"];
function currencyColor(code) {
  const idx = (state.currencies || []).findIndex((c) => c.code === code);
  return CURRENCY_COLORS[idx >= 0 ? idx % CURRENCY_COLORS.length : 0];
}

function renderCurrencyBreakdown() {
  const totals = categoryTotalsForMonth(currentMonth);
  const budgets = getBudgetsForMonth(currentMonth);
  const byCurrency = {};
  (state.currencies || []).forEach((c) => (byCurrency[c.code] = { actual: 0, budgeted: 0 }));
  state.categories.forEach((c) => {
    const cur = getCategoryCurrency(c);
    if (!byCurrency[cur]) byCurrency[cur] = { actual: 0, budgeted: 0 };
    byCurrency[cur].actual += totals[c] || 0;
    byCurrency[cur].budgeted += budgets[c] || 0;
  });

  const usedCodes = new Set([...Object.values(state.categoryCurrency || {}), ...Object.values(state.incomeSourceCurrency || {})]);
  const codes = Object.keys(byCurrency).filter((code) => code === state.homeCurrency || usedCodes.has(code));

  document.getElementById("countryBreakdown").innerHTML = codes.map((cur) => {
    const homeLine = cur !== state.homeCurrency
      ? `<div class="country-spent">${fmt(toAUD(byCurrency[cur].actual, cur, currentMonth), state.homeCurrency)} <span class="country-budget-inline">(${fmt(toAUD(byCurrency[cur].budgeted, cur, currentMonth), state.homeCurrency)})</span></div>`
      : "";
    return `
    <div class="country-card" style="--country-color:${currencyColor(cur)}">
      <div class="country-name">${cur}</div>
      <div class="country-spent">${fmt(byCurrency[cur].actual, cur)} <span class="country-budget-inline">(${fmt(byCurrency[cur].budgeted, cur)})</span></div>
      ${homeLine}
    </div>
  `;
  }).join("");
}

function daysSince(dateStr) {
  if (!dateStr) return Infinity;
  return Math.floor((new Date() - new Date(dateStr)) / (1000 * 60 * 60 * 24));
}

function renderBackupReminder() {
  const el = document.getElementById("backupReminder");
  const days = daysSince(state.lastBackupAt);
  if (days < 30) {
    el.innerHTML = "";
    return;
  }
  const msg = state.lastBackupAt
    ? `It's been ${days} days since your last backup.`
    : "You haven't backed up your data yet.";
  el.innerHTML = `
    <div class="backup-reminder">
      <span>${msg} Keep your data safe with a quick export.</span>
      <button type="button" class="btn btn-indigo" id="backupReminderBtn">Export Now</button>
    </div>
  `;
  document.getElementById("backupReminderBtn").addEventListener("click", exportJSON);
}

function renderCategoryPie() {
  const totals = categoryTotalsForMonth(currentMonth);
  const rows = state.categories
    .map((c) => ({ c, aud: toAUD(totals[c] || 0, getCategoryCurrency(c), currentMonth) }))
    .filter((r) => r.aud > 0.004)
    .sort((a, b) => b.aud - a.aud);

  const el = document.getElementById("categoryPie");
  if (rows.length === 0) {
    el.innerHTML = `<div class="empty-state">No spending logged yet this month.</div>`;
    return;
  }

  const total = rows.reduce((s, r) => s + r.aud, 0);
  const cx = 60, cy = 60, r = 55;
  let svgSlices;

  if (rows.length === 1) {
    svgSlices = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${categoryColor(rows[0].c)}"></circle>`;
  } else {
    let angle = -90;
    svgSlices = rows.map(({ c, aud }) => {
      const fraction = aud / total;
      const startAngle = angle;
      angle += fraction * 360;
      const endAngle = angle;
      const large = endAngle - startAngle > 180 ? 1 : 0;
      const x1 = cx + r * Math.cos((Math.PI * startAngle) / 180);
      const y1 = cy + r * Math.sin((Math.PI * startAngle) / 180);
      const x2 = cx + r * Math.cos((Math.PI * endAngle) / 180);
      const y2 = cy + r * Math.sin((Math.PI * endAngle) / 180);
      const path = `M ${cx},${cy} L ${x1},${y1} A ${r},${r} 0 ${large},1 ${x2},${y2} Z`;
      return `<path d="${path}" fill="${categoryColor(c)}" stroke="white" stroke-width="1"></path>`;
    }).join("");
  }

  const legend = rows.map(({ c, aud }) => `
    <div class="pie-legend-row">
      <span class="pie-legend-dot" style="background:${categoryColor(c)}"></span>
      <span class="pie-legend-name">${escapeHtml(c)}</span>
      <span class="pie-legend-pct">${((aud / total) * 100).toFixed(1)}%</span>
    </div>
  `).join("");

  el.innerHTML = `
    <div class="pie-chart-row">
      <svg viewBox="0 0 120 120" width="120" height="120">${svgSlices}</svg>
      <div class="pie-legend">${legend}</div>
    </div>
  `;
}

// Auto-creates this month's occurrence of each recurring transaction the
// first time the month is viewed, tagged with recurringId so it's never
// duplicated on subsequent views.
function ensureRecurringForMonth(month) {
  let changed = false;
  (state.recurringTemplates || []).forEach((tpl) => {
    if (tpl.confirmBeforeLogging) return; // handled via the Bills Due confirmation flow instead
    const exists = state.transactions.some((t) => t.recurringId === tpl.id && monthKey(t.date) === month);
    if (!exists) {
      const [y, m] = month.split("-").map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      const day = Math.min(tpl.day, lastDay);
      const date = `${month}-${String(day).padStart(2, "0")}`;
      state.transactions.push({
        id: cryptoId(),
        date,
        category: tpl.category,
        note: tpl.note,
        amount: tpl.amount,
        recurringId: tpl.id,
      });
      changed = true;
    }
  });
  if (changed) saveData();
}

function render() {
  populateMonthSelector();
  ensureRecurringForMonth(currentMonth);
  renderDashboard();
  renderCurrencyBreakdown();
  renderBillsDue();
  renderBackupReminder();
  renderYearlySummary();
  renderTransactions();
  renderBudgetSettings();
  renderCurrencySettings();
  renderIncomeManager();
  renderIncomeAmounts();
  renderCategoryManager();
  renderRecurringList();
  renderPlannedList();
  renderSavingsGoal();
  renderTrendChart();
  renderCategoryPie();
}

// Pending items awaiting your confirmation: recurring templates marked
// "confirm before logging", and one-off planned expenses whose due date
// has arrived. Only shown while viewing the real current month.
function getPendingBills() {
  const today = todayStr();
  const thisMonth = monthKey(today);
  if (currentMonth !== thisMonth) return [];
  const pending = [];
  (state.recurringTemplates || []).forEach((tpl) => {
    if (!tpl.confirmBeforeLogging) return;
    const skipKey = `${tpl.id}:${thisMonth}`;
    if (state.skippedRecurring[skipKey]) return;
    const exists = state.transactions.some((t) => t.recurringId === tpl.id && monthKey(t.date) === thisMonth);
    if (!exists) {
      pending.push({
        type: "recurring", id: tpl.id, category: tpl.category, note: tpl.note, amount: tpl.amount,
        label: `Recurring · around day ${tpl.day}`,
      });
    }
  });
  (state.plannedExpenses || []).forEach((p) => {
    if (p.dueDate <= today) {
      pending.push({
        type: "planned", id: p.id, category: p.category, note: p.note, amount: p.amount,
        label: `Planned · due ${p.dueDate}`,
      });
    }
  });
  return pending;
}

function renderBillsDue() {
  const el = document.getElementById("billsDueSection");
  const pending = getPendingBills();
  if (pending.length === 0) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = pending.map((p, i) => `
    <div class="bill-due-item">
      <div class="bill-due-top">
        <div class="bill-due-info">
          <span class="bill-due-category">${escapeHtml(p.category)}${p.note ? " — " + escapeHtml(p.note) : ""}</span>
          <span class="bill-due-meta">${p.label}</span>
        </div>
        <span class="bill-due-amount">${fmt(Number(p.amount), getCategoryCurrency(p.category))}</span>
      </div>
      <div class="bill-due-actions">
        <button type="button" class="btn btn-teal" data-log-bill="${i}">✓ Log it</button>
        ${p.type === "recurring" ? `<button type="button" class="btn btn-ghost" data-skip-bill="${i}">Skip this month</button>` : ""}
      </div>
    </div>
  `).join("");

  el.querySelectorAll("[data-log-bill]").forEach((btn) => {
    btn.onclick = () => {
      const p = pending[Number(btn.dataset.logBill)];
      state.transactions.push({
        id: cryptoId(), date: todayStr(), category: p.category, note: p.note, amount: Number(p.amount),
        ...(p.type === "recurring" ? { recurringId: p.id } : {}),
      });
      if (p.type === "planned") {
        state.plannedExpenses = state.plannedExpenses.filter((x) => x.id !== p.id);
      }
      saveData();
      render();
    };
  });
  el.querySelectorAll("[data-skip-bill]").forEach((btn) => {
    btn.onclick = () => {
      const p = pending[Number(btn.dataset.skipBill)];
      state.skippedRecurring[`${p.id}:${monthKey(todayStr())}`] = true;
      saveData();
      render();
    };
  });
}

function renderDashboard() {
  const totals = categoryTotalsForMonth(currentMonth);
  const budgets = getBudgetsForMonth(currentMonth);
  const displayCur = state.displayCurrency || "AUD";
  const totalBudgetedAUD = state.categories.reduce((s, c) => s + toAUD(budgets[c] || 0, getCategoryCurrency(c), currentMonth), 0);
  const totalActualAUD = state.categories.reduce((s, c) => s + toAUD(totals[c] || 0, getCategoryCurrency(c), currentMonth), 0);
  const totalBudgeted = fromAUD(totalBudgetedAUD, displayCur, currentMonth);
  const totalActual = fromAUD(totalActualAUD, displayCur, currentMonth);
  const remaining = totalBudgeted - totalActual;

  document.getElementById("kpiBudgeted").textContent = fmt(totalBudgeted, displayCur);
  document.getElementById("kpiActual").textContent = fmt(totalActual, displayCur);
  const remEl = document.getElementById("kpiRemaining");
  remEl.textContent = fmt(remaining, displayCur);
  remEl.style.color = remaining < 0 ? "var(--red-accent)" : "var(--navy)";

  const savedAUD = getTotalIncomeAUD(currentMonth) - totalActualAUD;
  const saved = fromAUD(savedAUD, displayCur, currentMonth);
  const savedEl = document.getElementById("kpiSaved");
  savedEl.textContent = fmt(saved, displayCur);
  savedEl.style.color = saved < 0 ? "var(--red-accent)" : "var(--navy)";

  let overCount = 0, nearCount = 0;
  const rows = state.categories
    .map((c) => {
      const budget = budgets[c] || 0;
      const actual = totals[c] || 0;
      const pct = budget > 0 ? actual / budget : (actual > 0 ? 1.5 : 0);
      const over = actual > budget;
      if (over) overCount++;
      else if (budget > 0 && actual >= 0.9 * budget) nearCount++;
      return { c, budget, actual, pct, over };
    })
    .sort((a, b) => b.actual - a.actual);

  const banner = document.getElementById("watchBanner");
  banner.classList.remove("warn", "danger");
  if (overCount > 0) {
    banner.textContent = `${overCount} categor${overCount === 1 ? "y" : "ies"} over budget`;
    banner.classList.add("danger");
  } else if (nearCount > 0) {
    banner.textContent = `${nearCount} categor${nearCount === 1 ? "y" : "ies"} nearing limit`;
    banner.classList.add("warn");
  } else {
    banner.textContent = "All categories on track";
  }

  document.getElementById("categoryList").innerHTML = rows.map(({ c, budget, actual, pct, over }) => `
    <div class="category-item" style="--cat-color:${categoryColor(c)}">
      <div class="category-item-top">
        <span class="category-name">${c}</span>
        <span class="category-amounts">${fmt(actual, getCategoryCurrency(c))} / ${fmt(budget, getCategoryCurrency(c))}</span>
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width:${Math.min(pct * 100, 100)}%;background:${progressColor(pct, over)}"></div>
      </div>
    </div>
  `).join("");
}

function renderTransactions() {
  const list = state.transactions
    .filter((t) => monthKey(t.date) === currentMonth)
    .filter((t) => {
      if (!txSearchQuery) return true;
      return t.category.toLowerCase().includes(txSearchQuery) || (t.note || "").toLowerCase().includes(txSearchQuery);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const el = document.getElementById("txList");
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state">${txSearchQuery ? "No transactions match your search." : `No transactions logged for ${monthLabel(currentMonth)} yet.`}</div>`;
    return;
  }
  el.innerHTML = list.map((t) => `
    <div class="tx-item" style="--cat-color:${categoryColor(t.category)}">
      <div class="tx-info">
        <span class="tx-category" style="color:${categoryColor(t.category)}">${t.category}</span>
        <span class="tx-meta">${t.date}${t.note ? " · " + escapeHtml(t.note) : ""}</span>
      </div>
      <span class="tx-amount">${fmt(Number(t.amount), getCategoryCurrency(t.category))}</span>
      <button class="tx-edit" data-id="${t.id}">&#9998;</button>
      <button class="tx-delete" data-id="${t.id}">&times;</button>
    </div>
  `).join("");

  el.querySelectorAll(".tx-edit").forEach((btn) => {
    btn.onclick = () => {
      const t = state.transactions.find((tx) => tx.id === btn.dataset.id);
      if (t) openSheet(t);
    };
  });

  el.querySelectorAll(".tx-delete").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("Delete this transaction? This can't be undone.")) return;
      state.transactions = state.transactions.filter((t) => t.id !== btn.dataset.id);
      saveData();
      render();
    };
  });
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

function incomeSourceColor(name) {
  const i = state.incomeSources.indexOf(name);
  return CATEGORY_COLORS[i % CATEGORY_COLORS.length];
}

function renderIncomeManager() {
  document.getElementById("incomeSourceManageList").innerHTML = state.incomeSources.map((name) => `
    <div class="category-manage-item" style="--cat-color:${incomeSourceColor(name)}">
      <input type="text" data-original="${escapeHtml(name)}" value="${escapeHtml(name)}" />
      <select class="cat-country" data-income-currency="${escapeHtml(name)}">
        ${state.currencies.map((cur) => `<option value="${cur.code}" ${getIncomeSourceCurrency(name) === cur.code ? "selected" : ""}>${cur.code}</option>`).join("")}
      </select>
      <button type="button" class="cat-delete" data-del-income="${escapeHtml(name)}">&times;</button>
    </div>
  `).join("");

  document.querySelectorAll("#incomeSourceManageList input").forEach((input) => {
    input.addEventListener("change", () => renameIncomeSource(input.dataset.original, input.value.trim()));
  });
  document.querySelectorAll("#incomeSourceManageList .cat-country").forEach((sel) => {
    sel.addEventListener("change", () => {
      state.incomeSourceCurrency[sel.dataset.incomeCurrency] = sel.value;
      saveData();
      render();
    });
  });
  document.querySelectorAll("#incomeSourceManageList .cat-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteIncomeSource(btn.dataset.delIncome));
  });
}

function renderIncomeAmounts() {
  const income = getIncomeForMonth(currentMonth);
  const nextMonth = addMonths(currentMonth, 1);
  document.getElementById("copyIncomeBtn").textContent = `Copy to ${monthLabel(nextMonth)} →`;

  document.getElementById("incomeList").innerHTML = state.incomeSources.map((name) => `
    <div class="budget-item" style="--cat-color:${incomeSourceColor(name)}">
      <span class="cat-name">${escapeHtml(name)}<span class="cat-currency">${getIncomeSourceCurrency(name)}</span></span>
      <input type="number" inputmode="decimal" step="0.01" data-income-amount="${escapeHtml(name)}" value="${round2(income[name] || 0)}" />
    </div>
  `).join("");

  document.querySelectorAll('#incomeList input').forEach((input) => {
    input.oninput = () => {
      income[input.dataset.incomeAmount] = Number(input.value) || 0;
      saveData();
      renderDashboard();
      updateGoalProgress();
    };
  });
}

function renameIncomeSource(oldName, newName) {
  if (!newName || newName === oldName) {
    renderIncomeManager();
    return;
  }
  if (state.incomeSources.some((n) => n.toLowerCase() === newName.toLowerCase() && n !== oldName)) {
    alert(`"${newName}" already exists.`);
    renderIncomeManager();
    return;
  }
  state.incomeSources = state.incomeSources.map((n) => (n === oldName ? newName : n));
  Object.values(state.incomeByMonth).forEach((monthIncome) => {
    if (oldName in monthIncome) {
      monthIncome[newName] = monthIncome[oldName];
      delete monthIncome[oldName];
    }
  });
  if (oldName in state.incomeSourceCurrency) {
    state.incomeSourceCurrency[newName] = state.incomeSourceCurrency[oldName];
    delete state.incomeSourceCurrency[oldName];
  }
  saveData();
  render();
}

function deleteIncomeSource(name) {
  if (!confirm(`Delete income source "${name}"? This can't be undone.`)) return;
  state.incomeSources = state.incomeSources.filter((n) => n !== name);
  Object.values(state.incomeByMonth).forEach((monthIncome) => {
    delete monthIncome[name];
  });
  delete state.incomeSourceCurrency[name];
  saveData();
  render();
}

function renderBudgetSettings() {
  const budgets = getBudgetsForMonth(currentMonth);
  const nextMonth = addMonths(currentMonth, 1);
  document.getElementById("copyNextBtn").textContent = `Copy to ${monthLabel(nextMonth)} →`;

  document.getElementById("budgetList").innerHTML = state.categories.map((c) => `
    <div class="budget-item" style="--cat-color:${categoryColor(c)}">
      <span class="cat-name">${c}<span class="cat-currency">${getCategoryCurrency(c)}</span></span>
      <input type="number" inputmode="decimal" step="0.01" data-budget-cat="${c}" value="${round2(budgets[c] || 0)}" />
    </div>
  `).join("");

  document.querySelectorAll('#budgetList input').forEach((input) => {
    input.oninput = () => {
      budgets[input.dataset.budgetCat] = Number(input.value) || 0;
      saveData();
      renderDashboard();
      renderCurrencyBreakdown();
    };
  });
}

function renderCurrencySettings() {
  const otherCurrencies = state.currencies.filter((c) => c.code !== state.homeCurrency);

  document.getElementById("currencyRateList").innerHTML = otherCurrencies.map((c) => `
    <div class="category-manage-item" style="--cat-color:${currencyColor(c.code)}">
      <span class="cat-name">1 ${state.homeCurrency} = ${escapeHtml(c.symbol)}</span>
      <input type="number" inputmode="decimal" step="0.01" data-rate-currency="${c.code}" value="${getExchangeRateForMonth(currentMonth, c.code)}" />
      <button type="button" class="cat-delete" data-del-currency="${c.code}">&times;</button>
    </div>
  `).join("");

  document.querySelectorAll("#currencyRateList input").forEach((input) => {
    input.oninput = () => {
      if (!state.exchangeRatesByMonth[currentMonth]) state.exchangeRatesByMonth[currentMonth] = {};
      state.exchangeRatesByMonth[currentMonth][input.dataset.rateCurrency] = Number(input.value) || 0;
      saveData();
      renderDashboard();
      renderCurrencyBreakdown();
      updateGoalProgress();
      renderTrendChart();
    };
  });

  document.querySelectorAll("#currencyRateList .cat-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteCurrency(btn.dataset.delCurrency));
  });

  const nextMonth = addMonths(currentMonth, 1);
  document.getElementById("copyRateBtn").textContent = `Copy rates to ${monthLabel(nextMonth)} →`;

  const currSelect = document.getElementById("displayCurrencySelect");
  currSelect.innerHTML = state.currencies.map((c) => `<option value="${c.code}">${c.code} (${escapeHtml(c.symbol)})</option>`).join("");
  currSelect.value = state.displayCurrency || state.homeCurrency;
  currSelect.onchange = () => {
    state.displayCurrency = currSelect.value;
    saveData();
    render();
  };
}

function addCurrency(code, symbol) {
  code = code.trim().toUpperCase();
  symbol = symbol.trim();
  if (!code) return;
  if (state.currencies.some((c) => c.code === code)) {
    alert(`"${code}" already exists.`);
    return;
  }
  state.currencies.push({ code, symbol: symbol || code });
  saveData();
  render();
}

function deleteCurrency(code) {
  if (code === state.homeCurrency) return;
  const inUse = Object.values(state.categoryCurrency).includes(code) || Object.values(state.incomeSourceCurrency).includes(code);
  if (inUse) {
    alert(`"${code}" is assigned to a category or income source. Reassign those first.`);
    return;
  }
  if (!confirm(`Delete currency "${code}"? This can't be undone.`)) return;
  state.currencies = state.currencies.filter((c) => c.code !== code);
  if (state.displayCurrency === code) state.displayCurrency = state.homeCurrency;
  Object.keys(state.exchangeRatesByMonth).forEach((m) => {
    if (state.exchangeRatesByMonth[m]) delete state.exchangeRatesByMonth[m][code];
  });
  saveData();
  render();
}

function renderCategoryManager() {
  document.getElementById("categoryManageList").innerHTML = state.categories.map((c) => `
    <div class="category-manage-item" style="--cat-color:${categoryColor(c)}">
      <input type="text" data-original="${escapeHtml(c)}" value="${escapeHtml(c)}" />
      <select class="cat-country" data-currency-cat="${escapeHtml(c)}">
        ${state.currencies.map((cur) => `<option value="${cur.code}" ${getCategoryCurrency(c) === cur.code ? "selected" : ""}>${cur.code}</option>`).join("")}
      </select>
      <button type="button" class="cat-delete" data-del-cat="${escapeHtml(c)}">&times;</button>
    </div>
  `).join("");

  document.querySelectorAll("#categoryManageList input").forEach((input) => {
    input.addEventListener("change", () => renameCategory(input.dataset.original, input.value.trim()));
  });
  document.querySelectorAll("#categoryManageList .cat-country").forEach((sel) => {
    sel.addEventListener("change", () => {
      state.categoryCurrency[sel.dataset.currencyCat] = sel.value;
      saveData();
      render();
    });
  });
  document.querySelectorAll("#categoryManageList .cat-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.delCat));
  });
}

function updateGoalProgress() {
  const totals = categoryTotalsForMonth(currentMonth);
  const totalActualAUD = state.categories.reduce((s, c) => s + toAUD(totals[c] || 0, getCategoryCurrency(c), currentMonth), 0);
  const netSavingsAUD = getTotalIncomeAUD(currentMonth) - totalActualAUD;
  const displayCur = state.displayCurrency || "AUD";
  const netSavings = fromAUD(netSavingsAUD, displayCur, currentMonth);
  const goal = fromAUD(state.savingsGoal || 0, displayCur, currentMonth);
  const fill = document.getElementById("goalFill");
  const summary = document.getElementById("goalSummary");

  if (!goal) {
    fill.style.width = "0%";
    fill.style.background = "var(--slate-tint)";
    summary.textContent = "Set a goal to track your savings progress.";
    return;
  }
  const pct = Math.max(0, netSavings / goal);
  fill.style.width = `${Math.min(pct * 100, 100)}%`;
  fill.style.background = progressColor(Math.min(pct, 1), false);
  summary.textContent = netSavings < 0
    ? `${fmt(Math.abs(netSavings), displayCur)} over income so far — no savings yet this month.`
    : `Saved ${fmt(netSavings, displayCur)} of ${fmt(goal, displayCur)} goal (${Math.round(pct * 100)}%).`;
}

function renderSavingsGoal() {
  const goalInput = document.getElementById("savingsGoalInput");
  const displayCur = state.displayCurrency || "AUD";
  goalInput.value = state.savingsGoal ? round2(fromAUD(state.savingsGoal, displayCur, currentMonth)) : "";
  goalInput.oninput = () => {
    const entered = Number(goalInput.value) || 0;
    state.savingsGoal = toAUD(entered, displayCur, currentMonth);
    saveData();
    updateGoalProgress();
  };
  updateGoalProgress();
}

function renderTrendChart() {
  const base = currentMonth || monthKey(todayStr());
  const months = [];
  for (let i = 5; i >= 0; i--) months.push(addMonths(base, -i));
  const displayCur = state.displayCurrency || "AUD";

  const values = months.map((m) => {
    const totals = categoryTotalsForMonth(m);
    const totalAUD = state.categories.reduce((s, c) => s + toAUD(totals[c] || 0, getCategoryCurrency(c), m), 0);
    return fromAUD(totalAUD, displayCur, m);
  });
  const max = Math.max(...values, 1);
  const barW = 32, gap = 14, h = 120;
  const bars = values.map((v, i) => {
    const barH = Math.max(2, (v / max) * (h - 34));
    const x = i * (barW + gap) + gap;
    const y = h - barH - 20;
    const isCurrent = months[i] === currentMonth;
    const color = isCurrent ? "#2563EB" : "#94A3B8";
    const label = monthLabel(months[i]).split(" ")[0];
    const symbol = currencySymbol(displayCur);
    const amountLabel = symbol + (v >= 1000 ? `${Math.round(v / 100) / 10}k` : Math.round(v).toString());
    return `
      <text x="${x + barW / 2}" y="${y - 5}" text-anchor="middle" font-size="9" fill="#334155">${amountLabel}</text>
      <rect x="${x}" y="${y}" width="${barW}" height="${barH}" rx="4" fill="${color}"></rect>
      <text x="${x + barW / 2}" y="${h - 5}" text-anchor="middle" font-size="10" fill="#334155">${label}</text>
    `;
  }).join("");
  const totalW = months.length * (barW + gap) + gap;
  document.getElementById("trendChart").innerHTML =
    `<svg viewBox="0 0 ${totalW} ${h}" width="100%" height="140" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

function renderYearlySummary() {
  const year = (currentMonth || monthKey(todayStr())).slice(0, 4);
  const displayCur = state.displayCurrency || "AUD";
  const monthsInYear = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);

  let yearActualAUD = 0;
  let yearBudgetedAUD = 0;
  let monthsWithData = 0;
  const catTotalsAUD = {};

  monthsInYear.forEach((m) => {
    const totals = categoryTotalsForMonth(m);
    const hasTx = state.transactions.some((t) => monthKey(t.date) === m);
    if (hasTx) monthsWithData++;
    state.categories.forEach((c) => {
      const aud = toAUD(totals[c] || 0, getCategoryCurrency(c), m);
      yearActualAUD += aud;
      catTotalsAUD[c] = (catTotalsAUD[c] || 0) + aud;
    });
    if (state.budgetsByMonth[m]) {
      state.categories.forEach((c) => {
        yearBudgetedAUD += toAUD(state.budgetsByMonth[m][c] || 0, getCategoryCurrency(c), m);
      });
    }
  });

  const yearActual = fromAUD(yearActualAUD, displayCur, currentMonth);
  const yearBudgeted = fromAUD(yearBudgetedAUD, displayCur, currentMonth);
  const avgMonthly = fromAUD(monthsWithData ? yearActualAUD / monthsWithData : 0, displayCur, currentMonth);

  const topCats = Object.entries(catTotalsAUD)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  document.getElementById("yearlySummary").innerHTML = `
    <div class="yearly-stat-row"><span class="yearly-stat-label">Total spent in ${year}</span><span class="yearly-stat-value">${fmt(yearActual, displayCur)}</span></div>
    <div class="yearly-stat-row"><span class="yearly-stat-label">Total budgeted in ${year}</span><span class="yearly-stat-value">${fmt(yearBudgeted, displayCur)}</span></div>
    <div class="yearly-stat-row"><span class="yearly-stat-label">Average per month</span><span class="yearly-stat-value">${fmt(avgMonthly, displayCur)}</span></div>
    ${topCats.length ? `
      <div class="yearly-top-categories">
        <div class="yearly-top-title">Top categories this year</div>
        ${topCats.map(([c, v]) => `
          <div class="yearly-cat-row"><span>${escapeHtml(c)}</span><span>${fmt(fromAUD(v, displayCur, currentMonth), displayCur)}</span></div>
        `).join("")}
      </div>
    ` : ""}
  `;
}

function renderRecurringList() {
  const list = state.recurringTemplates || [];
  const el = document.getElementById("recurringList");
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state">No recurring transactions yet. Check "Repeat this every month" when adding an expense.</div>`;
    return;
  }
  el.innerHTML = list.map((tpl) => `
    <div class="recurring-item" style="--cat-color:${categoryColor(tpl.category)}">
      <div class="recurring-info">
        <span class="recurring-category">${tpl.category}</span>
        <span class="recurring-meta">${tpl.note ? escapeHtml(tpl.note) + " · " : ""}Every month on day ${tpl.day}${tpl.confirmBeforeLogging ? " · asks to confirm" : ""}</span>
      </div>
      <span class="recurring-amount">${fmt(Number(tpl.amount), getCategoryCurrency(tpl.category))}</span>
      <button class="recurring-stop" data-id="${tpl.id}">&times;</button>
    </div>
  `).join("");

  el.querySelectorAll(".recurring-stop").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("Stop this recurring transaction? Past and current entries will stay, but no new ones will be created.")) return;
      state.recurringTemplates = state.recurringTemplates.filter((t) => t.id !== btn.dataset.id);
      saveData();
      render();
    };
  });
}

function renderPlannedList() {
  const catSelect = document.getElementById("plannedCategorySelect");
  const prevValue = catSelect.value;
  catSelect.innerHTML = state.categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  if (state.categories.includes(prevValue)) catSelect.value = prevValue;

  const list = state.plannedExpenses || [];
  const el = document.getElementById("plannedList");
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state">No planned expenses yet. Add a one-time bill with a due date below.</div>`;
    return;
  }
  el.innerHTML = list.map((p) => `
    <div class="recurring-item" style="--cat-color:${categoryColor(p.category)}">
      <div class="recurring-info">
        <span class="recurring-category">${escapeHtml(p.category)}</span>
        <span class="recurring-meta">${p.note ? escapeHtml(p.note) + " · " : ""}Due ${p.dueDate}</span>
      </div>
      <span class="recurring-amount">${fmt(Number(p.amount), getCategoryCurrency(p.category))}</span>
      <button class="recurring-stop" data-planned-id="${p.id}">&times;</button>
    </div>
  `).join("");

  el.querySelectorAll("[data-planned-id]").forEach((btn) => {
    btn.onclick = () => {
      if (!confirm("Remove this planned expense?")) return;
      state.plannedExpenses = state.plannedExpenses.filter((p) => p.id !== btn.dataset.plannedId);
      saveData();
      render();
    };
  });
}

function renameCategory(oldName, newName) {
  if (!newName || newName === oldName) {
    renderCategoryManager();
    return;
  }
  if (state.categories.some((c) => c.toLowerCase() === newName.toLowerCase() && c !== oldName)) {
    alert(`"${newName}" already exists.`);
    renderCategoryManager();
    return;
  }
  state.categories = state.categories.map((c) => (c === oldName ? newName : c));
  Object.values(state.budgetsByMonth).forEach((monthBudgets) => {
    if (oldName in monthBudgets) {
      monthBudgets[newName] = monthBudgets[oldName];
      delete monthBudgets[oldName];
    }
  });
  if (oldName in state.categoryCurrency) {
    state.categoryCurrency[newName] = state.categoryCurrency[oldName];
    delete state.categoryCurrency[oldName];
  }
  state.transactions.forEach((t) => {
    if (t.category === oldName) t.category = newName;
  });
  saveData();
  render();
}

function deleteCategory(name) {
  const used = state.transactions.some((t) => t.category === name);
  if (used) {
    alert(`"${name}" is used by existing transactions. Reassign or delete those transactions first.`);
    return;
  }
  if (!confirm(`Delete category "${name}"? This can't be undone.`)) return;
  state.categories = state.categories.filter((c) => c !== name);
  Object.values(state.budgetsByMonth).forEach((monthBudgets) => {
    delete monthBudgets[name];
  });
  delete state.categoryCurrency[name];
  saveData();
  render();
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function exportCSV() {
  const header = "Date,Category,Description,Amount,Currency";
  const rows = state.transactions
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => [t.date, t.category, `"${(t.note || "").replace(/"/g, '""')}"`, t.amount, getCategoryCurrency(t.category)].join(","));
  downloadFile(`transactions-${todayStr()}.csv`, [header, ...rows].join("\n"), "text/csv");
}

function exportJSON() {
  state.lastBackupAt = new Date().toISOString();
  saveData();
  downloadFile(`expense-planner-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
  renderBackupReminder();
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(reader.result);
    } catch {
      alert("That file isn't valid JSON. Please choose a backup file exported from this app.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.transactions) || typeof parsed.budgetsByMonth !== "object") {
      alert("That doesn't look like a valid Expense Planner backup file.");
      return;
    }
    const txCount = parsed.transactions.length;
    const monthCount = Object.keys(parsed.budgetsByMonth).length;
    const ok = confirm(
      `Import this backup? It has ${txCount} transaction${txCount === 1 ? "" : "s"} and budgets for ${monthCount} month${monthCount === 1 ? "" : "s"}.\n\nThis replaces all current data on this device.`
    );
    if (!ok) return;
    let incomeSources, incomeByMonth;
    if (Array.isArray(parsed.incomeSources) && parsed.incomeSources.length) {
      incomeSources = parsed.incomeSources;
      incomeByMonth = parsed.incomeByMonth && typeof parsed.incomeByMonth === "object" ? parsed.incomeByMonth : {};
    } else {
      const earliestMonth = Object.keys(parsed.budgetsByMonth || {}).sort()[0] || monthKey(todayStr());
      incomeSources = [...DEFAULT_INCOME_SOURCES];
      incomeByMonth = { [earliestMonth]: { [DEFAULT_INCOME_SOURCES[0]]: Number(parsed.income) || 0 } };
    }
    migrateCurrencyFields(parsed);
    state = {
      savingsGoal: Number(parsed.savingsGoal) || 0,
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : deriveCategoriesFromData(parsed),
      categoryCurrency: parsed.categoryCurrency,
      incomeSources,
      incomeSourceCurrency: parsed.incomeSourceCurrency,
      incomeByMonth,
      currencies: parsed.currencies,
      homeCurrency: parsed.homeCurrency,
      displayCurrency: parsed.displayCurrency,
      exchangeRatesByMonth: parsed.exchangeRatesByMonth,
      budgetsByMonth: parsed.budgetsByMonth,
      transactions: parsed.transactions,
      recurringTemplates: Array.isArray(parsed.recurringTemplates) ? parsed.recurringTemplates : [],
      plannedExpenses: Array.isArray(parsed.plannedExpenses) ? parsed.plannedExpenses : [],
      skippedRecurring: parsed.skippedRecurring && typeof parsed.skippedRecurring === "object" ? parsed.skippedRecurring : {},
      lastBackupAt: parsed.lastBackupAt || null,
    };
    saveData();
    currentMonth = null;
    render();
    alert("Backup imported successfully.");
  };
  reader.readAsText(file);
}

// ---- navigation ----
document.querySelectorAll(".nav-btn[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => switchView(btn.dataset.view));
});

function switchView(view) {
  currentView = view;
  document.querySelectorAll(".view").forEach((v) => v.classList.remove("active"));
  document.getElementById(`view-${view}`).classList.add("active");
  document.querySelectorAll(".nav-btn[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
}

// ---- add expense sheet ----
const overlay = document.getElementById("sheetOverlay");
const sheet = document.getElementById("addSheet");
let editingId = null;

function openSheet(tx) {
  editingId = tx ? tx.id : null;
  document.getElementById("sheetTitle").textContent = tx ? "Edit Expense" : "Add Expense";
  document.getElementById("saveBtnLabel").textContent = tx ? "Save Changes" : "Save Expense";
  document.getElementById("dateInput").value = tx ? tx.date : todayStr();
  selectedChip = tx ? tx.category : state.categories[0];
  renderChips();
  document.getElementById("amountInput").value = tx ? round2(tx.amount) : "";
  document.getElementById("noteInput").value = tx ? tx.note || "" : "";
  document.getElementById("recurringInput").checked = false;
  document.getElementById("confirmRecurringInput").checked = false;
  document.getElementById("confirmCheckRow").style.display = "none";
  document.querySelector(".recurring-check").style.display = tx ? "none" : "flex";
  overlay.classList.add("show");
  sheet.classList.add("show");
}

function closeSheet() {
  overlay.classList.remove("show");
  sheet.classList.remove("show");
  editingId = null;
}

function renderChips() {
  document.getElementById("categoryChips").innerHTML = state.categories.map((c) => `
    <button type="button" class="chip ${c === selectedChip ? "selected" : ""}" data-cat="${c}"
      style="${c === selectedChip ? `background:${categoryColor(c)};border-color:${categoryColor(c)}` : ""}">${c}</button>
  `).join("");
  document.querySelectorAll(".chip").forEach((chip) => {
    chip.onclick = () => {
      selectedChip = chip.dataset.cat;
      renderChips();
    };
  });
  document.getElementById("amountCurrencyHint").textContent = `(${getCategoryCurrency(selectedChip)})`;
}

document.getElementById("addBtn").addEventListener("click", () => openSheet());
document.getElementById("cancelBtn").addEventListener("click", closeSheet);
overlay.addEventListener("click", closeSheet);

document.getElementById("recurringInput").addEventListener("change", (e) => {
  document.getElementById("confirmCheckRow").style.display = e.target.checked ? "flex" : "none";
  if (!e.target.checked) document.getElementById("confirmRecurringInput").checked = false;
});

document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Number(document.getElementById("amountInput").value);
  const date = document.getElementById("dateInput").value;
  const note = document.getElementById("noteInput").value.trim();
  const makeRecurring = document.getElementById("recurringInput").checked;
  const confirmEachMonth = document.getElementById("confirmRecurringInput").checked;
  if (!amount || !date) return;

  if (!editingId) {
    const isDuplicate = state.transactions.some(
      (t) => t.category === selectedChip && t.date === date && Math.abs(Number(t.amount) - amount) < 0.005
    );
    if (isDuplicate) {
      const proceed = confirm(
        `A very similar transaction already exists: ${selectedChip} ${fmt(amount, getCategoryCurrency(selectedChip))} on ${date}.\n\nAdd it anyway?`
      );
      if (!proceed) return;
    }
  }

  if (editingId) {
    const t = state.transactions.find((tx) => tx.id === editingId);
    if (t) {
      t.date = date;
      t.category = selectedChip;
      t.note = note;
      t.amount = amount;
    }
  } else {
    const newTx = { id: cryptoId(), date, category: selectedChip, note, amount };
    if (makeRecurring) {
      const tplId = cryptoId();
      state.recurringTemplates.push({
        id: tplId,
        category: selectedChip,
        note,
        amount,
        day: Number(date.split("-")[2]),
        confirmBeforeLogging: confirmEachMonth,
      });
      newTx.recurringId = tplId;
    }
    state.transactions.push(newTx);
  }
  saveData();
  closeSheet();
  currentMonth = monthKey(date);
  switchView("dashboard");
  render();
});

document.getElementById("resetBtn").addEventListener("click", () => {
  if (confirm("This will permanently erase all income, budgets, and transactions on this device. Continue?")) {
    state = blankData();
    saveData();
    currentMonth = null;
    render();
  }
});

document.getElementById("copyNextBtn").addEventListener("click", () => {
  const nextMonth = addMonths(currentMonth, 1);
  const thisBudgets = getBudgetsForMonth(currentMonth);
  const thisTotals = categoryTotalsForMonth(currentMonth);
  const nextBudgets = {};
  state.categories.forEach((c) => {
    const budget = thisBudgets[c] || 0;
    const actual = thisTotals[c] || 0;
    nextBudgets[c] = budget + (budget - actual); // roll this month's per-category remaining into next month's budget
  });
  state.budgetsByMonth[nextMonth] = nextBudgets;
  saveData();
  alert(`Budget copied to ${monthLabel(nextMonth)}, with this month's remaining amount rolled into each category.`);
  render();
});

document.getElementById("copyRateBtn").addEventListener("click", () => {
  const nextMonth = addMonths(currentMonth, 1);
  const rates = {};
  state.currencies.forEach((c) => {
    if (c.code === state.homeCurrency) return;
    rates[c.code] = getExchangeRateForMonth(currentMonth, c.code);
  });
  state.exchangeRatesByMonth[nextMonth] = rates;
  saveData();
  alert(`Exchange rates copied to ${monthLabel(nextMonth)}.`);
  render();
});

document.getElementById("addCurrencyBtn").addEventListener("click", () => {
  const codeInput = document.getElementById("newCurrencyCodeInput");
  const symbolInput = document.getElementById("newCurrencySymbolInput");
  addCurrency(codeInput.value, symbolInput.value);
  codeInput.value = "";
  symbolInput.value = "";
});

document.getElementById("exportCsvBtn").addEventListener("click", exportCSV);
document.getElementById("exportJsonBtn").addEventListener("click", exportJSON);

document.getElementById("importJsonBtn").addEventListener("click", () => {
  document.getElementById("importFileInput").click();
});
document.getElementById("importFileInput").addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (file) importJSON(file);
  e.target.value = "";
});

document.getElementById("addCategoryBtn").addEventListener("click", () => {
  const input = document.getElementById("newCategoryInput");
  const name = input.value.trim();
  if (!name) return;
  if (state.categories.some((c) => c.toLowerCase() === name.toLowerCase())) {
    alert(`"${name}" already exists.`);
    return;
  }
  state.categories.push(name);
  Object.keys(state.budgetsByMonth).forEach((m) => {
    state.budgetsByMonth[m][name] = 0;
  });
  input.value = "";
  saveData();
  render();
});

document.getElementById("addIncomeSourceBtn").addEventListener("click", () => {
  const input = document.getElementById("newIncomeSourceInput");
  const name = input.value.trim();
  if (!name) return;
  if (state.incomeSources.some((n) => n.toLowerCase() === name.toLowerCase())) {
    alert(`"${name}" already exists.`);
    return;
  }
  state.incomeSources.push(name);
  Object.keys(state.incomeByMonth).forEach((m) => {
    state.incomeByMonth[m][name] = 0;
  });
  input.value = "";
  saveData();
  render();
});

document.getElementById("copyIncomeBtn").addEventListener("click", () => {
  const nextMonth = addMonths(currentMonth, 1);
  state.incomeByMonth[nextMonth] = { ...getIncomeForMonth(currentMonth) };
  saveData();
  alert(`Income copied to ${monthLabel(nextMonth)}.`);
  render();
});

document.getElementById("addPlannedBtn").addEventListener("click", () => {
  const category = document.getElementById("plannedCategorySelect").value;
  const amount = Number(document.getElementById("plannedAmountInput").value);
  const note = document.getElementById("plannedNoteInput").value.trim();
  const dueDate = document.getElementById("plannedDueDateInput").value;
  if (!category || !amount || !dueDate) {
    alert("Please choose a category, amount, and due date.");
    return;
  }
  state.plannedExpenses.push({ id: cryptoId(), category, note, amount, dueDate });
  document.getElementById("plannedAmountInput").value = "";
  document.getElementById("plannedNoteInput").value = "";
  document.getElementById("plannedDueDateInput").value = "";
  saveData();
  render();
});

document.getElementById("txSearchInput").addEventListener("input", (e) => {
  txSearchQuery = e.target.value.trim().toLowerCase();
  renderTransactions();
});

render();
