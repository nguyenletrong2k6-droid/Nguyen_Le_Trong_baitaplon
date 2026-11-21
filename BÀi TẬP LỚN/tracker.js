(function () {
  const SERVER = "http://localhost:3000";   // khi đưa lên mạng thì đổi thành địa chỉ server của bạn
  let vid = localStorage.getItem("vid");
  if (!vid) {
    vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
    localStorage.setItem("vid", vid);
  }
  const send = type =>
    navigator.sendBeacon(SERVER + "/track", JSON.stringify({ type, vid, page: location.pathname }));

  send("view");                          // tính 1 lượt truy cập khi mở trang
  setInterval(() => send("ping"), 20000); // báo "còn đang ở trang" để đếm người online
})();