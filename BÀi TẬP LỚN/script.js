const $ = id => document.getElementById(id);
const DAY = 864e5;
const fmt = t => new Date(t).toISOString().slice(0, 10);
const WD = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const nf = v => Math.round(v).toLocaleString("vi-VN");

let Y = [];
let D = [];
let chart;

// ---------- Dữ liệu ----------
function demo() {
  let s = 42;
  const r = () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const n = 400;
  const e = new Date();
  const end = Date.UTC(e.getFullYear(), e.getMonth(), e.getDate());
  const wk = [0.75, 1.05, 1.1, 1.1, 1.05, 0.95, 0.8];
  Y = [];
  D = [];
  for (let i = 0; i < n; i++) {
    const t = end - (n - 1 - i) * DAY;
    const w = new Date(t).getUTCDay();
    let v = (800 + 1.2 * i) * wk[w] * (1 + 0.15 * Math.sin(2 * Math.PI * i / 365)) + (r() - 0.5) * 120;
    if (r() < 0.02) v *= 1.5;
    D.push(t);
    Y.push(Math.round(v));
  }
  run();
}

// Lấy số liệu theo dõi thật từ server (node server.js)
async function loadReal() {
  try {
    const res = await fetch("/api/daily");
    const rows = await res.json();
    D = rows.map(x => Date.parse(x[0]));
    Y = rows.map(x => x[1]);
    if (Y.length === 0) {
      $("info").textContent = "Server chưa có dữ liệu. Hãy mở website đã gắn tracker.js hoặc bấm Nạp dữ liệu thử.";
      return;
    }
    run();
  } catch (err) {
    $("info").textContent = "Không kết nối được server. Hãy chạy: node server.js rồi mở http://localhost:3000";
  }
}

// Số người đang online và tổng lượt vào hôm nay
async function pollLive() {
  try {
    const res = await fetch("/api/live");
    const r = await res.json();
    $("on").textContent = r.online;
    $("td").textContent = r.today;
  } catch (err) {
    // bỏ qua khi chưa có server
  }
}

// ---------- Mô hình 1: Linear Regression ----------
function feat(i, d) {
  const w = new Date(d).getUTCDay();
  const f = [1, i / 100];
  for (let k = 1; k < 7; k++) {
    f.push(w === k ? 1 : 0);
  }
  f.push(Math.sin(2 * Math.PI * i / 365.25));
  f.push(Math.cos(2 * Math.PI * i / 365.25));
  return f;
}

function solve(A, b) {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    let p = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
    }
    const tmpRow = A[i];
    A[i] = A[p];
    A[p] = tmpRow;
    const tmpVal = b[i];
    b[i] = b[p];
    b[p] = tmpVal;
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) {
        A[r][c] -= f * A[i][c];
      }
      b[r] -= f * b[i];
    }
  }
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i];
    for (let c = i + 1; c < n; c++) {
      s -= A[i][c] * x[c];
    }
    x[i] = s / A[i][i];
  }
  return x;
}

function lr(y, d, fd) {
  const X = y.map((_, i) => feat(i, d[i]));
  const p = X[0].length;
  const A = [];
  const b = [];
  for (let i = 0; i < p; i++) {
    const row = [];
    for (let j = 0; j < p; j++) {
      let s = 0;
      for (let k = 0; k < X.length; k++) s += X[k][i] * X[k][j];
      if (i === j) s += 0.001;
      row.push(s);
    }
    A.push(row);
    let t = 0;
    for (let k = 0; k < X.length; k++) t += X[k][i] * y[k];
    b.push(t);
  }
  const w = solve(A, b);
  return fd.map((t, k) => {
    const f = feat(y.length + k, t);
    let s = 0;
    for (let j = 0; j < f.length; j++) s += f[j] * w[j];
    return s;
  });
}

// ---------- Mô hình 2: Holt-Winters ----------
function sum(x) {
  return x.reduce((s, v) => s + v, 0);
}

function hwRun(y, a, b, g, h) {
  const m = 7;
  const n = y.length;
  let L = sum(y.slice(0, m)) / m;
  let T = (sum(y.slice(m, 2 * m)) / m - L) / m;
  const S = y.slice(0, m).map(v => v - L);
  let sse = 0;
  for (let i = m; i < n; i++) {
    const s = S[i % m];
    const e = y[i] - (L + T + s);
    sse += e * e;
    const L0 = L;
    L = a * (y[i] - s) + (1 - a) * (L + T);
    T = b * (L - L0) + (1 - b) * T;
    S[i % m] = g * (y[i] - L) + (1 - g) * s;
  }
  const fc = [];
  for (let k = 1; k <= h; k++) {
    fc.push(L + k * T + S[(n - 1 + k) % m]);
  }
  return { sse: sse, fc: fc };
}

function hw(y, d, fd) {
  let best = null;
  for (const a of [0.1, 0.3, 0.5, 0.7]) {
    for (const b of [0.01, 0.05, 0.1]) {
      for (const g of [0.1, 0.3, 0.5]) {
        const r = hwRun(y, a, b, g, 0);
        if (best === null || r.sse < best.sse) {
          best = { sse: r.sse, a: a, b: b, g: g };
        }
      }
    }
  }
  return hwRun(y, best.a, best.b, best.g, fd.length).fc;
}

// ---------- Danh sách mô hình ----------
const M = {
  "Seasonal Naive": (y, d, f) => f.map((_, k) => y[y.length - 7 + (k % 7)]),
  "Moving Average (7)": (y, d, f) => {
    const m = sum(y.slice(-7)) / 7;
    return f.map(() => m);
  },
  "Linear Regression": lr,
  "Holt-Winters": hw
};

// ---------- Chạy, đánh giá, hiển thị ----------
function run() {
  const h = +$("h").value;
  const tn = +$("tn").value;
  const n = Y.length;

  if (n === 0) return;
  $("info").textContent = `${n} ngày dữ liệu, từ ${fmt(D[0])} đến ${fmt(D[n - 1])}.`;

  if (n < tn + 21) {
    $("info").textContent = `Cần ít nhất ${tn + 21} ngày dữ liệu (hiện có ${n} ngày). Bấm Nạp dữ liệu thử hoặc chọn tập kiểm tra ngắn hơn.`;
    return;
  }

  const tr = Y.slice(0, n - tn);
  const trd = D.slice(0, n - tn);
  const te = Y.slice(n - tn);
  const ted = D.slice(n - tn);
  const fut = Array.from({ length: h }, (_, k) => D[n - 1] + (k + 1) * DAY);
  const res = [];
  const clip = a => a.map(v => Math.max(0, v));

  for (const name of Object.keys(M)) {
    const f = M[name];
    const p = clip(f(tr, trd, ted));
    const e = p.map((v, i) => v - te[i]);
    let sAbs = 0;
    let sSq = 0;
    let sPct = 0;
    for (let i = 0; i < tn; i++) {
      sAbs += Math.abs(e[i]);
      sSq += e[i] * e[i];
      sPct += Math.abs(e[i]) / Math.max(1, te[i]);
    }
    res.push({
      name: name,
      p: p,
      mae: sAbs / tn,
      rmse: Math.sqrt(sSq / tn),
      mape: (sPct / tn) * 100,
      fc: clip(f(Y, D, fut))
    });
  }

  const best = res.reduce((a, b) => (a.rmse < b.rmse ? a : b));
  const tot = sum(best.fc);

  // Thẻ tổng quan
  $("k").innerHTML = `
    <div><b>${nf(tot)}</b><span>Tổng lượt truy cập dự báo ${h} ngày tới</span></div>
    <div><b>${nf(tot / h)}</b><span>Trung bình mỗi ngày</span></div>
    <div><b>${best.name}</b><span>Mô hình tốt nhất</span></div>
    <div><b>${best.mape.toFixed(1)}%</b><span>MAPE trên tập kiểm tra</span></div>
  `;

  // Bảng sai số
  let rowsM = "";
  for (const r of res) {
    const cls = r === best ? "b" : "";
    rowsM += `<tr class="${cls}"><td>${r.name}</td><td>${nf(r.mae)}</td><td>${nf(r.rmse)}</td><td>${r.mape.toFixed(2)}%</td></tr>`;
  }
  $("m").innerHTML = `<tr><th>Mô hình</th><th>MAE</th><th>RMSE</th><th>MAPE</th></tr>${rowsM}`;

  // Bảng dự báo
  let rowsT = "";
  fut.forEach((t, k) => {
    rowsT += `<tr><td>${fmt(t)}</td><td>${WD[new Date(t).getUTCDay()]}</td><td>${nf(best.fc[k])}</td></tr>`;
  });
  $("t").innerHTML = `<tr><th>Ngày</th><th>Thứ</th><th>Dự báo</th></tr>${rowsT}`;

  drawChart(res, best, tn, h, fut);
}

function drawChart(res, best, tn, h, fut) {
  const n = Y.length;
  const st = Math.max(0, n - 120);
  const L = n - st;
  const pad = k => Array(k).fill(null);
  const lab = D.slice(st).concat(fut).map(fmt);
  const cols = ["#e0a030", "#8a7bd8", "#e0604f", "#2fb58a"];
  const cs = getComputedStyle(document.documentElement);
  const fg = cs.getPropertyValue("--fg").trim();
  const gr = cs.getPropertyValue("--bd").trim();

  const ds = [];
  ds.push({
    label: "Thực tế",
    data: Y.slice(st).concat(pad(h)),
    borderColor: fg,
    borderWidth: 1.5,
    pointRadius: 0
  });

  res.forEach((r, i) => {
    ds.push({
      label: r.name + " (kiểm tra)",
      data: [...pad(n - tn - st), ...r.p, ...pad(h)],
      borderColor: cols[i],
      borderWidth: 1.5,
      pointRadius: 0,
      hidden: r !== best
    });
  });

  ds.push({
    label: "Dự báo: " + best.name,
    data: [...pad(L - 1), Y[n - 1], ...best.fc],
    borderColor: "#2aa7b3",
    borderWidth: 2.5,
    borderDash: [6, 4],
    pointRadius: 0
  });

  if (chart) chart.destroy();
  chart = new Chart($("ch"), {
    type: "line",
    data: { labels: lab, datasets: ds },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: fg } } },
      scales: {
        x: { ticks: { color: fg, maxTicksLimit: 8 }, grid: { color: gr } },
        y: {
          ticks: { color: fg },
          grid: { color: gr },
          title: { display: true, text: "Lượt truy cập mỗi ngày", color: fg }
        }
      }
    }
  });
}

// ---------- Sự kiện ----------
$("demo").onclick = demo;
$("real").onclick = loadReal;
$("seed").onclick = async () => {
  try {
    await fetch("/api/seed");
    loadReal();
  } catch (err) {
    $("info").textContent = "Không kết nối được server. Hãy chạy: node server.js rồi mở http://localhost:3000";
  }
};
$("h").onchange = run;
$("tn").onchange = run;

setInterval(pollLive, 5000);
pollLive();
demo();