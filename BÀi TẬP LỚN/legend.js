/* Chú thích biểu đồ dạng bảng nằm dưới biểu đồ + màu đường sáng trên nền đen.
   Nạp file này SAU Chart.js và TRƯỚC script.js. Không cần sửa script.js.
   Màu của đường và màu trong ô chú thích cùng lấy từ MỘT nguồn nên luôn khớp nhau. */
(function () {
  if (typeof Chart === 'undefined') return;

  // Tắt chú thích vẽ trong canvas (nguồn gốc của đường gạch ngang trên tên mô hình)
  Chart.defaults.plugins.legend.display = false;
  Chart.defaults.color = '#9fb0d0';
  Chart.defaults.borderColor = 'rgba(255, 255, 255, .08)';

  // Bảng màu: khóa là từ nhận diện trong tên đường (thứ tự quan trọng: "dự báo" kiểm tra trước)
  var PALETTE = [
    { key: 'dự báo',     color: '#22d3ee' }, // xanh ngọc
    { key: 'thực tế',    color: '#e6f0ff' }, // trắng xanh
    { key: 'seasonal',   color: '#fbbf24' }, // vàng
    { key: 'moving',     color: '#a78bfa' }, // tím
    { key: 'linear',     color: '#f472b6' }, // hồng
    { key: 'holt',       color: '#34d399' }  // xanh lá
  ];

  function colorFor(label) {
    var l = String(label || '').toLowerCase();
    for (var i = 0; i < PALETTE.length; i++) {
      if (l.indexOf(PALETTE[i].key) !== -1) return PALETTE[i].color;
    }
    return null;
  }

  Chart.register({
    id: 'tableLegend',

    // Đặt màu sáng cho từng đường trước khi vẽ
    beforeUpdate: function (chart) {
      chart.data.datasets.forEach(function (ds) {
        var c = colorFor(ds.label);
        if (!c) return;
        ds.borderColor = c;
        ds.backgroundColor = c + '33';
        ds.pointBackgroundColor = c;
        ds.pointBorderColor = c;
      });
      try {
        var sc = chart.options.scales || {};
        Object.keys(sc).forEach(function (k) {
          if (sc[k].grid) sc[k].grid.color = 'rgba(255, 255, 255, .08)';
          if (sc[k].ticks) sc[k].ticks.color = '#9fb0d0';
          if (sc[k].title) sc[k].title.color = '#9fb0d0';
        });
      } catch (e) { /* bỏ qua nếu cấu hình trục khác dự kiến */ }
    },

    // Dựng bảng chú thích dưới biểu đồ, lấy đúng màu đang dùng để vẽ đường
    afterUpdate: function (chart) {
      var wrap = chart.canvas.closest('.cv');
      if (!wrap) return;

      var box = wrap.nextElementSibling;
      if (!box || !box.classList.contains('lg')) {
        box = document.createElement('div');
        box.className = 'lg';
        wrap.after(box);
      }
      box.innerHTML = '';

      chart.data.datasets.forEach(function (ds, i) {
        var on = chart.isDatasetVisible(i);
        var color = typeof ds.borderColor === 'string' ? ds.borderColor : '#8db8ff';

        var item = document.createElement('div');
        item.className = 'lg-i' + (on ? '' : ' off');
        item.tabIndex = 0;
        item.setAttribute('role', 'button');
        item.setAttribute('aria-pressed', on ? 'true' : 'false');

        var sw = document.createElement('span');
        sw.className = 'lg-sw';
        sw.style.borderColor = color;
        sw.style.background = color + '40';
        if (ds.borderDash && ds.borderDash.length) sw.style.borderStyle = 'dashed';

        var t = document.createElement('span');
        t.className = 'lg-t';
        t.textContent = ds.label || ('Dữ liệu ' + (i + 1));

        var s = document.createElement('span');
        s.className = 'lg-s';
        s.textContent = on ? 'Đang hiện' : 'Đã ẩn';

        item.append(sw, t, s);

        var toggle = function () {
          chart.setDatasetVisibility(i, !chart.isDatasetVisible(i));
          chart.update();
        };
        item.addEventListener('click', toggle);
        item.addEventListener('keydown', function (e) {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
        });

        box.appendChild(item);
      });
    }
  });
})();