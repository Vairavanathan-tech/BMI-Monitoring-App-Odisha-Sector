const params =
new URLSearchParams(window.location.search);

const athleteId =
params.get("athleteId");

const forceNo =
params.get("forceNo");

const deviceId =
params.get("deviceId");

const name =
params.get("name");

const unit =
params.get("unit");

if (athleteId) {

localStorage.setItem(
"athleteId",
athleteId
);

}

if (forceNo) {

localStorage.setItem(
"forceNo",
forceNo
);

}

if (deviceId) {

localStorage.setItem(
"deviceId",
deviceId
);

}

if (name) {

localStorage.setItem(
"name",
name
);

}

if (unit) {

localStorage.setItem(
"unit",
unit
);

}

// CLEAN URL
window.history.replaceState(
{},
document.title,
window.location.pathname
);


function getGroupedUnits(unit){

  unit = normalizeScope(unit);

  const RANGE_SBP_UNITS = [
    "4 BN",
    "8 BN",
    "12 BN",
    "64 BN",
    "127 BN",
    "Range SBP",
    "GC SBP"
  ];

  const RANGE_BBSR_UNITS = [
    "19 BN",
    "168 BN",
    "189 BN",
    "216 BN",
    "228 BN",
    "Range BBSR",
    "GC BBSR",
    "CH BBSR",
    "IG office"
  ];

  if(unit === "RANGESBPUNITS"){
    return RANGE_SBP_UNITS.map(normalizeScope);
  }

  if(unit === "RANGEBBSRUNITS"){
    return RANGE_BBSR_UNITS.map(normalizeScope);
  }

  if(
    unit === "ODISHASECTOR" ||
    unit === "ALL"
  ){
    return [
      ...RANGE_SBP_UNITS,
      ...RANGE_BBSR_UNITS
    ].map(normalizeScope);
  }

  return [unit];
}
/* ================= GLOBAL NORMALIZERS ================= */

// ✅ Formats weight values to exactly 2 decimal places (e.g. 83.4567893
// → 83.46) for the PA table's Prev Wt / Curr Wt columns. Falls back to
// the original value if it isn't a valid number.
function fmt2(v){
  const n = Number(v);
  return isNaN(n) ? (v || "") : n.toFixed(2);
}

function normalizeText(v){
  return String(v || "")
    .replace(/\s+/g," ")
    .trim()
    .toUpperCase();
}

function normalizeScope(v){

  return String(v || "")
    .toUpperCase()
    .replace(/\+/g,"")
    .replace(/_/g,"")
    .replace(/\s+/g,"")
    .trim();
}
function normalizeMetric(metric){

  const m = normalizeText(metric)
    .replace(/_/g," ")
    .replace(/\-/g," ");

  // WEIGHT LOSS FIX
  if(
    m === "WEIGHTLOSS" ||
    m === "WEIGHT LOSS" ||
    m === "WEIGHT-LOSS"
  ){
    return "WEIGHT LOSS";
  }

  if(m.includes("STEP")) return "STEPS";
  if(m.includes("DIST")) return "DISTANCE";
  if(m.includes("CAL")) return "CALORIES";

  return m;
}

function isValidNumber(v){

  if(v === null || v === undefined) return false;

  const n = Number(v);

  return !isNaN(n) && n !== 0;
}let selectedPerson = null;
const UNIT_GROUPS = {

  RANGE_SBP_UNITS: [
    "4 BN",
    "8 BN",
    "12 BN",
    "64 BN",
    "127 BN"
  ],

  RANGE_BBSR_UNITS: [
    "19 BN",
    "168 BN",
    "189 BN",
    "216 BN",
    "228 BN"
  ],

  RANGE_SBP_COMBINED: [
    "Range SBP",
    "4 BN",
    "8 BN",
    "12 BN",
    "64 BN",
    "127 BN"
  ],

  RANGE_BBSR_COMBINED: [
    "Range BBSR",
    "19 BN",
    "168 BN",
    "189 BN",
    "216 BN",
    "228 BN"
  ],

  ODISHA_SECTOR: [
    "IG Office",
    "Range SBP",
    "4 BN",
    "8 BN",
    "12 BN",
    "64 BN",
    "127 BN",
    "GC SBP",
    "Range BBSR",
    "19 BN",
    "168 BN",
    "189 BN",
    "216 BN",
    "228 BN",
    "GC BBSR",
    "CH BBSR"
  ]
};
let myStatusData = null;
let data = [];
let chart = null;

let selectedUnit = "ODISHASECTOR";
let selectedBMI = "ALL";

let selectedDropdownUnit = "";


let frozenWeeklyCache = null;
let weeklyScopeAverages = [];
let frozenWinners = [];
let weeklyUnitPerformance = [];
let weekColumns = [];
let masterData = [];

let unitIndex = {};

let bmiIndex = {};

let forceNoIndex = {};

let categoryIndex = {};

const sheetURL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?output=csv";

const weeklyScopeURL =
"https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?gid=1032949088&single=true&output=csv";

let categoryKey = null;
let unitKey = null;

let weightChart, caloriesChart, stepsChart, distanceChart;

/* ================= GLOBAL CACHE ================= */

let APP_CACHE = {

  weekColumns: [],

  allWeeks: null,

  metricColumns: {}

};


/* ================= TABLE PAGINATION ================= */
let currentTableData = [];
let rowsLoaded = 0;
const ROWS_PER_LOAD = 100;

/* ================= FETCH ================= */
async function fetchData() {

  // ✅ SPEED FIX: previously the main sheet was fetched and fully
  // parsed (including building all the lookup indexes) BEFORE the
  // other three data sources (frozen winners, weekly scope averages,
  // my-status) were even requested — turning 4 independent network
  // calls into "1 big one, then 3 more after it finishes". Kicking
  // all four off at the same moment means the total wait is roughly
  // the single slowest request, not the sum of the main one plus the
  // rest.
  const mainFetchPromise = fetch(sheetURL).then(res => res.text());

  const frozenWinnersPromise = fetchFrozenWinners();
  const scopeAveragesPromise = fetchWeeklyScopeAverages();
  const myStatusPromise = fetchMyStatusFrozen();

  const text = await mainFetchPromise;

  const rows = text.trim().split("\n").map(r =>
    r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
  );

  const headers = rows[0].map(h => h.trim());

  categoryKey = headers.find(h => h.toLowerCase().includes("category"));
  unitKey = headers.find(h => h.toLowerCase().includes("unit"));

  data = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h, i) => obj[h] = row[i] || "");
    return obj;
  }).filter(d => d[categoryKey]);
/* ================= MASTER CACHE ================= */

masterData = data;
/* ================= WEEK CACHE ================= */

weekColumns = detectWeekColumns(data);

APP_CACHE.weekColumns = weekColumns;

console.log("Cached Week Columns:", APP_CACHE.weekColumns);
/* ================= ALL WEEKS CACHE ================= */

if (data.length > 0) {

  APP_CACHE.allWeeks = detectAllWeeks(data[0]);

  console.log("Cached All Weeks:", APP_CACHE.allWeeks);

}

/* ================= RESET INDEXES ================= */

unitIndex = {};
bmiIndex = {};
forceNoIndex = {};
categoryIndex = {};

/* ================= BUILD INDEXES ================= */

data.forEach(person => {

  /* ---------- UNIT ---------- */

  const unit =
    (person[unitKey] || "").trim();

  if (!unitIndex[unit]) {
    unitIndex[unit] = [];
  }

  unitIndex[unit].push(person);

  /* ---------- BMI ---------- */

  const bmiCategory =
    normalizeCategory(
      person[categoryKey]
    );

  if (!bmiIndex[bmiCategory]) {
    bmiIndex[bmiCategory] = [];
  }

  bmiIndex[bmiCategory].push(person);

  /* ---------- FORCE NO ---------- */

  const forceNo =
    String(
      person["Force No"] ||
      person["FORCE NUMBER"] ||
      person["Force Number"] ||
      ""
    ).trim();

  if (forceNo) {
    forceNoIndex[forceNo] = person;
  }

  /* ---------- CATEGORY ---------- */

  const category =
    normalizeCategory(
      person[categoryKey]
    );

  if (!categoryIndex[category]) {
    categoryIndex[category] = [];
  }

  categoryIndex[category].push(person);

});

  selectedUnit = "ODISHASECTOR";

  // ✅ The pie chart and summary table only need the main sheet's
  // data (parsed just above) — show them right away instead of
  // waiting on the other three unrelated network calls.
  updateDashboard();

  // ✅ KEEP THIS
  const defaultBtn = document.querySelector('#top button[data-unit="ODISHASECTOR"]');
  if (defaultBtn) setActive(defaultBtn, "unit");

  // The 4 weekly charts need weeklyScopeAverages — wait only for that
  // one promise (it was already started at the very top of this
  // function, in parallel with the main sheet, so it has likely
  // already resolved by the time execution gets here).
  await scopeAveragesPromise;

  requestAnimationFrame(() => {
    drawSection4Charts(getFilteredData());
  });

  // The leaderboard / my-status data doesn't block anything drawn
  // above — just make sure they're finished loading before this
  // function is considered fully done (e.g. for the init Promise.all).
  await Promise.all([frozenWinnersPromise, myStatusPromise]);
}

async function fetchWeeklyUnitPerformance(){

  const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?gid=1342905971&single=true&output=csv";

  const res = await fetch(url);

  const text = await res.text();

  const rows = text
    .replace(/\r/g,"")
    .trim()
    .split("\n")
    .map(r =>
      r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
       .map(x => x.replace(/^"|"$/g,"").trim())
    );

  const headers = rows[0].map(h =>
    h.trim()
  );

  weeklyUnitPerformance = rows.slice(1).map(row => {

    let obj = {};

    headers.forEach((h,i)=>{
      obj[h] = row[i] || "";
    });

    return obj;
  });

  console.log("✅ Weekly Unit Performance Loaded");

  console.table(weeklyUnitPerformance);
}

async function fetchFrozenWinners(){

  const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?gid=1461823501&single=true&output=csv";

  const res = await fetch(url);
  const text = await res.text();

  const rows = text.trim().split("\n").map(r =>
    r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
  );

 const headers = rows[0].map(h =>
  String(h || "")
    .replace(/\r/g, "")
    .replace(/\t/g, "")
    .trim()
);

frozenWinners = rows.slice(1).map(row => {

  let obj = {};

  headers.forEach((h, i) => {

    const cleanKey =
      String(h || "")
        .replace(/\r/g, "")
        .replace(/\t/g, "")
        .trim();

    obj[cleanKey] =
      String(row[i] || "")
        .replace(/\r/g, "")
        .replace(/\t/g, "")
        .trim();
  });

  return obj;
});

  console.log("Headers:", headers);
  console.log("Frozen Winners:", frozenWinners);
console.log(
  "APRIL ROWS:",
  frozenWinners.filter(r =>
    String(r.WeekKey).includes("April")
  ).length
);

console.log(
  "MAY ROWS:",
  frozenWinners.filter(r =>
    String(r.WeekKey).includes("May")
  ).length
);
console.table(
  frozenWinners.map(r => ({
    WeekKey: r.WeekKey,
    Scope: r.Scope,
    Metric: r.Metric
  }))
);
  frozenWeeklyCache = frozenWinners;
}
async function fetchWeeklyScopeAverages(){

  const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?gid=1032949088&single=true&output=csv";

  const res = await fetch(url);
  const text = await res.text();

  const rows = text.trim().split("\n").map(r =>
    r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
  );

  const headers = rows[0].map(h => h.trim());

  weeklyScopeAverages = rows.slice(1).map(row => {

    let obj = {};

    headers.forEach((h,i)=>{
      obj[h] = (row[i] || "").trim();
    });

    return obj;
  });

  console.log("Weekly Scope Averages:",
    weeklyScopeAverages
  );
}
/* ================= NORMALIZE ================= */
function normalizeCategory(cat) {
  if (!cat) return "";
  cat = cat.toLowerCase().trim();

  if (cat.includes("under")) return "under";
  if (cat.includes("normal")) return "normal";
  if (cat.includes("over")) return "over";
  if (cat.includes("obese")) return "obese";

  return "";
}


function detectBMI(bmi) {

  bmi = parseFloat(bmi);

  if (isNaN(bmi)) return "UNKNOWN";

  if (bmi < 18.5) return "UNDERWEIGHT";

  if (bmi < 25) return "NORMAL";

  if (bmi < 30) return "OVERWEIGHT";

  return "OBESE";
}

function normalizePerson(row) {

  row._unit = String(
    row.Unit || ""
  ).trim();

  row._forceNo = String(
    row["Force No"] || ""
  ).trim();

  row._category = String(
    row.Category || ""
  )
  .trim()
  .toUpperCase();

  row._bmiCategory = detectBMI(
    row.BMI
  );

  return row;
}

function buildIndexes(data) {

  unitIndex = {};

  bmiIndex = {};

  forceNoIndex = {};

  categoryIndex = {};

  data.forEach(person => {

    const unit = person._unit;

    const bmi = person._bmiCategory;

    const forceNo = person._forceNo;

    const category = person._category;

    if (!unitIndex[unit]) {
      unitIndex[unit] = [];
    }

    if (!bmiIndex[bmi]) {
      bmiIndex[bmi] = [];
    }

    if (!categoryIndex[category]) {
      categoryIndex[category] = [];
    }

    unitIndex[unit].push(person);

    bmiIndex[bmi].push(person);

    categoryIndex[category].push(person);

    forceNoIndex[forceNo] = person;
  });
}

/* ================= FILTER ================= */

function getFilteredData() {

  const unit = selectedUnit;

  // ================= ODISHA SECTOR =================

if (
   unit === "ALL" ||
   unit === "ODISHASECTOR"
) {
    return data;
}
  // ================= IG OFFICE =================

  if (unit === "IG OFFICE") {

    return data.filter(d => {

      const u = String(d[unitKey] || "").trim().toLowerCase();

      return (
        u === "ig office" ||
        u === "ig office "
      );
    });
  }

  // ================= RANGE SBP OFFICE =================

  if (unit === "RANGE SBP OFFICE") {

    return data.filter(d =>
      String(d[unitKey] || "").trim() === "Range SBP"
    );
  }

  // ================= RANGE BBSR OFFICE =================

  if (unit === "RANGE BBSR OFFICE") {

    return data.filter(d =>
      String(d[unitKey] || "").trim() === "Range BBSR"
    );
  }

  // ================= RANGE SBP + UNITS =================

 if (
    unit === "RANGESBPUNITS" ||
    unit === "RANGESBPALL" ||
    unit === "RANGE_SBP_ALL"
) {

    const allowed = [
      "4 BN",
      "8 BN",
      "12 BN",
      "64 BN",
      "127 BN",
      "Range SBP"
    ];

    return data.filter(d =>
      allowed.includes(
        String(d[unitKey] || "").trim()
      )
    );
  }

  // ================= RANGE BBSR + UNITS =================

 if (
    unit === "RANGEBBSRUNITS" ||
    unit === "RANGEBBSRALL" ||
    unit === "RANGE_BBSR_ALL"
) {

    const allowed = [
      "19 BN",
      "168 BN",
      "189 BN",
      "216 BN",
      "228 BN",
      "Range BBSR"
    ];

    return data.filter(d =>
      allowed.includes(
        String(d[unitKey] || "").trim()
      )
    );
  }

  // ================= INDIVIDUAL UNIT =================

// ================= INDIVIDUAL UNIT =================

return data.filter(d => {

  const rowUnit =
    normalizeScope(
      String(d[unitKey] || "")
    );

  const target =
    normalizeScope(unit);

  // EXACT ENTITY FIX

  if(target === "RANGESBP"){
    return rowUnit === "RANGESBP";
  }

  if(target === "RANGEBBSR"){
    return rowUnit === "RANGEBBSR";
  }

  return rowUnit === target;
});
}




/* ================= UNIT ================= */
function selectUnit(unit, btn) {
  selectedUnit = unit;
/* ===== RESET DROPDOWN LABELS ===== */

if (
  unit !== "4 BN" &&
  unit !== "8 BN" &&
  unit !== "12 BN" &&
  unit !== "64 BN" &&
  unit !== "127 BN" &&
  unit !== "RANGE_SBP_ALL"
) {
  document.getElementById("sbpSelected").innerText =
    "Range SBP Units ▼";
}

if (
  unit !== "19 BN" &&
  unit !== "168 BN" &&
  unit !== "189 BN" &&
  unit !== "216 BN" &&
  unit !== "228 BN" &&
  unit !== "RANGE_BBSR+UNITS"
) {
  document.getElementById("bbsrSelected").innerText =
    "Range BBSR Units ▼";
}
  setActive(btn, "unit");

 clearTable();
updateDashboard();
updateBestFromFrozen();
  // IMPORTANT: hide table/search zone
  document.getElementById("output").style.display = "none";

  // show graphs zone
  document.getElementById("chartsSection").style.display = "block";

  destroyCharts();

  setTimeout(() => {
    drawSection4Charts(getFilteredData());
  }, 100);
}

/* ================= DROPDOWN UNIT ================= */
function selectDropdownUnit(unit, labelId, btn) {

  let displayName = unit;

  // prettier labels
  if (unit === "RANGE_SBP_ALL") {
    displayName = "Range SBP + Units";
  }

  if (unit === "RANGE_BBSR_ALL") {
    displayName = "Range BBSR + Units";
  }

  // RANGE SBP
  if (labelId === "sbpSelected") {
    document.getElementById(labelId).innerText =
      "Range SBP Units - " + displayName + " ▼";
  }

  // RANGE BBSR
  if (labelId === "bbsrSelected") {
    document.getElementById(labelId).innerText =
      "Range BBSR Units - " + displayName + " ▼";
  }

  // reuse existing logic
  selectUnit(unit, btn);
}

/* ================= CATEGORY ================= */
function handleCategory(cat, btn) {
    setActive(btn, "cat");

    const filtered = getFilteredData().filter(row =>
        normalizeCategory(row[categoryKey]) === cat
    );

    if (cat === "over" || cat === "obese") {
        document.getElementById("chartsSection").style.display = "none";
        document.getElementById("output").style.display = "block";
        showTable(filtered);
    } else {
        document.getElementById("output").style.display = "none";
        document.getElementById("chartsSection").style.display = "block";
        drawSection4Charts(filtered);
    }
}

function detectWeekColumns(rows) {

  if (!rows || rows.length === 0) return [];

  let headers = Object.keys(rows[0]);

 let cols = headers.filter(h => {
  let x = h.toLowerCase();
  return x.includes("sat") && x.includes("weight");
});

  cols = cols.filter(col =>
    rows.some(r => r[col] && r[col].trim() !== "")
  );

  function parseWeek(col){
    const parts = col.split("_");

    const month = parts[0];
    const week  = parts[1];

    const monthIndex =
      new Date(Date.parse(month + " 1, 2024")).getMonth();

    const weekMap = {
      "1st":1,"2nd":2,"3rd":3,"4th":4,"5th":5
    };

    return monthIndex * 10 + (weekMap[week] || 0);
  }

  cols.sort((a,b)=>parseWeek(a)-parseWeek(b));

  return cols;
}

/* ================= TABLE ================= */
function showTable(rows) {
  currentTableData = rows;
  rowsLoaded = 0;

  const table = document.getElementById("dataTable");

  if (!rows.length) {
    table.innerHTML = "<tr><td>No Data</td></tr>";
    return;
  }

  let headers = Object.keys(rows[0]);
// 🔥 STEP 1: DETECT VALID WEEK COLUMNS (WEIGHT ONLY)

weekColumns = detectWeekColumns(rows);
// 🔥 STEP 2: GET LATEST WEEK COLUMN

let latestWeek = weekColumns.length
  ? weekColumns[weekColumns.length - 1]
  : headers.find(h => h.includes("Weight(Kg)"));

// fallback safety
if (!latestWeek) {
  latestWeek = headers.find(h => h.includes("Weight(Kg)"));
}

// 🔥 STEP 2: SORT ROWS BASED ON LATEST WEEK

rows.sort((a, b) => {
  let valA = parseFloat(a[latestWeek]) || 0;
  let valB = parseFloat(b[latestWeek]) || 0;

  return valB - valA; // DESCENDING (highest first)
});

  // 🔥 STEP 3: CUSTOM TABLE HEADER

let displayHeaders = ["Position", "Unit", "Force No", "Rank", "Name", ...weekColumns];

table.innerHTML = "<tr>" + displayHeaders.map(h => `<th>${h}</th>`).join("") + "</tr>";

  loadMoreRows();
hideMyStatusButton();
}

function loadMoreRows() {
  const table = document.getElementById("dataTable");

let headers = ["Position", "Unit","Force No", "Rank", "Name", ...weekColumns];

  let nextRows = currentTableData.slice(rowsLoaded, rowsLoaded + ROWS_PER_LOAD);

  let html = "";

 nextRows.forEach((r, index) => {

  let pos = rowsLoaded + index + 1;

  let rowHTML = `
    <td>${pos}</td>
    <td>${r[unitKey] || "-"}</td>
<td>${r["Force Number"] || r["FORCE NUMBER"] || r["Force No"] || "-"}</td>
    <td>${r["RANK"] || "-"}</td>
    <td>${r["Name"] || "-"}</td>
  `;

  weekColumns.forEach(col => {
    rowHTML += `<td>${r[col] || "-"}</td>`;
  });

  html += `<tr>${rowHTML}</tr>`;
});

  table.innerHTML += html;

  rowsLoaded += ROWS_PER_LOAD;
}
function searchByForceNumber() {
    const input = document.getElementById("searchInput").value.trim().toLowerCase();

    const rows = getFilteredData().filter(row =>
        normalizeCategory(row[categoryKey]) === "over" ||
        normalizeCategory(row[categoryKey]) === "obese"
    );

    if (!input) {
        showTable(rows);
        return;
    }

     const filtered = rows.filter(row =>
    (row["Force No"] || "")
      .toString().trim().toLowerCase() === input
  );

    showTable(filtered);

	/* ===== MY STATUS HOOK ===== */
if (filtered.length === 1) {
  selectedPerson = filtered[0];

  console.log("Selected Person:", selectedPerson);
  console.log("Frozen Data Sample:", frozenMyStatus[0]);

   myStatusData = frozenMyStatus.find(r =>
      (r["Force No"] || "")
        .toString().trim().toLowerCase() ===
      (selectedPerson["Force No"] || "")
        .toString().trim().toLowerCase()
    );

  console.log("Matched MyStatusData:", myStatusData);

  if (!myStatusData) {
    alert("⚠️ No match found in frozen sheet");
    return;
  }

  showMyStatusButton();

} else {
  hideMyStatusButton();
}
document.getElementById("myStatusContainer").style.display = "block";
}


/* ================= SHOW BUTTON ================= */
function showMyStatusButton() {
  const btn = document.getElementById("myStatusBtn");
  if (!btn) return;

  btn.style.display = "inline-block";
}

function hideMyStatusButton() {
  const btn = document.getElementById("myStatusBtn");
  if (!btn) return;

  btn.style.display = "none";
}



/* ================= CLEAR TABLE ================= */
function clearTable() {
  document.getElementById("dataTable").innerHTML = "";
}

/* ================= DASHBOARD ================= */
function updateDashboard() {
  let rows = getFilteredData();

  let summary = { under: 0, normal: 0, over: 0, obese: 0 };

  rows.forEach(d => {
    let c = normalizeCategory(d[categoryKey]);
    if (c) summary[c]++;
  });

  document.getElementById("summary").innerHTML = `

<div
style="
width:100%;
text-align:center;
font-size:36px;
font-weight:bold;
color:#000;
margin-bottom:10px;
text-decoration:underline;
">

Summary Table

</div>



  <table style="font-size:170%; margin:auto;">
      <tr><th>Category</th><th>Count</th></tr>
      <tr style="background:#fdebd0;"><td><b>Underweight</b></td><td><b>${summary.under}</b></td></tr>
      <tr style="background:#d5f5e3;"><td><b>Normal</b></td><td><b>${summary.normal}</b></td></tr>
      <tr style="background:#fadbd8;"><td><b>Overweight</b></td><td><b>${summary.over}</b></td></tr>
      <tr style="background:#f5b7b1;"><td><b>Obese</b></td><td><b>${summary.obese}</b></td></tr>
    </table>
  `;

  drawPie(rows);

/* ✅ ADD THIS LINE (VERY IMPORTANT) */
/* ================= USE CACHED WEEK COLUMNS ================= */

weekColumns = APP_CACHE.weekColumns || [];

console.log("Using Cached Week Columns:", weekColumns);



//updateBestFromFrozen();
}
/* ================= PIE ================= */


function drawPie(rows) {

  // DESTROY OLD CHART
  if (chart) chart.destroy();

  // COUNT VALUES
  let values = ["under","normal","over","obese"].map(c =>
    rows.filter(r => normalizeCategory(r[categoryKey]) === c).length
  );

  // CREATE PIE CHART
  chart = new Chart(
    document.getElementById("chart").getContext("2d"),
    {
      type: "pie",

      data: {
        labels: [
          "Underweight",
          "Normal",
          "Overweight",
          "Obese"
        ],

        datasets: [{
          data: values,

          backgroundColor: [
            "#35A29F", // Underweight
            "#1F4E79", // Normal
            "#8E145F", // Overweight
            "#F36C21"  // Obese
          ],

          // WHITE DEMARCATION LINE
          borderColor: "#ffffff",
          borderWidth: 5,

          // BIGGER PIE
          radius: "95%",

          hoverOffset: 10
        }]
      },

      // DATALABEL PLUGIN
      plugins: [ChartDataLabels],

      options: {

        responsive: true,
        maintainAspectRatio: false,

        layout: {
          padding: 10
        },

        plugins: {

          // LEGEND
          legend: {
            display: true,
            position: "right",

            labels: {

              color: "#000",

              // BIGGER LEGEND BOX
              boxWidth: 24,
              boxHeight: 24,

              padding: 25,

              // BIGGER LEGEND TEXT
              font: {
                size: 28,
                weight: "bold"
              }
            }
          },

          tooltip: {
            enabled: true
          },

          // PERCENTAGE TEXT INSIDE PIE
          datalabels: {

            // CONTRAST COLOR
            color: "#ffffff",

            textStrokeColor: "#000",
            textStrokeWidth: 3,

            font: {
              weight: "bold",
              size: 24
            },

            formatter: (value, ctx) => {

              let sum = ctx.chart.data.datasets[0].data
                .reduce((a,b)=>a+b,0);

              let percentage =
                ((value / sum) * 100).toFixed(1);

              return percentage + "%";
            }
          }
        }
      }
    }
  );
}








function getFrozenRank(name, metric, scope){

  const rows = frozenWeeklyCache.filter(r =>
    r.Scope === scope && r.Metric === metric
  );

  const found = rows.find(r => r.Name === name);

  return found ? found.Position : "-";
}


function getBarColors(data, type) {
  const GOOD = "#2ecc71";
  const BAD = "#e74c3c";
  const NEUTRAL = "#95a5a6";

  const colors = [];

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      colors.push(NEUTRAL);
      continue;
    }

    const curr = Number(data[i]);
    const prev = Number(data[i - 1]);

    if (type === "weight") {
      // Weight ↓ is GOOD
      if (curr < prev) colors.push(GOOD);
      else if (curr > prev) colors.push(BAD);
      else colors.push(NEUTRAL);
    } else {
      // Others ↑ is GOOD
      if (curr > prev) colors.push(GOOD);
      else if (curr < prev) colors.push(BAD);
      else colors.push(NEUTRAL);
    }
  }

  return colors;
}





function drawSection4Charts(data) {

  if (!weeklyScopeAverages || !weeklyScopeAverages.length) {
    console.log("No weekly scope averages found");
    return;
  }

  destroyCharts();

  const weekly = {
    labels: [],
    weight: [],
    calories: [],
    steps: [],
    distance: [],
    weightColors: [],
    caloriesColors: [],
    stepsColors: [],
    distanceColors: []
  };
labels: [
 "April_3rd",
 "April_4th",
 "May_1st",
 "May_2nd",
 "May_3rd",
 "May_4th",
 "May_5th",
 "June_1st"
]
  /* ================= DYNAMIC SCOPE FILTER ================= */

let rows = [];

// ================= FIXED SCOPE MAP =================

const scopeMap = {

  "IGOFFICE": "IG OFFICE",

  "RANGESBP": "RANGE SBP",

  "RANGEBBSR": "RANGE BBSR",

  "RANGESBPALL": "RANGE SBP + UNITS",

  "RANGEBBSRALL": "RANGE BBSR + UNITS",

  "ODISHASECTOR": "ODISHA SECTOR",

  "ALL": "ODISHA SECTOR"
};

const finalScope =
  scopeMap[selectedUnit] || selectedUnit;

rows = weeklyScopeAverages.filter(r => {

  const rowScope =
    normalizeScope(r.Scope);

  const targetScope =
    normalizeScope(finalScope);

  return rowScope === targetScope;
});

// REMOVE EMPTY/FAKE DATA
rows = rows.filter(r =>
  isValidNumber(r.Value)
);

console.log("SELECTED UNIT:", selectedUnit);
console.log("FINAL SCOPE:", finalScope);
console.log("FILTERED ROWS:", rows);
  // ================= UNIQUE WEEKS =================

  const uniqueWeeks = [];

  rows.forEach(r => {

    const raw = String(r.WeekKey || "").trim();

    const cleanWeek = raw.split("_SAT_")[0].trim();

    if (!cleanWeek) return;

    if (!uniqueWeeks.includes(cleanWeek)) {
      uniqueWeeks.push(cleanWeek);
    }
  });

  weekly.labels = uniqueWeeks;

  // ================= DATA =================
  // ================= FAST DATA MAP =================

  const dataMap = {};

  rows.forEach(r => {

    const week = String(r.WeekKey || "")
      .split("_SAT_")[0]
      .trim();

    const metric = String(r.Metric || "")
      .toLowerCase()
      .trim();

    if (!dataMap[week]) {
      dataMap[week] = {};
    }

    dataMap[week][metric] = r;
  });

  // ================= DATA =================

  uniqueWeeks.forEach(week => {

    const weekData = dataMap[week] || {};

    const weightRow =
      weekData["weight"];

    const stepRow =
      weekData["steps"];

    const distRow =
      weekData["distance"];

    const calRow =
      weekData["calories"];

    weekly.weight.push(
      weightRow ? Number(weightRow.Value) || 0 : 0
    );

    weekly.steps.push(
      stepRow ? Number(stepRow.Value) || 0 : 0
    );

    weekly.distance.push(
      distRow ? Number(distRow.Value) || 0 : 0
    );

    weekly.calories.push(
      calRow ? Number(calRow.Value) || 0 : 0
    );

    function getChartColor(color) {

      color = String(color || "").toUpperCase();

      if (color === "GREEN") return "#2ecc71";
      if (color === "RED") return "#e74c3c";

      return "#95a5a6";
    }

    weekly.weightColors.push(
      getChartColor(weightRow?.Color)
    );

    weekly.stepsColors.push(
      getChartColor(stepRow?.Color)
    );

    weekly.distanceColors.push(
      getChartColor(distRow?.Color)
    );

    weekly.caloriesColors.push(
      getChartColor(calRow?.Color)
    );
  });

  const commonOptions = {

  responsive: true,
  maintainAspectRatio: false,

  plugins: {

    legend: {
      display: false
    },

    title: {
      display: true,

      font: {
        size: 32,
        weight: "bold"
      },

      padding: {
        bottom: 30
      }
    },

    datalabels: {

      anchor: "end",
      align: "top",

      offset: 6,
      clamp: true,
      clip: false,

      color: "#000",

      font: {
        size: 28,
        weight: "bold"
      },

      formatter: function(value, context) {

        const num = Number(value);

        if (isNaN(num)) return "";

        const chartId =
          context.chart.canvas.id;

        // REMOVE DECIMALS FOR CALORIES & STEPS
        if (
          chartId === "caloriesChart" ||
          chartId === "stepsChart"
        ) {
          return Math.round(num);
        }

        // KEEP DECIMALS FOR DISTANCE
        return num.toFixed(2);
      }
    }
  },

  scales: {

    x: {
      ticks: {
        color: "#000",

        font: {
          size: 28,
          weight: "bold"
        }
      }
    },

    y: {

      beginAtZero: true,

      ticks: {

        callback: function(value) {

          const chartId =
            this.chart.canvas.id;

          // REMOVE DECIMALS FOR CALORIES & STEPS
          if (
            chartId === "caloriesChart" ||
            chartId === "stepsChart"
          ) {
            return Math.round(value);
          }

          // KEEP DECIMALS FOR DISTANCE
          return Number(value).toFixed(2);
        }
      }
    }
  }
};

const weightOptions = {

  responsive: true,
  maintainAspectRatio: false,

  plugins: {

    legend: {
      display: false
    },
	title: {
      display: true,
 font: {
        size: 32,
        weight: "bold"
      },
      padding: {
        bottom: 30
      }
    },


    datalabels: {

      anchor: "end",
      align: "top",
	offset: 6,
      clamp: true,
      clip: false,

      color: "#000",

      font: {
        size: 28,
        weight: "bold"
      },

      formatter: function(value) {

        const num = Number(value);

        if (isNaN(num)) return "";

        return num.toFixed(1) + " Kg";
      }
    }
  },

  scales: {
	x: {
      ticks: {
        color: "#000",
        font: {
          size: 28,
          weight: "bold"
        }
      }
    },

    y: {

      beginAtZero: true,
      
    }
  }
};
  // ================= WEIGHT =================

  weightChart = new Chart(document.getElementById('weightChart'), {

    type: 'bar',

    data: {
      labels: weekly.labels,
      datasets: [{
  data: weekly.weight,
  backgroundColor: weekly.weightColors,

 
}]
    },

    options: weightOptions,
    plugins: [ChartDataLabels]
  });

 weightChart.canvas.onclick = () =>
  openFullscreenChart(weightChart, "Weekly Average Weight(Kg)");

  // ================= CALORIES =================

  caloriesChart = new Chart(document.getElementById('caloriesChart'), {

    type: 'bar',

    data: {
      labels: weekly.labels,
      datasets: [{
        data: weekly.calories,
        backgroundColor: weekly.caloriesColors
      }]
    },

    options: commonOptions,
    plugins: [ChartDataLabels]
  });

  caloriesChart.canvas.onclick = () =>
  openFullscreenChart(caloriesChart, "Weekly Average Calories");

  // ================= STEPS =================

  stepsChart = new Chart(document.getElementById('stepsChart'), {

    type: 'bar',

    data: {
      labels: weekly.labels,
      datasets: [{
        data: weekly.steps,
        backgroundColor: weekly.stepsColors
      }]
    },

    options: commonOptions,
    plugins: [ChartDataLabels]
  });

  stepsChart.canvas.onclick = () =>
  openFullscreenChart(stepsChart, "Weekly Average Steps Count");

  // ================= DISTANCE =================

  distanceChart = new Chart(document.getElementById('distanceChart'), {

    type: 'bar',

    data: {
      labels: weekly.labels,
      datasets: [{
        data: weekly.distance,
        backgroundColor: weekly.distanceColors
      }]
    },

    options: commonOptions,
    plugins: [ChartDataLabels]
  });

  
distanceChart.canvas.onclick = () =>
  openFullscreenChart(distanceChart, "Weekly Average Distance(KM)");
}
/* ================= DESTROY ================= */
function destroyCharts() {
  if (weightChart) weightChart.destroy();
  if (caloriesChart) caloriesChart.destroy();
  if (stepsChart) stepsChart.destroy();
  if (distanceChart) distanceChart.destroy();
}


function handleWeeklyFreeze(rows){

  const now = new Date();

  const day = now.getDay(); // Saturday = 6
  const hour = now.getHours();
  const minute = now.getMinutes();

  const freezeTimeReached =
    day === 6 && (hour > 22 || (hour === 22 && minute >= 30));

  const currentWeekKey =
    now.getFullYear() + "_" +
    now.getMonth() + "_" +
    getWeekNumber(now);

  const savedKey =
    localStorage.getItem("freezeWeekKey");

  const savedData =
    localStorage.getItem("freezeWeeklyData");

  // If freeze time reached this Saturday
  if (freezeTimeReached) {

    // Freeze only once this week
    if (savedKey !== currentWeekKey) {

      const freshData = JSON.parse(JSON.stringify(rows));

      localStorage.setItem(
        "freezeWeekKey",
        currentWeekKey
      );

      localStorage.setItem(
        "freezeWeeklyData",
        JSON.stringify(freshData)
      );

      frozenWeeklyCache = freshData;
console.log("FREEZE SIZE:", frozenWeeklyCache.length);
console.log(frozenWeeklyCache);

    } else {

      frozenWeeklyCache = JSON.parse(savedData);
    }

  } else {

    // Before freeze time
    if (savedKey === currentWeekKey && savedData) {
      frozenWeeklyCache = JSON.parse(savedData);
    } else {
      frozenWeeklyCache = rows;
    }
  }
}
function getWeekNumber(date){

  const firstDay =
    new Date(date.getFullYear(),0,1);

  const pastDays =
    (date - firstDay) / 86400000;

  return Math.ceil(
    (pastDays + firstDay.getDay() + 1) / 7
  );
}
function updateBestPerformer(){

  if(!weeklyUnitPerformance || !weeklyUnitPerformance.length){
    console.log("❌ weeklyUnitPerformance empty");
    return;
  }

  // =========================
  // ENTITY GROUPS
  // =========================

  const RANGE_SBP_UNITS = [
    "4 BN",
    "8 BN",
    "12 BN",
    "64 BN",
    "127 BN",
    "Range SBP",
    "GC SBP"
  ];

  const RANGE_BBSR_UNITS = [
    "19 BN",
    "168 BN",
    "189 BN",
    "216 BN",
    "228 BN",
    "GC BBSR",
    "CH BBSR",
    "IG office",
    "Range BBSR"
  ];

  const ALL_UNITS = [
    ...RANGE_SBP_UNITS,
    ...RANGE_BBSR_UNITS
  ];

  let rows = [];

  // =========================
  // FILTER BY SELECTED UNIT
  // =========================


const allowedUnits =
  getGroupedUnits(selectedUnit);

const unit = normalizeScope(selectedUnit);
rows = data.filter(x =>
  allowedUnits.includes(
    normalizeScope(x.Unit)
  )
);

/* =========================
   GROUP SCOPES
========================= */

if(
  unit === "RANGESBPUNITS"
){

  rows = weeklyUnitPerformance.filter(r =>
    normalizeScope(r.Unit) === "RANGESBPUNITS"
  );
}

/* =========================
   RANGE BBSR + UNITS
========================= */

else if(
  unit === "RANGEBBSRUNITS"
){

  rows = weeklyUnitPerformance.filter(r =>
    normalizeScope(r.Unit) === "RANGEBBSRUNITS"
  );
}

/* =========================
   ODISHA SECTOR
========================= */

else if(
  unit === "ODISHASECTOR" ||
  unit === "ALL"
){

  rows = weeklyUnitPerformance.filter(r =>
    normalizeScope(r.Unit) === "ODISHASECTOR"
  );
}

/* =========================
   SINGLE UNIT
========================= */
else{

  rows = weeklyUnitPerformance.filter(r => {

    const rowUnit =
      normalizeScope(r.Unit);

    // EXACT SINGLE ENTITY MATCH

    if(unit === "RANGESBP"){
      return rowUnit === "RANGESBP";
    }

    if(unit === "RANGEBBSR"){
      return rowUnit === "RANGEBBSR";
    }

    return rowUnit === unit;
  });
}


  // =========================
  // SAFETY
  // =========================

  if(!rows.length){

    document.getElementById("bestWeight").innerText = "-";
    document.getElementById("bestSteps").innerText = "-";
    document.getElementById("bestDistance").innerText = "-";
    document.getElementById("bestCalories").innerText = "-";

    console.log("❌ No rows matched");

    return;
  }

  // =========================
  // NUMBER PARSER
  // =========================

  const num = v => {

    const n = parseFloat(v);

    return isNaN(n) ? 0 : n;
  };

  // =========================
  // BEST HELPERS
  // =========================

  const bestMax = (arr,key)=>{

    return arr.reduce((a,b)=>
      num(b[key]) > num(a[key]) ? b : a
    );
  };

  const bestMin = (arr,key)=>{

    return arr.reduce((a,b)=>
      num(b[key]) < num(a[key]) ? b : a
    );
  };

  // =========================
  // GROUP MODE
  // =========================
if(
  unit === "RANGESBPUNITS" ||
  unit === "RANGEBBSRUNITS" ||
  unit === "ODISHASECTOR" ||
  unit === "ALL"
)
  
{

    const bestWeight = bestMin(rows,"WeightAvg");
    const bestSteps = bestMax(rows,"StepsAvg");
    const bestDistance = bestMax(rows,"DistanceAvg");
    const bestCalories = bestMax(rows,"CaloriesAvg");

    document.getElementById("bestWeight").innerText =
      `${bestWeight.Unit} (${num(bestWeight.WeightAvg).toFixed(2)})`;

    document.getElementById("bestSteps").innerText =
      `${bestSteps.Unit} (${num(bestSteps.StepsAvg).toFixed(0)})`;

    document.getElementById("bestDistance").innerText =
      `${bestDistance.Unit} (${num(bestDistance.DistanceAvg).toFixed(2)})`;

    document.getElementById("bestCalories").innerText =
      `${bestCalories.Unit} (${num(bestCalories.CaloriesAvg).toFixed(0)})`;
  }

  // =========================
  // INDIVIDUAL UNIT MODE
  // =========================

  else{

    const r = rows[0];

    document.getElementById("bestWeight").innerText =
      num(r.WeightAvg).toFixed(2);

    document.getElementById("bestSteps").innerText =
      num(r.StepsAvg).toFixed(0);

    document.getElementById("bestDistance").innerText =
      num(r.DistanceAvg).toFixed(2);

    document.getElementById("bestCalories").innerText =
      num(r.CaloriesAvg).toFixed(0);
  }

  console.log("✅ Weekly Performer Updated");
}




/* ================= ACTIVE ================= */
function setActive(btn, type) {
  if (type === "unit") {
    document.querySelectorAll("#top button").forEach(b => b.classList.remove("active-unit"));
    btn.classList.add("active-unit");
  } else {
    document.querySelectorAll("#middle button").forEach(b => b.classList.remove("active-category"));
    btn.classList.add("active-category");
  }
}

/* ================= SCROLL ================= */
document.getElementById("output").addEventListener("scroll", function () {
  const el = this;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 10) {
    if (rowsLoaded < currentTableData.length) {
      loadMoreRows();
    }
  }
});

/* ================= INIT =================
   ✅ SPEED FIX: fetchData() already fetches frozen winners and the
   weekly scope averages internally (in parallel now — see fetchData()).
   Calling fetchMyStatusFrozen() / fetchFrozenWinners() again here was
   duplicating those network requests on every page load and was one
   of the main reasons the dashboard/charts felt slow to appear.
   PA data is also pre-fetched here (in the background, in parallel
   with everything else) so the PA table opens instantly on first
   click instead of waiting on a fresh network round-trip.

   ✅ RESILIENCE FIX: this used to be Promise.all(...).then(...) — if
   ANY single one of these three (fetchData / fetchWeeklyUnitPerformance
   / fetchPAData) threw for any reason, the whole .then() block never
   ran at all, silently — meaning updateBestPerformer() and
   updateBestFromFrozen() would never fire and the Weekly Performers
   card would stay blank with zero visible error. Promise.allSettled
   guarantees the block below always runs, and logs exactly which
   step (if any) failed, so a problem in one data source can no
   longer silently take down an unrelated card. */
Promise.allSettled([
  fetchData(),
  fetchWeeklyUnitPerformance(),
  fetchPAData()
]).then((results)=>{

  const labels = ["fetchData", "fetchWeeklyUnitPerformance", "fetchPAData"];

  results.forEach((r, i) => {
    if (r.status === "rejected") {
      console.error(`Init step "${labels[i]}" failed — this is why some cards may be blank:`, r.reason);
    }
  });

  updateBestPerformer();

  updateBestFromFrozen();

});

/* ================= AUTO REFRESH ================= */
setInterval(() => {
  if (!document.hidden) fetchData();
}, 300000);
let modalChartInstance = null;
function openFullscreenChart(chartInstance, chartTitle) {

  const modal =
    document.getElementById("chartModal");

  modal.style.display = "flex";

  // REMOVE OLD CANVAS
  const oldCanvas =
    document.getElementById("modalChart");

  oldCanvas.remove();

  // CREATE NEW CANVAS
  const newCanvas =
    document.createElement("canvas");

  newCanvas.id = "modalChart";

  document
    .getElementById("chartContainer")
    .appendChild(newCanvas);

  const ctx =
    newCanvas.getContext("2d");

  // DESTROY OLD MODAL CHART
  if (modalChartInstance) {
    modalChartInstance.destroy();
  }

  // SAFE DATA COPY
  const newData =
    JSON.parse(JSON.stringify(chartInstance.data));

  modalChartInstance = new Chart(ctx, {

    type: chartInstance.config.type,

    data: newData,

    options: {
      responsive: true,
      maintainAspectRatio: false,

      plugins: {

        legend: {
          display: false
        },

        title: {
          display: true,

          text: chartTitle,

          color: "#000",

          font: {
            size: 42,
            weight: "bold"
          },

          padding: {
            bottom: 30
          }
        },

        datalabels: {
          anchor: "end",
          align: "top",
          color: "#000",

          font: {
            size: 34,
            weight: "bold"
          },

          formatter: function(value) {

            // REMOVE DECIMALS FOR STEPS & CALORIES
            if (
              chartTitle === "Weekly Average Steps Count" ||
              chartTitle === "Weekly Average Calories Burnt(KCol)"
            ) {
              return Math.round(value);
            }

            // KEEP DECIMALS FOR OTHERS
            return Number(value).toFixed(2);
          }
        }
      },

      scales: {

        x: {
          ticks: {
            color: "#000",

            font: {
              size: 34,
              weight: "bold"
            }
          }
        },

        y: {
          beginAtZero: true,

          ticks: {
            color: "#000",

            font: {
              size: 34,
              weight: "bold"
            },

            callback: function(value) {

              // REMOVE DECIMALS FOR STEPS & CALORIES
              if (
                chartTitle === "Weekly Average Steps Count" ||
                chartTitle === "Weekly Average Calories Burnt(KCol)"
              ) {
                return Math.round(value);
              }

              // KEEP DECIMALS FOR OTHERS
              return Number(value).toFixed(2);
            }
          }
        }
      }
    },

    plugins: [ChartDataLabels]
  });
}


// CLOSE MODAL
document.getElementById("closeModal").onclick = closeModal;

window.onclick = function (e) {
  if (e.target === document.getElementById("chartModal")) {
    closeModal();
  }
};

/* ================= SWIPE DOWN TO CLOSE ================= */

let touchStartY = 0;
let touchEndY = 0;

const modal = document.getElementById("chartModal");

modal.addEventListener("touchstart", function (e) {
  touchStartY = e.changedTouches[0].screenY;
});

modal.addEventListener("touchend", function (e) {
  touchEndY = e.changedTouches[0].screenY;

  // if swipe down > 100px → close
  if (touchEndY - touchStartY > 100) {
    closeModal();
  }
});

function closeModal() {
  document.getElementById("chartModal").style.display = "none";
  if (modalChartInstance) modalChartInstance.destroy();
}
/* ================= INSTALL BANNER ================= */

let deferredPrompt;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;

  const banner = document.getElementById("installBanner");
  if (!banner) return;

  // SHOW
  banner.classList.remove("hide");
  banner.classList.add("show");

  // AUTO HIDE AFTER 6 SEC (RIGHT WIPE)
  setTimeout(() => {
    banner.classList.remove("show");
    banner.classList.add("hide");
  }, 6000);
});

window.addEventListener("load", () => {
  const btn = document.getElementById("installBtn");
  if (!btn) return;

  btn.addEventListener("click", async () => {
    const banner = document.getElementById("installBanner");

    if (banner) {
      banner.classList.remove("show");
      banner.classList.add("hide");
    }

    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
    }
  });
});
function getMedal(rank){
  rank = Number(rank);
  if(rank === 1) return "🥇";
  if(rank === 2) return "🥈";
  if(rank === 3) return "🥉";
  return "";
}

/* ================= WEEK DETECTION ================= */

function detectAllWeeks(row) {
  const headers = Object.keys(row);

  let weeks = {};

  headers.forEach(h => {
    const x = h.toLowerCase();

    if (!x.includes("_sat")) return;

    const parts = h.split("_");
    const weekKey = parts[0] + "_" + parts[1]; // April_4th

    if (!weeks[weekKey]) weeks[weekKey] = {};

 const clean = x.replace(/\s+/g, "").toLowerCase();

if (clean.includes("weight")) weeks[weekKey].weight = h;

if (clean.includes("step")) weeks[weekKey].steps = h;

if (clean.includes("distance") || clean.includes("km")) weeks[weekKey].distance = h;

if (clean.includes("calorie")) weeks[weekKey].calories = h;
  });

  let validWeeks = Object.keys(weeks).filter(w =>
    weeks[w].weight &&
    weeks[w].steps &&
    weeks[w].distance &&
    weeks[w].calories
  );

  function parseWeek(w){
    const [month, wk] = w.split("_");
    const monthIndex = new Date(Date.parse(month + " 1, 2024")).getMonth();
    const map = {"1st":1,"2nd":2,"3rd":3,"4th":4,"5th":5};
    return monthIndex * 10 + (map[wk] || 0);
  }

  validWeeks.sort((a,b)=>parseWeek(a)-parseWeek(b));

  return { weeks, validWeeks };
}


/* ================= VALUE + EMOJI ================= */

function getIndicator(curr, prev, type) {
  if (curr === prev) return "➖";

  if (type === "weight") {
    return curr < prev ? "👍" : "👎";
  } else {
    return curr > prev ? "👍" : "👎";
  }
}

function safe(val){
  if (val === undefined || val === null || val === "") return "-";
  return val;
}


/* ================= RANK MAPPING ================= */

function getRank(metric, type, data){

  const map = {
    weight: {
      overall: "OverallWeightRank",
      unit: "UnitWeightRank",
      category: "CategoryWeightRank"
    },
    steps: {
      overall: "OverallStepsRank",
      unit: "UnitStepsRank",
      category: "CategoryStepsRank"
    },
    distance: {
      overall: "OverallDistanceRank",
      unit: "UnitDistanceRank",
      category: "CategoryDistanceRank"
    },
    calories: {
      overall: "OverallCaloriesRank",
      unit: "UnitCaloriesRank",
      category: "CategoryCaloriesRank"
    }
  };

  return safe(data[ map[metric][type] ]);
}
function getValue(row, columnName) {
  const normalize = str =>
    String(str).replace(/[^a-z0-9]/gi, "").toLowerCase();

  const target = normalize(columnName);

  const key = Object.keys(row).find(k =>
    normalize(k) === target
  );

  return key ? row[key] : null;
}


function isRealValue(val) {
  if (val === null || val === undefined) return false;

  const v = String(val).trim();

  if (v === "" || v === "-") return false;

  if (isNaN(v)) return false;

  if (Number(v) === 0) return false; // 🔥 VERY IMPORTANT

  return true;
}
function openMyStatusModal(btn) {

  // ✅ ACTIVE BUTTON (optional but good)
  if (btn) {
    document.querySelectorAll("#myStatusContainer button")
      .forEach(b => b.classList.remove("active-status"));
    btn.classList.add("active-status");
  }

  const modal = document.getElementById("myStatusModal");
  const content = document.getElementById("myStatusBody");

  if (!selectedPerson || !frozenMyStatus) {
    alert("⚠️ Data missing");
    return;
  }

  /* ================= DETECT WEEKS ================= */

/* ================= USE CACHED WEEK DATA ================= */

const { weeks, validWeeks } = detectAllWeeks(selectedPerson);

  if (!validWeeks || validWeeks.length < 2) {
    content.innerHTML = "<h3>❌ Not enough weekly data</h3>";
    modal.style.display = "flex";
    return;
  }

  // 🔥 FILTER WEEKS HAVING ACTUAL DATA

const normalize = str => String(str).replace(/\s+/g,'').toLowerCase();
const weeksWithData = validWeeks.filter(week => {
  const cols = weeks[week];

  return ["weight","steps","distance","calories"].some(metric => {
    const val = getValue(selectedPerson, cols[metric]);
    return isRealValue(val);   // 🔥 FINAL FIX
  });
});

// DEBUG (optional)
console.log("Weeks with data:", weeksWithData);

if (weeksWithData.length < 2) {
  content.innerHTML = "<h3>❌ Not enough weekly data</h3>";
  modal.style.display = "flex";
  return;
}

// ✅ FINAL CORRECT SELECTION
const currentWeek = weeksWithData[weeksWithData.length - 1];
const prevWeek    = weeksWithData[weeksWithData.length - 2];

const currCols = weeks[currentWeek];
const prevCols = weeks[prevWeek];
	
        // 🔍 DEBUG (ADD HERE)
   console.log("Weeks:", validWeeks);
   console.log("Current Week:", currentWeek);
   console.log("Previous Week:", prevWeek);
   console.log("CurrCols:", currCols);
   console.log("PrevCols:", prevCols);
   console.log("Selected Person:", selectedPerson);

  /* ================= EXTRACT VALUES ================= */

function getVals(metric){

  const currRaw = getValue(selectedPerson, currCols[metric]);
  const prevRaw = getValue(selectedPerson, prevCols[metric]);

  const curr = (currRaw !== null && currRaw !== "") ? Number(currRaw) : null;
  const prev = (prevRaw !== null && prevRaw !== "") ? Number(prevRaw) : null;

  let change = "-";
  let emoji = "";

  if (curr !== null && prev !== null) {
    change = (curr - prev).toFixed(2);
    emoji = getIndicator(curr, prev, metric);
  }

  return {
    prev: prev ?? "-",
    curr: curr ?? "-",
    change,
    emoji
  };
}
  const weight = getVals("weight");
  const steps  = getVals("steps");
  const dist   = getVals("distance");
  const cal    = getVals("calories");

  /* ================= MATCH FROZEN DATA ================= */

  const myStatusData = frozenMyStatus.find(r =>
    String(r["Force No"]).trim() === String(selectedPerson["Force No"]).trim()
  ) || {};

  /* ================= BUILD TABLE ================= */

  content.innerHTML = `
  <h2 style="text-align:center;">🏆 Be The Best : Beat the Rest</h2>
   
  <table>

    <tr style="background:#8e2f2f; color:white;">
      <th colspan="6">My Status</th>
    </tr>

    <tr style="background:#f5b041;">
      <th>Force No</th><th>Rank</th><th>Name</th><th>Unit</th><th>Category</th><th>BMI</th>
    </tr>

    <tr>
      <td>${safe(selectedPerson["Force No"])}</td>
      <td>${safe(selectedPerson["RANK"])}</td>
      <td>${safe(selectedPerson["Name"])}</td>
      <td>${safe(selectedPerson["Unit"])}</td>
      <td>${safe(selectedPerson[categoryKey])}</td>
      <td>${safe(selectedPerson["BMI"])}</td>
    </tr>

    <tr style="background:yellow; font-weight:bold;">
      <td colspan="6">KPI - ${currentWeek}</td>
    </tr>

    <!-- WEIGHT -->
    <tr style="background:#d98880;"><td colspan="6"><b>1. Weight (Kg)</b></td></tr>
    <tr>
      <th>Prev</th><th>Curr</th><th>Change</th><th>Overall</th><th>Unit</th><th>Category</th>
    </tr>
    <tr>
      <td>${weight.prev}</td>
      <td>${weight.curr}</td>
      <td>${weight.change} ${weight.emoji}</td>
      <td>${getRank("weight","overall",myStatusData)}</td>
      <td>${getRank("weight","unit",myStatusData)}</td>
      <td>${getRank("weight","category",myStatusData)}</td>
    </tr>

    <!-- DISTANCE -->
    <tr style="background:#85c1e9;"><td colspan="6"><b>2. Distance (KM)</b></td></tr>
    <tr>
      <th>Prev</th><th>Curr</th><th>Change</th><th>Overall</th><th>Unit</th><th>Category</th>
    </tr>
    <tr>
      <td>${dist.prev}</td>
      <td>${dist.curr}</td>
      <td>${dist.change} ${dist.emoji}</td>
      <td>${getRank("distance","overall",myStatusData)}</td>
      <td>${getRank("distance","unit",myStatusData)}</td>
      <td>${getRank("distance","category",myStatusData)}</td>
    </tr>

    <!-- STEPS -->
    <tr style="background:#f7dc6f;"><td colspan="6"><b>3. Steps</b></td></tr>
    <tr>
      <th>Prev</th><th>Curr</th><th>Change</th><th>Overall</th><th>Unit</th><th>Category</th>
    </tr>
    <tr>
      <td>${steps.prev}</td>
      <td>${steps.curr}</td>
      <td>${steps.change} ${steps.emoji}</td>
      <td>${getRank("steps","overall",myStatusData)}</td>
      <td>${getRank("steps","unit",myStatusData)}</td>
      <td>${getRank("steps","category",myStatusData)}</td>
    </tr>

    <!-- CALORIES -->
    <tr style="background:#82e0aa;"><td colspan="6"><b>4. Calories</b></td></tr>
    <tr>
      <th>Prev</th><th>Curr</th><th>Change</th><th>Overall</th><th>Unit</th><th>Category</th>
    </tr>
    <tr>
      <td>${cal.prev}</td>
      <td>${cal.curr}</td>
      <td>${cal.change} ${cal.emoji}</td>
      <td>${getRank("calories","overall",myStatusData)}</td>
      <td>${getRank("calories","unit",myStatusData)}</td>
      <td>${getRank("calories","category",myStatusData)}</td>
    </tr>

    <!-- MOTIVATION -->
    <tr style="background:#e67e22; color:white;">
      <td colspan="6">
        ${
          (weight.curr < weight.prev && steps.curr > steps.prev)
          ? "🔥 Excellent Performance!"
          : (weight.curr > weight.prev && steps.curr < steps.prev)
          ? "⚠️ Needs Improvement"
          : "👍 Keep Going"
        }
      </td>
    </tr>

  </table>
  `;

  modal.style.display = "flex";
}







/* ================= OPEN MODAL ================= */
function closeMyStatusModal() {
  const modal = document.getElementById("myStatusModal");
  if (modal) {
    modal.style.display = "none";
  }
}
/* ================= LEADERBOARD MODAL ================= */

function openLeaderboardModal() {
  const modal = document.getElementById("leaderModal");
  modal.style.display = "flex";

  generateLeaderboard();
}
setTimeout(() => {
  const closeBtn = document.getElementById("closeLeader");
  if (closeBtn) {
    closeBtn.onclick = () => {
      document.getElementById("leaderModal").style.display = "none";
    };
  }
}, 500);


window.addEventListener("click", function(e){
  if(e.target === document.getElementById("leaderModal")){
    document.getElementById("leaderModal").style.display = "none";
  }
});

/* ================= GENERATE TOP 3 ================= */
function generateLeaderboard(){

  if(
    !Array.isArray(frozenWeeklyCache) ||
    frozenWeeklyCache.length === 0
  ){
    document.getElementById("leaderTable").innerHTML =
      "<h3>No leaderboard data found</h3>";
    return;
  }

  const unit =
    normalizeScope(selectedUnit || "ALL");

  let rows = [];

  /* =========================
     ODISHA SECTOR
  ========================= */
if(
  unit === "ODISHASECTOR" ||
  unit === "ALL"
){

  rows = frozenWeeklyCache.filter(r =>
    normalizeScope(r.Scope) === "ODISHASECTOR"
  );
}

  /* =========================
     RANGE SBP
  ========================= */

  else if(
    unit === "RANGESBPUNITS" ||
    unit === "RANGESBPALL"
  ){

    const allowed = [
      "4 BN",
      "8 BN",
      "12 BN",
      "64 BN",
      "127 BN",
      "RANGE SBP",
      "GC SBP"
    ];

    rows = frozenWeeklyCache.filter(r =>
      allowed
        .map(normalizeScope)
        .includes(normalizeScope(r.Scope))
    );
  }

  /* =========================
     RANGE BBSR
  ========================= */

  else if(
    unit === "RANGEBBSRUNITS" ||
    unit === "RANGEBBSRALL"
  ){

    const allowed = [
      "19 BN",
      "168 BN",
      "189 BN",
      "216 BN",
      "228 BN",
      "GC BBSR",
      "CH BBSR",
      "IG OFFICE",
      "RANGE BBSR"
    ];

    rows = frozenWeeklyCache.filter(r =>
      allowed
        .map(normalizeScope)
        .includes(normalizeScope(r.Scope))
    );
  }

  /* =========================
     SINGLE UNIT
  ========================= */
else{

  rows = frozenWeeklyCache.filter(r => {

    const scope =
      normalizeScope(r.Scope);

    // EXACT ENTITY FIX

    if(unit === "RANGESBP"){
      return scope === "RANGESBP";
    }

    if(unit === "RANGEBBSR"){
      return scope === "RANGEBBSR";
    }

    return scope === unit;
  });
}


  console.log("LEADERBOARD UNIT:", unit);
  console.log("LEADERBOARD ROWS:", rows);

  /* =========================
     GET TOP 3
  ========================= */

  function getTop3(metric){

    const isWeight =
      normalizeMetric(metric)
        .includes("WEIGHT");

    return rows
      .filter(r =>

        normalizeMetric(r.Metric) ===
        normalizeMetric(metric)

      )
      .sort((a,b)=>{

        const av =
          Number(a.Value || 0);

        const bv =
          Number(b.Value || 0);

        // WEIGHT LOSS => LOWER BETTER
        if(isWeight){
          return av - bv;
        }

        // OTHERS => HIGHER BETTER
        return bv - av;

      })
      .slice(0,3);
  }

  /* =========================
     TABLE BUILDER
  ========================= */

  function buildTable(title, arr){

    if(!arr.length){

      return `
        <h3 class="leader-title">${title}</h3>
        <p style="text-align:center;">
          No data
        </p>
      `;
    }

    let html = `
      <h3 class="leader-title">
        ${title}
      </h3>

      <table class="leader-table">

        <tr>
          <th>Pos</th>
          <th>Unit</th>
          <th>Name</th>
          <th>Value</th>
        </tr>
    `;

    arr.forEach((p,i)=>{

      const medal =
        i===0 ? "🥇" :
        i===1 ? "🥈" : "🥉";

      const rowClass =
        i===0 ? "gold" :
        i===1 ? "silver" :
        "bronze";

      html += `
        <tr class="${rowClass}">
          <td>${medal}</td>
          <td>${p.Unit || "-"}</td>
          <td>${p.Name || "-"}</td>
          <td>${p.Value || "-"}</td>
        </tr>
      `;
    });

    html += "</table>";

    return html;
  }

  /* =========================
     GET METRICS
  ========================= */

  const weight =
    getTop3("Weight Loss");

  const steps =
    getTop3("Steps");

  const distance =
    getTop3("Distance");

  const calories =
    getTop3("Calories");

  /* =========================
     FINAL HTML
  ========================= */

  let html = `
    <h2 style="text-align:center">
      🏆 Leader Board 🏆
    </h2>

    <h3 style="text-align:center">
      ${selectedUnit}
    </h3>
  `;

  html += buildTable(
    "🔻 Weight Loss",
    weight
  );

  html += buildTable(
    "🚶 Steps",
    steps
  );

  html += buildTable(
    "🚴 Distance",
    distance
  );

  html += buildTable(
    "🔥 Calories",
    calories
  );

  document.getElementById(
    "leaderTable"
  ).innerHTML = html;
}



// ✅ BUG FIX: this function was being CALLED (twice, below) but was
// never actually defined anywhere in the file. That caused a
// ReferenceError every time updateBestFromFrozen() hit one of its
// early-exit paths (e.g. right at page load, before frozenWeeklyCache
// has data yet) — silently aborting the function and leaving the
// "🏆 Weekly Performers" card stuck on its static "-" placeholders,
// which is exactly the "shows nothing by default" symptom.
function setDash(text){

    const ids = ["bestWeight","bestSteps","bestDistance","bestCalories"];

    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = text;
    });
}

function updateBestFromFrozen(){

  if(!Array.isArray(frozenWeeklyCache) || !frozenWeeklyCache.length){
    console.warn("updateBestFromFrozen: frozenWeeklyCache is empty — nothing to show yet.");
    setDash("-");
    return;
  }

  const unit = normalizeScope(selectedUnit || "ALL");

  let rows = frozenWeeklyCache.filter(r => {

    const scope =
      normalizeScope(r.Scope);

    // ✅ REVERTED: this is your original, working filter. An earlier
    // fix attempt changed this to `scope === "ODISHASECTOR"` based on
    // the Leaderboard modal's pattern, assuming the sheet had a
    // dedicated "ODISHA SECTOR" scope row — it likely doesn't, so
    // that change matched zero rows and broke a card that used to
    // work. Restored to the original logic (combine every row not
    // literally scoped "ALL").
    if(
  unit === "ALL" ||
  unit === "ODISHASECTOR"
)
{
      return scope !== "ALL";
    }

    if(
  unit === "RANGESBPALL" ||
  unit === "RANGESBPUNITS"
)
{
      return [
        "4 BN",
        "8 BN",
        "12 BN",
        "64 BN",
        "127 BN",
        "RANGE SBP"
      ].includes(normalizeText(r.Scope));
    }

    if(
  unit === "RANGEBBSRALL" ||
  unit === "RANGEBBSRUNITS"
)
{
      return [
        "19 BN",
        "168 BN",
        "189 BN",
        "216 BN",
        "228 BN",
        "GC BBSR",
        "CH BBSR",
        "IG OFFICE",
        "RANGE BBSR"
      ].includes(normalizeText(r.Scope));
    }

    return scope === unit;
  });

  // ✅ SELF-HEALING FALLBACK: if we expected a dedicated "ODISHA
  // SECTOR" scope row but the sheet actually labels it differently
  // (e.g. "Odisha", "Sector", "Overall", blank, etc.), the exact-match
  // filter above would return zero rows and the card would stay
  // blank — even though the compiled Odisha Sector view is really
  // just "every formation/unit combined". So when nothing matched and
  // we're on the sector/ALL view, fall back to using every row in the
  // sheet instead of failing silently.
  if((unit === "ALL" || unit === "ODISHASECTOR") && rows.length === 0){

    console.warn(
      "updateBestFromFrozen: no rows found with Scope = 'ODISHA SECTOR'. " +
      "Falling back to combining every row for the sector view. " +
      "Actual Scope values present in the sheet:",
      [...new Set(frozenWeeklyCache.map(r => r.Scope))]
    );

    rows = frozenWeeklyCache.slice();
  }

  // REMOVE INVALID ROWS
  rows = rows.filter(r =>
    isValidNumber(r.Value)
  );

  if(!rows.length){
    console.warn("updateBestFromFrozen: all matched rows had invalid/zero Value fields — nothing valid to show.");
    setDash("-");
    return;
  }

function get(metric){

  const target =
    normalizeMetric(metric);

  const metricRows =
    rows.filter(r =>
      normalizeMetric(r.Metric) === target
    );

  if(!metricRows.length) return null;

  // =========================
  // SINGLE UNIT OR GROUP?
  // =========================

  const isGrouped = [

    "RANGESBPUNITS",
    "RANGEBBSRUNITS",
    "RANGESBPALL",
    "RANGEBBSRALL",
    "ODISHASECTOR",
    "ALL"

  ].includes(normalizeScope(selectedUnit));

  // =========================
  // SINGLE UNIT MODE
  // =========================

  if(!isGrouped){

    return metricRows.find(r =>
      Number(r.Position) === 1
    );
  }

  // =========================
  // GROUP MODE
  // =========================

  // WEIGHT LOSS → LOWER BETTER
  if(target.includes("WEIGHT")){

    return metricRows.reduce((a,b)=>
      Number(b.Value) < Number(a.Value)
        ? b
        : a
    );
  }

  // OTHERS → HIGHER BETTER
  return metricRows.reduce((a,b)=>
      Number(b.Value) > Number(a.Value)
        ? b
        : a
  );
}
  const w = get("WEIGHT LOSS");
  const s = get("STEPS");
  const d = get("DISTANCE");
  const c = get("CALORIES");

  if(!w || !s || !d || !c){
    console.warn(
      "updateBestFromFrozen: one or more metrics didn't resolve.",
      { weightFound: !!w, stepsFound: !!s, distanceFound: !!d, caloriesFound: !!c },
      "Actual Metric values in the matched rows:",
      [...new Set(rows.map(r => r.Metric))]
    );
  }

  document.getElementById("bestWeight").innerText =
    w ? `${w.Name} (${Number(w.Value).toFixed(2)})` : "-";

  document.getElementById("bestSteps").innerText =
    s ? `${s.Name} (${Number(s.Value).toFixed(0)})` : "-";

  document.getElementById("bestDistance").innerText =
    d ? `${d.Name} (${Number(d.Value).toFixed(2)})` : "-";

  document.getElementById("bestCalories").innerText =
    c ? `${c.Name} (${Number(c.Value).toFixed(0)})` : "-";
}






/* ================= PDF DOWNLOAD ================= */
 function downloadLeaderboardPDF() {

  const { jsPDF } = window.jspdf;

  const element = document.querySelector(".leader-modal-content");

  if (!element) {
    alert("Leaderboard not found!");
    return;
  }

  html2canvas(element, {
    scale: 2   // 🔥 high quality
  }).then(canvas => {

    const imgData = canvas.toDataURL("image/png");

    const doc = new jsPDF("p", "mm", "a4");

    const imgWidth = 190;
    const pageHeight = 297;

    const imgHeight = canvas.height * imgWidth / canvas.width;

    let y = 10;

    doc.addImage(imgData, "PNG", 10, y, imgWidth, imgHeight);

    doc.save("Weekly_Top_Individual_Performers.pdf");

  });

}

function prepareWinners(categories) {

  let rows = getFilteredData();

  let winnersHTML = "";
  let allLinks = [];

  categories.forEach(cat => {

    cat.list.forEach((person, index) => {

      const medal = ["🥇","🥈","🥉"][index];

      let fullRow = rows.find(r =>
        r["Name"] === person.name &&
        r[unitKey] === person.unit
      );

      if (!fullRow) return;

      const phone = fullRow["Whatsapp Number"];
      if (!phone) return;

     const imageLink = "https://drive.google.com/file/d/1wAEzugtI04LjwviAapRks-jJDohqXdNj/view?usp=drive_link";

const message =
`🏆 *CONGRATULATIONS ${person.name.toUpperCase()}* 🎉

You secured *${medal}* in *${cat.event}* 💪

📸 View Your Trophy:
https://drive.google.com/file/d/1wAEzugtI04LjwviAapRks-jJDohqXdNj/view?usp=drive_link

Keep dominating! 🚀🔥`;


      const url = `https://wa.me/91${phone}?text=${encodeURIComponent(message)}`;

      allLinks.push(url);

      winnersHTML += `
        <div style="margin:12px 0; padding:10px; border-radius:8px; background:#f8f9f9;">
          <b>${medal} ${person.name}</b><br>
          <small>${cat.event}</small><br>

          <button onclick="window.open('${url}', '_blank')" 
            style="margin-top:6px; padding:6px 12px; background:green; color:#fff; border:none; border-radius:6px;">
            Send WhatsApp
          </button>
        </div>
      `;
    });

  });

  if (winnersHTML) {
  showMultiPopup(winnersHTML, allLinks);
} else {
  alert("⚠️ No winners generated!");
}

}
function showMultiPopup(content, allLinks) {

  const modal = document.createElement("div");

  modal.style.position = "fixed";
  modal.style.top = "0";
  modal.style.left = "0";
  modal.style.width = "100%";
  modal.style.height = "100%";
  modal.style.background = "rgba(0,0,0,0.85)";
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";
  modal.style.zIndex = "9999";

  modal.innerHTML = `
    <div style="background:#fff; padding:20px; border-radius:14px; width:95%; max-width:420px; max-height:85%; overflow:auto; text-align:center;">
      
      <img src="trophy.jpg" style="width:100%; max-height:220px; object-fit:cover; border-radius:10px;" />

      <h2 style="margin-top:10px;">🏆 Leaderboard Winners</h2>

      <button onclick="sendAllWhatsApp()" 
        style="margin:10px 0; padding:10px 16px; background:#d35400; color:#fff; border:none; border-radius:8px;">
        🚀 Send All Winners
      </button>

      <div style="text-align:left;">
        ${content}
      </div>

      <br>

      <button onclick="this.parentElement.parentElement.remove()">
        Close
      </button>

    </div>
  `;

  document.body.appendChild(modal);

  window.allWhatsAppLinks = allLinks;
}
function sendAllWhatsApp() {

  if (!window.allWhatsAppLinks || !window.allWhatsAppLinks.length) {
    alert("No winners found!");
    return;
  }

  let delay = 0;

  window.allWhatsAppLinks.forEach(link => {
    setTimeout(() => {
      window.open(link, "_blank");
    }, delay);

    delay += 800;
  });
}
document.addEventListener("DOMContentLoaded", function () {
    const input = document.getElementById("searchInput");

    if (input) {
        input.addEventListener("keyup", function (e) {
            if (e.key === "Enter") {
                searchByForceNumber();
            }
        });
    }
});
let frozenMyStatus = [];

async function fetchMyStatusFrozen(){

  const url =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSsWr0Cv0bDVEfu-gMBrKj0dNcdt8e_pgTEqwVtSEeaUpAiBZ4lSXQA6XdMZbe53j5fhBW6uNo8kL5K/pub?gid=325487861&single=true&output=csv";

  const res = await fetch(url);
  const text = await res.text();

  const rows = text
  .replace(/\r/g, "")
  .trim()
  .split("\n")
  .map(r =>
    r.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/)
      .map(x => x.trim())
  );

  const headers = rows[0];

  frozenMyStatus = rows.slice(1).map(row => {
    let obj = {};
    headers.forEach((h,i)=>obj[h]=row[i] || "");
    return obj;
  });

  console.log("MyStatus Frozen:", frozenMyStatus);
}

window.addEventListener("load", () => {

  const banner = document.getElementById("welcomeBanner");
  const content = document.querySelector(".welcome-content");
  const textEl = document.getElementById("typingText");

  const message =
    "तुम्हारा शरीर है — जिम्मेदारी भी तुम्हारी है।\nआराम ही तुम्हारा सबसे बड़ा दुश्मन है।";

  const lastShown = localStorage.getItem("welcomeShown");

  // ⏰ once per day
  if (lastShown && (Date.now() - lastShown < 86400000)) {
    if (banner) banner.style.display = "none";
    return;
  }

  if (banner) banner.style.display = "flex";

  // 🔥 SHOW ANIMATION
  setTimeout(() => {
    content.classList.add("show");
  }, 50);

  // ✍️ TYPING EFFECT
  let i = 0;
  textEl.classList.add("typing");

  function typeWriter() {
    if (i < message.length) {
      if (message[i] === "\n") {
        textEl.innerHTML += "<br>";
      } else {
        textEl.innerHTML += message[i];
      }
      i++;
      setTimeout(typeWriter, 35); // speed
    }
  }
textEl.innerHTML = "";   // ✅ MUST ADD
  typeWriter();

  // ⏳ REMOVE AFTER 5 SEC
  setTimeout(() => {
    if (banner) banner.style.display = "none";
    localStorage.setItem("welcomeShown", Date.now());
  }, 5000);

});

function openRunApp(){

    window.location.href =
    "download.html";

}


/* ==================================
   PA MODULE
================================== */

const paURL =
"https://script.google.com/macros/s/AKfycbylZzkompLlG06G2oytT710oPgrrWvRjO8SfaCYkywD2MRzWvhe2cTahYazxJP3GWI/exec";

let paSummaryData = [];

let paDetailsData = [];
let paMonthSummaryData = [];
let paMonthDetailsData = [];
let paCategorySummaryData = [];

let paMonthCategorySummaryData = [];

let paViewMode = "week";

/* CACHE FLAG — avoids re-fetching PA data (and the slow re-open of
   the PA modal) every single time the PA button is clicked. */
let paDataLoaded = false;

async function fetchPAData(force = false){

    // ✅ SPEED FIX: reuse already-loaded PA data instead of hitting
    // the Google Apps Script endpoint again on every modal open.
    if (paDataLoaded && !force) {
        return;
    }

    try{

        const response =
        await fetch(paURL);

        const data =
        await response.json();

paSummaryData =
data.summary || [];

paDetailsData =
data.details || [];

//====================================
// Weekly Category Summary
//====================================

paCategorySummaryData =
data.categorySummary || [];

paMonthSummaryData =
data.monthSummary || [];

paMonthDetailsData =
data.monthDetails || [];

//====================================
// Monthly Category Summary
//====================================

paMonthCategorySummaryData =
data.monthCategorySummary || [];

        console.log(
        "PA loaded",
        paSummaryData.length,
        paDetailsData.length
        );

        // ✅ Mark as loaded so future modal opens skip the network call
        paDataLoaded = true;

    }

    catch(error){

        console.error(
        "PA ERROR",
        error
        );

        // Allow a retry next time since this attempt failed
        paDataLoaded = false;

    }

}



function renderPATables(){

// ✅ SPEED FIX: skip rebuilding the entire PA table markup (all
// unit cards) if it's already rendered for the current Week/Month
// mode — this was being rebuilt from scratch on every single popup
// open even when nothing had changed.
const existingContainer = document.getElementById("paTableContainer");
if (
    existingContainer &&
    existingContainer.innerHTML.trim() !== "" &&
    existingContainer.dataset.paMode === paViewMode
) {
    return;
}

let html="";

const sourceData =
paViewMode === "month"
?
paMonthSummaryData
:
paSummaryData;

let rows =
sourceData.filter(x=>{

const unit =
String(x.Unit).trim().toUpperCase();

return(
unit !== "RANGE SBP" &&
unit !== "RANGE BBSR"
);

});

const odisha =
rows.find(
x =>
String(x.Unit)
.toUpperCase()
==="ODISHA SECTOR"
);

rows =
rows.filter(
x =>
String(x.Unit)
.toUpperCase()
!=="ODISHA SECTOR"
);

if(odisha){
rows.push(odisha);
}

rows.forEach(unit=>{

const safeUnit=
unit.Unit.replace(/\s+/g,"_");

const isOdisha =
unit.Unit==="ODISHA SECTOR";

html += `

<div class="pa-unit-card ${isOdisha ? 'odisha-sector':''}">

<table class="pa-unitTable">

<tr>

<th class="pa-head-unit">
Unit
</th>

<th class="pa-head-good">
UW→N
</th>

<th class="pa-head-bad">
N→UW
</th>

<th class="pa-head-bad">
N→OW
</th>

<th class="pa-head-good">
OW→N
</th>

<th class="pa-head-bad">
OW→OB
</th>

<th class="pa-head-good">
OB→OW
</th>

<th class="pa-head-progress">
Prog..
</th>


</tr>

<tr>

<td
class="pa-unit-name"
onclick="togglePADetails('${unit.Unit}')"
style="cursor:pointer;"
>
${unit.Unit}
</td>

<td>

${unit["UW→N"]}

<span
class="pa-expand pa-head-good"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'UW→N'
);
">

▼

</span>

</td>

<td>

${unit["N→UW"]}

<span
class="pa-expand pa-head-bad"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'N→UW'
);
">

▼

</span>

</td>

<td>

${unit["N→OW"]}

<span
class="pa-expand pa-head-bad"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'N→OW'
);
">

▼

</span>

</td>

<td>

${unit["OW→N"]}

<span
class="pa-expand pa-head-good"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'OW→N'
);
">

▼

</span>

</td>

<td>

${unit["OW→OB"]}

<span
class="pa-expand pa-head-bad"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'OW→OB'
);
">

▼

</span>

</td>
<td>

${unit["OB→OW"]}

<span
class="pa-expand pa-head-good"
onclick="
event.stopPropagation();
togglePATransitionDetails(
'${unit.Unit}',
'OB→OW'
);
">

▼

</span>

</td>

<td class="pa-progress">

${unit.Progress}

<span
class="pa-expand"
style="cursor:pointer;"
onclick="
event.stopPropagation();
togglePACategorySummary(
'${unit.Unit}'
);
">

▼

</span>

</td>

</tr>

</table>

<div
id="detail-${safeUnit}"
class="pa-details">

</div>

</div>

`;

});

document
.getElementById("paTableContainer")
.innerHTML=html;

document
.getElementById("paTableContainer")
.dataset.paMode = paViewMode;

}
function togglePADetails(unit){

const safeUnit =
unit.replace(/\s+/g,"_");

const div =
document.getElementById(
"detail-"+safeUnit
);

if(!div) return;

if(div.style.display==="block"){

div.style.display="none";

return;

}

div.style.display="block";

if(div.innerHTML.trim().length>0)
return;


/* ODISHA SECTOR SHOWS ALL */

let rows;
const sourceDetails =
paViewMode === "month"
?
paMonthDetailsData
:
paDetailsData;

const isOdisha =
String(unit)
.trim()
.toUpperCase()
===
"ODISHA SECTOR";

if(isOdisha){

rows = sourceDetails;

}else{
rows =
sourceDetails.filter(
x =>
String(x.Unit).trim().toUpperCase()
===
String(unit).trim().toUpperCase()
);

}
let html=`

<div class="pa-detail-wrap">

<table class="pa-detailTable pa-transitionArrowTable">
<th>Prev Cat</th>
<th>Curr Wt</th>
<th>Curr BMI</th>
<th>Curr Cat</th>
<th>Transition</th>
<th>Progress</th>

</tr>

`;

rows.forEach((r,index)=>{

let cls="";

if(
r.Transition==="UW→N" ||
r.Transition==="OW→N" ||
r.Transition==="OB→OW"
){
cls="pa-good";
}

if(
r.Transition==="N→UW" ||
r.Transition==="N→OW" ||
r.Transition==="OW→OB"
){
cls="pa-bad";
}

html += `

<tr class="${cls}">

<td>${index+1}</td>

<td>${r["Force No"]}</td>

<td>${r.Name}</td>

<td>${fmt2(r["Prev Weight"])}</td>

<td>${r["Prev BMI"]}</td>

<td>${r["Prev Cat"]}</td>

<td>${fmt2(r["Curr Weight"])}</td>

<td>${r["Curr BMI"]}</td>

<td>${r["Curr Cat"]}</td>

<td><b>${r.Transition}</b></td>

<td>${r.Progress}</td>

</tr>

`;

});

html += "</table></div>";

div.innerHTML=html;
}



function togglePACategorySummary(unit) {

    //==========================================
    // Decide Week / Month Mode
    //==========================================
    const isMonth = document.getElementById("paMonthRadio").checked;

    //==========================================
    // Category Summary Data
    //==========================================
    const categoryData = isMonth
        ? paMonthCategorySummaryData
        : paCategorySummaryData;

    //==========================================
    // Filter Selected Unit
    //==========================================
    const categoryRows = categoryData.filter(
        row => String(row.Unit).trim().toUpperCase() ===
               String(unit).trim().toUpperCase()
    );

    if (categoryRows.length < 2) {
        alert("Category summary not available.");
        return;
    }

    const previous = categoryRows[0];
    const current = categoryRows[1];

    const periodColumn = isMonth ? "Month" : "Week";

    const previousLabel = previous[periodColumn];
    const currentLabel = current[periodColumn];
//==========================================
// Colour Logic
//==========================================

const prevUW = Number(previous.UW || 0);
const currUW = Number(current.UW || 0);

const prevNormal = Number(previous.Normal || 0);
const currNormal = Number(current.Normal || 0);

const prevOW = Number(previous.Overweight || 0);
const currOW = Number(current.Overweight || 0);

const prevOB = Number(previous.Obese || 0);
const currOB = Number(current.Obese || 0);

// Underweight
const uwColor =
    currUW > prevUW ? "#d32f2f" :
    currUW < prevUW ? "#2e7d32" :
    "black";

// Normal
const normalColor =
    currNormal > prevNormal ? "#2e7d32" :
    currNormal < prevNormal ? "#d32f2f" :
    "black";

// Overweight
const owColor =
    currOW > prevOW ? "#d32f2f" :
    currOW < prevOW ? "#2e7d32" :
    "black";

// Obese
const obColor =
    currOB > prevOB ? "#d32f2f" :
    currOB < prevOB ? "#2e7d32" :
    "black";
    //==========================================
    // Category Summary HTML
    //==========================================
    const categoryHTML = `
        <div class="pa-category-summary">

            <h3
style="
margin-bottom:12px;
font-size:2em;
font-weight:900;
text-align:center;
letter-spacing:1px;
text-transform:uppercase;
color:#0b2d5c;
">

CATEGORY SUMMARY

</h3>

            <table
class="pa-category-table"
style="
font-size:30px;
font-weight:bold;
">

                <thead>

    <tr
        style="
            background:#d99694;
            color:#000;
            font-weight:bold;
            text-align:center;
        ">

        <th>Week</th>
        <th>UW</th>
        <th>Normal</th>
        <th>Overweight</th>
        <th>Obese</th>
        <th>Total</th>

    </tr>

</thead>

                <tbody>

                    <tr
        style="
            background:#92c5de;
        ">

        <td><b>${previousLabel}</b></td>

        <td>${previous.UW}</td>

        <td>${previous.Normal}</td>

        <td>${previous.Overweight}</td>

        <td>${previous.Obese}</td>

        <td>${previous.Total}</td>

    </tr>

                    <tr style="background:#fff600;">

    <td>${currentLabel}</td>

    <td style="color:${uwColor};font-weight:bold;">
        ${current.UW}
    </td>

    <td style="color:${normalColor};font-weight:bold;">
        ${current.Normal}
    </td>

    <td style="color:${owColor};font-weight:bold;">
        ${current.Overweight}
    </td>

    <td style="color:${obColor};font-weight:bold;">
        ${current.Obese}
    </td>

    <td style="font-weight:bold;">
        ${current.Total}
    </td>

</tr>

                </tbody>

            </table>

        </div>
    `;

    //==========================================
    // Detail Container
    //==========================================
    const safeUnit = unit.replace(/\s+/g, "_");

    const div = document.getElementById("detail-" + safeUnit);

    if (!div) {
        return;
    }

    div.style.display = "block";

    div.innerHTML = `
        ${categoryHTML}

        <div
            id="transitionSummary-${safeUnit}"
            class="pa-transition-summary">
        </div>
    `;

    //==========================================
    // Transition Summary
    //==========================================
    const transitionContainer =
        document.getElementById("transitionSummary-" + safeUnit);

    if (!transitionContainer) {
        return;
    }

    const summaryData = isMonth
        ? paMonthSummaryData
        : paSummaryData;

    const rows = summaryData.filter(r =>
        String(r.Unit).trim().toUpperCase() ===
        String(unit).trim().toUpperCase()
    );

    let html = `
        <table
class="pa-summaryTable"
style="
font-size:30px;
font-weight:bold;
">

            <thead>
                <tr>
                    <th>UW→N</th>
                    <th>N→UW</th>
                    <th>N→OW</th>
                    <th>OW→N</th>
                    <th>OW→OB</th>
                    <th>OB→OW</th>
                    <th>Progress</th>
                </tr>
            </thead>

            <tbody>
    `;

    rows.forEach(r => {

        html += `
            <tr>

                <td>${r["UW→N"] || 0}</td>
                <td>${r["N→UW"] || 0}</td>
                <td>${r["N→OW"] || 0}</td>
                <td>${r["OW→N"] || 0}</td>
                <td>${r["OW→OB"] || 0}</td>
                <td>${r["OB→OW"] || 0}</td>

                <td
                    class="pa-progress-click"
                    onclick="togglePATransitionSummary('${unit}','${r.Unit || unit}')">

                    ▼ ${r.Progress || 0}

                </td>

            </tr>
        `;

    });

    html += `
            </tbody>

        </table>
    `;

    transitionContainer.innerHTML = html;

    //==========================================
    // Debug
    //==========================================
    console.log("================================");
    console.log("Category Summary");
    console.log("Unit :", unit);
    console.log("Mode :", isMonth ? "MONTH" : "WEEK");
    console.log(categoryRows);
    console.log("================================");

}


//==========================================
// Transition Summary
//==========================================

function togglePATransitionSummary(unit){

    const safeUnit =
        unit.replace(/\s+/g,"_");

    const container =
        document.getElementById(
            "transitionSummary-" + safeUnit
        );

    if(!container){
        return;
    }

    // Toggle
    if(container.innerHTML.trim() !== ""){

        container.innerHTML = "";

        return;

    }

    //==========================================
    // Week / Month
    //==========================================

    const sourceSummary =
        paViewMode === "month"
        ? paMonthSummaryData
        : paSummaryData;

    //==========================================
    // Selected Unit
    //==========================================

    const row =
        sourceSummary.find(r =>

            String(r.Unit)
            .trim()
            .toUpperCase()

            ===

            String(unit)
            .trim()
            .toUpperCase()

        );

    if(!row){

        container.innerHTML =
        "<div style='padding:10px;'>No transition summary found.</div>";

        return;

    }

    //==========================================
    // Transition Table
    //==========================================

    let html = `

    <div class="pa-transition-wrap">

    <table class="pa-summaryTable">

    <thead>

    <tr>

    <th>Transition</th>

    <th>Total</th>

    </tr>

    </thead>

    <tbody>

    `;

    const transitions = [

        "UW→N",

        "N→UW",

        "N→OW",

        "OW→N",

        "OW→OB",

        "OB→OW"

    ];

    transitions.forEach(t=>{

        html += `

        <tr>

        <td>

        ${t}

        <span
        class="pa-expand"
        style="cursor:pointer;"
        onclick="
        event.stopPropagation();
        togglePATransitionDetails(
        '${unit}',
        '${t}'
        );
        ">

        ▼

        </span>

        </td>

        <td>

        ${row[t] || 0}

        </td>

        </tr>

        `;

    });

    html += `

    <tr>

    <td>

    <b>Progress</b>

    </td>

    <td>

    <b>${row.Progress || 0}</b>

    </td>

    </tr>

    </tbody>

    </table>

    </div>

    `;

    container.innerHTML = html;

}




function togglePATransitionDetails(unit,transition){

const safeId =
(unit + "_" + transition)
.replace(/\s+/g,"_")
.replace(/→/g,"TO");

let div =
document.getElementById(
"detail-"+safeId
);

if(!div){

const parentCard =
document
.getElementById(
"detail-"+unit.replace(/\s+/g,"_")
)
.parentElement;

div =
document.createElement("div");

div.id =
"detail-"+safeId;

div.className =
"pa-details";

parentCard.appendChild(div);

}

if(div.style.display==="block"){

div.style.display="none";

return;

}

div.style.display="block";

/* WEEK / MONTH SWITCH */

const sourceDetails =
paViewMode === "month"
?
paMonthDetailsData
:
paDetailsData;

const rows =
sourceDetails.filter(r => {

const transitionMatch =
String(r.Transition)
.trim()
===
transition;

if(
String(unit)
.trim()
.toUpperCase()
===
"ODISHA SECTOR"
){

return transitionMatch;

}

const unitMatch =
String(r.Unit)
.trim()
.toUpperCase()
===
String(unit)
.trim()
.toUpperCase();

return unitMatch && transitionMatch;

});
const isOdisha =
String(unit)
.trim()
.toUpperCase()
===
"ODISHA SECTOR";

let bgClass = "";

if(
transition==="UW→N" ||
transition==="OW→N" ||
transition==="OB→OW"
){
bgClass = "pa-good-bg";
}

if(
transition==="N→UW" ||
transition==="N→OW" ||
transition==="OW→OB"
){
bgClass = "pa-bad-bg";
}
const isMonth =
paViewMode === "month";

let html = `

<div class="pa-detail-wrap ${bgClass}">

<h3
style="
font-size:30px;
font-weight:bold;
">
${unit}
&nbsp;→&nbsp;
${transition}
</h3>

<table class="pa-detailTable pa-transitionArrowTable">

<tr>

<th>Sl</th>

${isOdisha ? "<th>Unit/Office</th>" : ""}

<th>Force No</th>
<th>Name</th>

${isMonth ? "<th>Prev Month</th>" : ""}

<th>Prev Wt</th>
<th>Prev BMI</th>
<th>Prev Cat</th>

${isMonth ? "<th>Curr Month</th>" : ""}

<th>Curr Wt</th>
<th>Curr BMI</th>
<th>Curr Cat</th>
</tr>

`;

rows.forEach((r,index)=>{

html += `

<tr>

<td>${index+1}</td>

${isOdisha ? `<td>${r.Unit}</td>` : ""}

<td>${r["Force No"]}</td>

<td>${r.Name}</td>

${isMonth ? `<td>${r["Prev Month"]}</td>` : ""}

<td>${fmt2(r["Prev Weight"])}</td>

<td>${r["Prev BMI"]}</td>

<td>${r["Prev Cat"]}</td>

${isMonth ? `<td>${r["Curr Month"]}</td>` : ""}

<td>${fmt2(r["Curr Weight"])}</td>

<td>${r["Curr BMI"]}</td>

<td>${r["Curr Cat"]}</td>

</tr>

`;

});

html += "</table></div>";

div.innerHTML = html;

}

/* ==========================================
   SHARE PA REPORT (header share button)
   ==========================================
   Generates a real multi-page PDF of whatever is
   currently selected/expanded in the PA popup
   (whichever unit cards are open, current Week/Month
   mode), using the same html2canvas + jsPDF approach
   already used for the leaderboard PDF download.

   The duplicate "Transition" table that used to appear
   a second time just below the Category Summary table
   is stripped out before capturing, since the same
   transition numbers already appear at the top of each
   unit's card.
   ========================================== */
// ✅ Slices a tall canvas into exact, pixel-accurate chunks across PDF
// pages — no repositioning math, no accumulated rounding, so a table
// row can never end up overlapping/repeating between two pages the
// way the old "shift the same image by a calculated offset" approach
// could drift into after several page breaks. Returns the Y position
// (mm) on the last page used, so the caller can keep packing more
// content right after it instead of always jumping to a fresh page.
function addTallImagePaginated(doc, canvas, imgWidthMm, startY, pageHeight, margin){

    const pxPerMm = canvas.width / imgWidthMm;

    let srcYpx = 0;
    let currentY = startY;
    let firstSlice = true;

    while (srcYpx < canvas.height) {

        const availableMm = firstSlice
            ? (pageHeight - margin - currentY)
            : (pageHeight - margin * 2);

        const availablePx = Math.floor(availableMm * pxPerMm);
        const sliceHeightPx = Math.min(availablePx, canvas.height - srcYpx);

        if (sliceHeightPx <= 0) {
            // No room left on this page at all — start a fresh one
            // and retry this same chunk from the top.
            doc.addPage();
            currentY = margin;
            firstSlice = true;
            continue;
        }

        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceHeightPx;

        sliceCanvas.getContext("2d").drawImage(
            canvas,
            0, srcYpx, canvas.width, sliceHeightPx,
            0, 0, canvas.width, sliceHeightPx
        );

        const sliceHeightMm = sliceHeightPx / pxPerMm;
        const y = firstSlice ? currentY : margin;

        doc.addImage(sliceCanvas.toDataURL("image/png"), "PNG", margin, y, imgWidthMm, sliceHeightMm);

        srcYpx += sliceHeightPx;

        if (srcYpx < canvas.height) {
            doc.addPage();
            currentY = margin;
            firstSlice = false;
        } else {
            return y + sliceHeightMm;
        }
    }

    return margin;
}

async function sharePAModalReport(){

    const container = document.getElementById("paTableContainer");

    if (!container || container.innerHTML.trim() === "") {
        alert("Nothing to share yet — please wait for the PA table to load.");
        return;
    }

    const shareBtn = document.getElementById("paHeaderShareBtn");
    if (shareBtn) shareBtn.disabled = true;

    let wrapper = null;

    try {

        const modeLabel = paViewMode === "month" ? "Monthly" : "Weekly";
        const dateStamp = new Date().toLocaleDateString("en-GB");

        // ✅ FIX for "Invalid string length": capturing the ENTIRE PA
        // table (every expanded unit + every expanded transition
        // table) as ONE giant image could produce a base64 string too
        // large for jsPDF to handle, crashing with that error — this
        // got worse once we expanded tables to their full width to
        // fix the earlier "columns missing" bug. The fix here is to
        // capture ONE unit card at a time, each on its own PDF
        // page(s) — every individual image stays small and reliable
        // no matter how much data is expanded across the whole popup.

        const fullClone = container.cloneNode(true);
        fullClone.querySelectorAll(".pa-transition-summary").forEach(el => el.remove());
        fullClone.querySelectorAll(".pa-expand").forEach(el => el.remove());

        let cards = Array.from(fullClone.querySelectorAll(".pa-unit-card"));
        if (cards.length === 0) cards = [fullClone];

        // A generous but BOUNDED capture width (not unlimited
        // "max-content") — wide enough that no column gets clipped,
        // but capped so text wraps instead of the canvas growing
        // without limit.
        const CAPTURE_WIDTH = 1800;

        cards.forEach(card => {
            card.querySelectorAll(".pa-details, .pa-detail-wrap").forEach(el => {
                el.style.overflow = "visible";
                el.style.overflowX = "visible";
                el.style.width = "100%";
                el.style.maxWidth = "none";
            });
            card.querySelectorAll("table").forEach(t => {
                t.style.width = "100%";
                t.style.maxWidth = "none";
            });
        });

        wrapper = document.createElement("div");
        wrapper.style.position = "fixed";
        wrapper.style.left = "-99999px";
        wrapper.style.top = "0";
        wrapper.style.width = CAPTURE_WIDTH + "px";
        wrapper.style.background = "#ffffff";
        wrapper.style.padding = "16px";
        wrapper.style.fontFamily = "Arial, Helvetica, sans-serif";
        document.body.appendChild(wrapper);

        const { jsPDF } = window.jspdf;

        // Landscape — these tables are naturally wide (many columns).
        const doc = new jsPDF("l", "mm", "a4");

        const pageWidth = 297;
        const pageHeight = 210;
        const margin = 8;
        const imgWidth = pageWidth - margin * 2;

        // ---- Title / heading, captured on its own first ----
        const heading = document.createElement("h2");
        heading.textContent = `PA (Punish or Appreciate) Report — ${modeLabel} — ${dateStamp}`;
        heading.style.textAlign = "center";
        heading.style.color = "#0b2d5c";
        heading.style.margin = "0";
        wrapper.appendChild(heading);

        const headingCanvas = await html2canvas(wrapper, { scale: 1.5 });
        wrapper.removeChild(heading);

        const headingImgHeight = headingCanvas.height * imgWidth / headingCanvas.width;
        doc.addImage(headingCanvas.toDataURL("image/png"), "PNG", margin, margin, imgWidth, headingImgHeight);

        // ✅ FIX: cards used to each force their own new page
        // (doc.addPage() before every single one), so a short card
        // left the rest of that page blank instead of flowing into
        // the next one — this is what caused the big gaps you saw.
        // Now we track a running cursorY and only start a new page
        // when the next card genuinely doesn't fit in the remaining
        // space, so cards pack continuously like a normal document.
        let cursorY = margin + headingImgHeight + 6;
        const cardGap = 6;

        for (let i = 0; i < cards.length; i++) {

            wrapper.appendChild(cards[i]);

            const canvas = await html2canvas(wrapper, { scale: 1.5 });

            wrapper.removeChild(cards[i]);

            const cardImgHeight = canvas.height * imgWidth / canvas.width;

            if (cardImgHeight > pageHeight - margin * 2) {

                // ✅ FIX: precise pixel-cropped slicing (see
                // addTallImagePaginated above) replaces the old
                // "reposition the same full image by a calculated
                // offset" math, which could accumulate tiny rounding
                // drift over several page breaks — enough, after a
                // few pages, to overlap a row's height and make it
                // look like a row repeated at the top of the next
                // page. Cropping exact pixel ranges makes that
                // impossible: every page gets a distinct, non-
                // overlapping slice of the source image. It also
                // never needs to base64-encode the FULL oversized
                // canvas at once (only small per-page crops) — keeping
                // this consistent with the earlier "Invalid string
                // length" fix.
                cursorY = addTallImagePaginated(doc, canvas, imgWidth, cursorY, pageHeight, margin) + cardGap;
                continue;
            }

            // Not enough room left on the current page — start a new one.
            if (cursorY + cardImgHeight > pageHeight - margin) {
                doc.addPage();
                cursorY = margin;
            }

            doc.addImage(canvas.toDataURL("image/png"), "PNG", margin, cursorY, imgWidth, cardImgHeight);
            cursorY += cardImgHeight + cardGap;
        }

        document.body.removeChild(wrapper);
        wrapper = null;

        const fileName = `PA_Report_${modeLabel}_${new Date().toISOString().slice(0,10)}.pdf`;
        const pdfBlob = doc.output("blob");

        try {

            const file = new File([pdfBlob], fileName, { type: "application/pdf" });

            if (navigator.canShare && navigator.canShare({ files: [file] })) {

                await navigator.share({
                    files: [file],
                    title: `PA Report - ${modeLabel}`,
                    text: `PA (Punish or Appreciate) ${modeLabel.toLowerCase()} report`
                });

                return;
            }

        } catch (shareErr) {
            console.log("Share cancelled/unavailable:", shareErr);
        }

        doc.save(fileName);

    } catch (err) {

        if (wrapper && wrapper.parentNode) document.body.removeChild(wrapper);

        console.error("Error preparing PA report PDF:", err);
        alert("Something went wrong while preparing the PDF report: " + (err && err.message ? err.message : err));

    } finally {

        if (shareBtn) shareBtn.disabled = false;
    }
}



function showPAMonth(){

paViewMode = "month";

renderPATables();

}

function showPAWeek(){

paViewMode = "week";

renderPATables();

}
function closePAModal(){

    document
    .getElementById("paModal")
    .style.display = "none";

    const btn =
    document
    .getElementById("paMiniBtn");

    if(btn){
        btn.classList.remove("pa-active");
    }

}

function togglePAButton(event){

    if(event){
        event.stopPropagation();
    }

    const btn =
    document.getElementById(
    "paMiniBtn"
    );

    btn.classList.add(
    "pa-active"
    );

    openPAModal();

}
async function openPAModal(){

    // ✅ SPEED PERCEPTION FIX: open the popup immediately instead of
    // waiting for the (sometimes slow) data fetch to finish first.
    // If the data isn't cached yet, show a lightweight loading message
    // inside the popup so it never looks "stuck"/frozen while loading.
    const modal = document.getElementById("paModal");
    const container = document.getElementById("paTableContainer");

    modal.style.display = "block";

    if (!paDataLoaded && container) {
        container.innerHTML =
            '<p style="text-align:center;font-size:22px;padding:40px 10px;">Loading PA data…</p>';
    }

    await fetchPAData();

    renderPATables();

}
