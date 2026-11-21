const http = require("http"), fs = require("fs"), path = require("path");
const PORT = 3000, FILE = path.join(__dirname, "data.json");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8" };

let daily = {};                       // { "2026-11-18": 123, ... }
try { daily = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch {}
let dirty = false;
const online = new Map();             // mã khách -> lần cuối thấy

const today = (t = Date.now()) => new Date(t).toLocaleDateString("en-CA", { timeZone: "Asia/Ho_Chi_Minh" });

setInterval(() => {
  if (dirty) { fs.writeFileSync(FILE, JSON.stringify(daily)); dirty = false; }
}, 5000);

function send(res, code, body, type = "application/json") {
  res.writeHead(code, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "*"
  });
  res.end(Buffer.isBuffer(body) || typeof body === "string" ? body : JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (req.method === "OPTIONS") return send(res, 204, "");

  // Nhận lượt truy cập từ website được theo dõi
  if (url.pathname === "/track") {
    let b = "";
    req.on("data", c => (b += c));
    req.on("end", () => {
      let m = {};
      try { m = JSON.parse(b); } catch {}
      online.set(m.vid || "anon", Date.now());
      if (m.type === "view") {
        const d = today();
        daily[d] = (daily[d] || 0) + 1;
        dirty = true;
      }
      send(res, 204, "");
    });
    return;
  }

  // Số liệu theo ngày (điền 0 cho ngày không có ai vào)
  if (url.pathname === "/api/daily") {
    const keys = Object.keys(daily).sort();
    if (!keys.length) return send(res, 200, []);
    const out = [];
    for (let t = Date.parse(keys[0]); t <= Date.parse(today()); t += 864e5) {
      const d = new Date(t).toISOString().slice(0, 10);
      out.push([d, daily[d] || 0]);
    }
    return send(res, 200, out);
  }

  // Người đang online (hoạt động trong 60 giây gần nhất) và tổng hôm nay
  if (url.pathname === "/api/live") {
    const now = Date.now();
    for (const [k, t] of online) if (now - t > 60000) online.delete(k);
    return send(res, 200, { online: online.size, today: daily[today()] || 0 });
  }

  // Nạp 120 ngày dữ liệu thử để chạy được mô hình ngay
  if (url.pathname === "/api/seed") {
    const wk = [.7, 1, 1.1, 1.1, 1.05, .95, .8];
    for (let i = 120; i >= 1; i--) {
      const t = Date.now() - i * 864e5, d = today(t), w = new Date(t).getDay();
      if (daily[d] === undefined)
        daily[d] = Math.round((300 + (120 - i) * 2) * wk[w] + Math.random() * 60);
    }
    dirty = true;
    return send(res, 200, { ok: true });
  }

  // File tĩnh của web dự báo
  const f = path.join(__dirname, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!f.startsWith(__dirname) || !MIME[path.extname(f)] || path.basename(f) === "server.js")
    return send(res, 404, "Not found", "text/plain");
  fs.readFile(f, (e, data) =>
    e ? send(res, 404, "Not found", "text/plain") : send(res, 200, data, MIME[path.extname(f)]));
}).listen(PORT, () => console.log("Chạy tại http://localhost:" + PORT));