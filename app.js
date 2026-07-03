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

const COUNTRIES = ["Australia", "India"];

function getCategoryCountry(c) {
  return (state.categoryCountry && state.categoryCountry[c]) || "Australia";
}

const COUNTRY_CURRENCY = { Australia: "AUD", India: "INR" };
const CURRENCY_SYMBOL = { AUD: "$", INR: "₹" };
const DEFAULT_EXCHANGE_RATE = 55; // starting default for 1 AUD in INR

function getCategoryCurrency(c) {
  return COUNTRY_CURRENCY[getCategoryCountry(c)] || "AUD";
}

// Returns this month's AUD->INR rate, auto-carrying forward from the most
// recent prior month the same way budgets do.
function getExchangeRateForMonth(month) {
  if (state.exchangeRatesByMonth[month]) return state.exchangeRatesByMonth[month];
  const priorMonths = Object.keys(state.exchangeRatesByMonth).filter((m) => m < month).sort();
  const rate = priorMonths.length
    ? state.exchangeRatesByMonth[priorMonths[priorMonths.length - 1]]
    : DEFAULT_EXCHANGE_RATE;
  state.exchangeRatesByMonth[month] = rate;
  saveData();
  return rate;
}

function toAUD(amount, currency, month) {
  if (currency === "AUD") return amount;
  const rate = getExchangeRateForMonth(month) || DEFAULT_EXCHANGE_RATE;
  return amount / rate;
}

function fromAUD(amountAUD, toCurrency, month) {
  if (toCurrency === "AUD") return amountAUD;
  const rate = getExchangeRateForMonth(month) || DEFAULT_EXCHANGE_RATE;
  return amountAUD * rate;
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
    income: 0,
    savingsGoal: 0,
    categories: [...DEFAULT_CATEGORIES],
    categoryCountry: {},
    displayCurrency: "AUD",
    exchangeRatesByMonth: { [thisMonth]: DEFAULT_EXCHANGE_RATE },
    budgetsByMonth: { [thisMonth]: zeroBudgets(DEFAULT_CATEGORIES) },
    transactions: [],
    recurringTemplates: [],
  };
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

let state = loadData();
let currentMonth = null;
let currentView = "dashboard";
let selectedChip = state.categories[0];

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
    if (!parsed.categoryCountry || typeof parsed.categoryCountry !== "object") parsed.categoryCountry = {};
    if (!parsed.displayCurrency) parsed.displayCurrency = "AUD";
    if (!parsed.exchangeRatesByMonth || typeof parsed.exchangeRatesByMonth !== "object") parsed.exchangeRatesByMonth = {};
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
  const symbol = CURRENCY_SYMBOL[currency] || "$";
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

function renderCountryBreakdown() {
  const totals = categoryTotalsForMonth(currentMonth);
  const budgets = getBudgetsForMonth(currentMonth);
  const byCountry = {};
  COUNTRIES.forEach((co) => (byCountry[co] = { actual: 0, budgeted: 0 }));
  state.categories.forEach((c) => {
    const co = getCategoryCountry(c);
    if (!byCountry[co]) byCountry[co] = { actual: 0, budgeted: 0 };
    byCountry[co].actual += totals[c] || 0;
    byCountry[co].budgeted += budgets[c] || 0;
  });

  const countryColors = { Australia: "#0D9488", India: "#D97706" };
  document.getElementById("countryBreakdown").innerHTML = COUNTRIES.map((co) => {
    const cur = COUNTRY_CURRENCY[co] || "AUD";
    return `
    <div class="country-card" style="--country-color:${countryColors[co] || "#0D9488"}">
      <div class="country-name">${co}</div>
      <div class="country-spent">${fmt(byCountry[co].actual, cur)}</div>
      <div class="country-budget">of ${fmt(byCountry[co].budgeted, cur)} budgeted</div>
    </div>
  `;
  }).join("");
}

// Auto-creates this month's occurrence of each recurring transaction the
// first time the month is viewed, tagged with recurringId so it's never
// duplicated on subsequent views.
function ensureRecurringForMonth(month) {
  let changed = false;
  (state.recurringTemplates || []).forEach((tpl) => {
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
  renderCountryBreakdown();
  renderTransactions();
  renderBudgetSettings();
  renderCurrencySettings();
  renderCategoryManager();
  renderRecurringList();
  renderSavingsGoal();
  renderTrendChart();
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
    .sort((a, b) => b.date.localeCompare(a.date));

  const el = document.getElementById("txList");
  if (list.length === 0) {
    el.innerHTML = `<div class="empty-state">No transactions logged for ${monthLabel(currentMonth)} yet.</div>`;
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

function renderBudgetSettings() {
  document.getElementById("incomeInput").value = round2(state.income);
  document.getElementById("incomeInput").oninput = (e) => {
    state.income = Number(e.target.value) || 0;
    saveData();
    updateGoalProgress();
  };

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
      renderCountryBreakdown();
    };
  });
}

function renderCurrencySettings() {
  const rateInput = document.getElementById("exchangeRateInput");
  rateInput.value = getExchangeRateForMonth(currentMonth);
  rateInput.oninput = () => {
    state.exchangeRatesByMonth[currentMonth] = Number(rateInput.value) || 0;
    saveData();
    renderDashboard();
    renderCountryBreakdown();
    updateGoalProgress();
    renderTrendChart();
  };

  const nextMonth = addMonths(currentMonth, 1);
  document.getElementById("copyRateBtn").textContent = `Copy rate to ${monthLabel(nextMonth)} →`;

  const currSelect = document.getElementById("displayCurrencySelect");
  currSelect.value = state.displayCurrency || "AUD";
  currSelect.onchange = () => {
    state.displayCurrency = currSelect.value;
    saveData();
    render();
  };
}

function renderCategoryManager() {
  document.getElementById("categoryManageList").innerHTML = state.categories.map((c) => `
    <div class="category-manage-item" style="--cat-color:${categoryColor(c)}">
      <input type="text" data-original="${escapeHtml(c)}" value="${escapeHtml(c)}" />
      <select class="cat-country" data-country-cat="${escapeHtml(c)}">
        ${COUNTRIES.map((co) => `<option value="${co}" ${getCategoryCountry(c) === co ? "selected" : ""}>${co}</option>`).join("")}
      </select>
      <button type="button" class="cat-delete" data-del-cat="${escapeHtml(c)}">&times;</button>
    </div>
  `).join("");

  document.querySelectorAll("#categoryManageList input").forEach((input) => {
    input.addEventListener("change", () => renameCategory(input.dataset.original, input.value.trim()));
  });
  document.querySelectorAll("#categoryManageList .cat-country").forEach((sel) => {
    sel.addEventListener("change", () => {
      state.categoryCountry[sel.dataset.countryCat] = sel.value;
      saveData();
      renderCountryBreakdown();
    });
  });
  document.querySelectorAll("#categoryManageList .cat-delete").forEach((btn) => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.delCat));
  });
}

function updateGoalProgress() {
  const totals = categoryTotalsForMonth(currentMonth);
  const totalActualAUD = state.categories.reduce((s, c) => s + toAUD(totals[c] || 0, getCategoryCurrency(c), currentMonth), 0);
  const netSavingsAUD = state.income - totalActualAUD;
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
    const symbol = CURRENCY_SYMBOL[displayCur] || "$";
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
        <span class="recurring-meta">${tpl.note ? escapeHtml(tpl.note) + " · " : ""}Every month on day ${tpl.day}</span>
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
  if (oldName in state.categoryCountry) {
    state.categoryCountry[newName] = state.categoryCountry[oldName];
    delete state.categoryCountry[oldName];
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
  delete state.categoryCountry[name];
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
  downloadFile(`expense-planner-backup-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
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
    state = {
      income: Number(parsed.income) || 0,
      savingsGoal: Number(parsed.savingsGoal) || 0,
      categories: Array.isArray(parsed.categories) && parsed.categories.length ? parsed.categories : deriveCategoriesFromData(parsed),
      categoryCountry: parsed.categoryCountry && typeof parsed.categoryCountry === "object" ? parsed.categoryCountry : {},
      displayCurrency: parsed.displayCurrency || "AUD",
      exchangeRatesByMonth: parsed.exchangeRatesByMonth && typeof parsed.exchangeRatesByMonth === "object" ? parsed.exchangeRatesByMonth : {},
      budgetsByMonth: parsed.budgetsByMonth,
      transactions: parsed.transactions,
      recurringTemplates: Array.isArray(parsed.recurringTemplates) ? parsed.recurringTemplates : [],
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

document.getElementById("addForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const amount = Number(document.getElementById("amountInput").value);
  const date = document.getElementById("dateInput").value;
  const note = document.getElementById("noteInput").value.trim();
  const makeRecurring = document.getElementById("recurringInput").checked;
  if (!amount || !date) return;
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
  state.budgetsByMonth[nextMonth] = { ...getBudgetsForMonth(currentMonth) };
  saveData();
  alert(`Budget copied to ${monthLabel(nextMonth)}.`);
  render();
});

document.getElementById("copyRateBtn").addEventListener("click", () => {
  const nextMonth = addMonths(currentMonth, 1);
  state.exchangeRatesByMonth[nextMonth] = getExchangeRateForMonth(currentMonth);
  saveData();
  alert(`Exchange rate copied to ${monthLabel(nextMonth)}.`);
  render();
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

render();
