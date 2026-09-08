/**
 * KhoGiaLap.gs — kho đích trong bộ nhớ, cùng giao diện với vỏ Excel (`KhoTracking`) và vỏ Google Sheet (`KhoSheet`),
 * để chạy test mà KHÔNG đụng dữ liệu thật. Chạy được cả trong trình soạn Apps Script.
 */
function KhoGiaLap(sheets, mapping) {
  this.sheets = {};                       // tên sheet → ảnh chụp { ten, soDong, giaTri, congThuc, mang, dinhDang }
  var self = this;
  Object.keys(sheets || {}).forEach(function (ten) { self.themSheet(sheets[ten]); });
  this.mapping = mapping ? Utils.saoChepBang(mapping) : null;
  this.mappingDaGhi = null;
  this.mappingToVang = [];
  this.keHoachDaGhi = [];
  this.canhBaoDaGui = [];
  this.gopODaLam = [];
}

KhoGiaLap.prototype.themSheet = function (ss) {
  if (!ss.dinhDang) ss.dinhDang = [];
  if (!ss.toVang) ss.toVang = {};
  if (!ss.gop) ss.gop = [];
  this.sheets[ss.ten] = ss;
  return ss;
};

KhoGiaLap.prototype.thuKhoa = function () { return true; };
KhoGiaLap.prototype.moKhoa = function () { };

KhoGiaLap.prototype.docSheet = function (ten) {
  var s = this.sheets[ten];
  if (!s) return null;
  return { ten: s.ten, soDong: s.soDong, giaTri: Utils.saoChepBang(s.giaTri), congThuc: Utils.saoChepBang(s.congThuc), mang: Utils.saoChepBang(s.mang) };
};

KhoGiaLap.prototype.docMapping = function () { return this.mapping ? Utils.saoChepBang(this.mapping) : null; };

KhoGiaLap.prototype.ghiMapping = function (bang, dongToVang) {
  this.mapping = Utils.saoChepBang(bang);
  this.mappingDaGhi = Utils.saoChepBang(bang);
  this.mappingToVang = (dongToVang || []).slice();
};

KhoGiaLap.prototype.canhBao = function (tieuDe, noiDung) { this.canhBaoDaGui.push({ tieuDe: tieuDe, noiDung: noiDung }); };

function khoGiaLapDat(bang, r, c, v) {
  while (bang.length < r + 1) bang.push([]);
  var row = bang[r];
  while (row.length < c + 1) row.push(null);
  row[c] = v;
}

KhoGiaLap.prototype.ghiKeyIn = function (plan) {
  var s = this.sheets[plan.tenSheet];
  if (!s) throw new Error('KhoGiaLap: không có sheet ' + plan.tenSheet);
  plan.oGhi.forEach(function (o) {
    khoGiaLapDat(s.giaTri, o.r - 1, o.c - 1, o.gt);
    khoGiaLapDat(s.dinhDang, o.r - 1, o.c - 1, o.dinhDang);
  });
  plan.congThucKeo.forEach(function (o) {
    khoGiaLapDat(s.congThuc, o.r - 1, o.c - 1, o.text);
    khoGiaLapDat(s.mang, o.r - 1, o.c - 1, o.mang);
    khoGiaLapDat(s.giaTri, o.r - 1, o.c - 1, null);
  });
  var self = this;
  (plan.gopO || []).forEach(function (g) {
    s.gop.push(Utils.chuCot(g.c) + g.r1 + ':' + Utils.chuCot(g.c) + g.r2);
    self.gopODaLam.push({ sheet: plan.tenSheet, cot: Utils.chuCot(g.c), r1: g.r1, r2: g.r2 });
  });
  (plan.toVang || []).forEach(function (r) { s.toVang[r] = true; });
  (plan.ghiChu || []).forEach(function (g) { khoGiaLapDat(s.giaTri, g.r - 1, g.c - 1, g.text); });
  if (plan.tieuDeNote) khoGiaLapDat(s.giaTri, plan.tieuDeNote.r - 1, plan.tieuDeNote.c - 1, plan.tieuDeNote.text);
  if (plan.dongCuoiMoi > s.soDong) s.soDong = plan.dongCuoiMoi;
  this.keHoachDaGhi.push(plan);
};

// ---- tiện ích cho test ----
KhoGiaLap.prototype.o = function (ten, r, c) {
  var s = this.sheets[ten];
  return {
    gt: (s.giaTri[r - 1] || [])[c - 1] == null ? null : s.giaTri[r - 1][c - 1],
    congThuc: (s.congThuc[r - 1] || [])[c - 1] == null ? null : s.congThuc[r - 1][c - 1],
    mang: !!((s.mang[r - 1] || [])[c - 1]),
    dinhDang: (s.dinhDang[r - 1] || [])[c - 1] == null ? null : s.dinhDang[r - 1][c - 1]
  };
};
KhoGiaLap.prototype.dongVang = function (ten, r) { var s = this.sheets[ten]; return !!(s.toVang && s.toVang[r]); };
KhoGiaLap.prototype.cacVungGop = function (ten) { return (this.sheets[ten].gop || []).slice().sort(); };
KhoGiaLap.prototype.mappingDoiTuong = function () {
  if (!this.mapping) return [];
  var head = this.mapping[0].map(MapListing.tenCotChuan);
  return this.mapping.slice(1).map(function (r) { return Utils.mangSangDoiTuong(head, r); });
};
