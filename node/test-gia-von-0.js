/**
 * test-gia-von-0.js — cảnh báo khi một dòng BÁN trừ tồn vào mã có GIÁ VỐN 0
 * (07_GIAO_VIEC_DEV_v2.6.md mục 0 và mục 3 việc số 6).
 *
 * Vì sao có bộ này: hàng bán và hàng tặng cùng loại để RIÊNG hai mã. Mã hàng tặng gần như luôn để giá vốn 0.
 * Một dòng bán trừ nhầm vào mã tặng thì giá vốn bằng 0 nên LÃI BỊ THỔI PHỒNG. Đơn vẫn ghi đủ, số vẫn đẹp,
 * chỉ có lãi là sai — lỗi tiền, và nó im lặng. Tool phải tô vàng cả dòng + ghi lý do vào cột Note.
 *
 * Chỗ dễ làm hỏng chính việc này: nhầm "giá vốn đúng bằng 0" với "không đọc được giá vốn".
 * Ô trống, ô lỗi, ô còn là công thức chưa tính đều KHÔNG phải giá vốn 0. Nhầm là tô vàng oan hàng loạt,
 * mà tô vàng oan thì nhân viên bỏ qua luôn cả những cảnh báo thật. Bộ này canh cả hai chiều.
 *
 * LUẬT ĐỐI CHỨNG ÂM (08_BA_TRA_LOI_DEV_v2.6.md mục 4): mỗi chỉ tiêu phải kèm một đối chứng âm — dựng ra
 * đúng cái sai mà nó phải bắt, rồi chứng minh nó báo LỆCH. Chỉ tiêu không có đối chứng âm coi như chưa có.
 * Ở đây "cái sai" được dựng bằng cách thay bộ đọc giá vốn bằng đúng bản sai đang muốn chống:
 *   · bản CŨ    — chưa bao giờ đọc cột giá vốn (hành vi trước hôm nay);
 *   · bản LỎNG  — đọc giá vốn y như cột tồn đang đọc (bỏ mọi ký tự không phải chữ số rồi Number());
 *   · bản CHỈ SỐ — chỉ nhận ô kiểu number, bỏ qua chuỗi hiển thị.
 *
 * Chạy: `node node/test-gia-von-0.js`. Thoát mã 1 nếu có chỉ tiêu hỏng.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { napLoi, SRC } = require('./nap-loi');
const { KhoTracking } = require('./kho-tracking');

const ROOT = path.join(__dirname, '..');
const DAU_VAO = path.join(ROOT, '..', '..', '00_DAU_VAO');
const FILE_THAT = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');

/** Số đo trên file thật, đo ngày 08/9/2026. Đây là mốc: đổi số là đổi tình trạng kho, phải xem lại. */
const MOC_FILE_THAT = { soMa: 76, giaVon0: 3, khongDocDuoc: 0, ma0: ['1578', '1617', '1626'] };

const lop = napLoi();
const COT_GIA_VON = 6;          // cột G, chỉ số 0-based trong bảng 2 chiều
const COT_TVT_DM = 3;           // cột D của `Tổng tồn kho`
const TEN_SHEET = 'Shopee mall';

function phai(dk, msg) { if (!dk) throw new Error(msg); }
function bang(a, b, msg) { if (a !== b) throw new Error(msg + ' (mong ' + JSON.stringify(b) + ', nhận ' + JSON.stringify(a) + ')'); }

/**
 * Dựng cái sai, rồi chứng minh chỉ tiêu báo LỆCH.
 * @param {string}   ten   tên bản sai đang dựng, để in ra cho người đọc biết đã đối chứng cái gì
 * @param {Function} kiem  chính phép chấm của chỉ tiêu — ném lỗi nghĩa là LỆCH
 */
function doiChungAm(ten, kiem) {
  let bat = null;
  try { kiem(); } catch (e) { bat = e && e.message ? e.message : String(e); }
  if (!bat) throw new Error('ĐỐI CHỨNG ÂM HỎNG: đã dựng "' + ten + '" mà chỉ tiêu vẫn báo ĐẠT — ' +
    'nghĩa là chỉ tiêu này không bắt được gì, coi như chưa có chỉ tiêu');
  return 'đối chứng âm "' + ten + '": LỆCH ← đúng như phải thế · ' + bat.slice(0, 110);
}

// ---------------------------------------------------------------- ba bản đọc giá vốn SAI, để đối chứng

const DOC_THAT = lop.DanhMuc.doc;

/** Duyệt mọi item của một danh mục (item nằm ở cả hai chỉ mục, cùng một đối tượng). */
function moiItem(dm, fn) {
  Object.keys(dm.theoTvt).forEach(function (k) { fn(dm.theoTvt[k]); });
  Object.keys(dm.theoMa).forEach(function (k) { fn(dm.theoMa[k]); });
}

/** Bản CŨ: chưa bao giờ đọc cột giá vốn. Đúng hành vi của tool trước hôm nay. */
function docBanCu(bang, cfg) {
  const dm = DOC_THAT(bang, cfg);
  moiItem(dm, function (it) { it.giaVon0 = false; it.giaVonDocDuoc = false; });
  return dm;
}

/** Bản LỎNG TAY: đọc giá vốn y như cột tồn — bỏ mọi ký tự không phải chữ số rồi Number(). '#DIV/0!' và '' đều ra 0. */
function docBanLongTay(bang, cfg) {
  const dm = DOC_THAT(bang, cfg);
  moiItem(dm, function (it) {
    const v = (bang[it.dong - 1] || [])[COT_GIA_VON];
    const n = Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
    it.giaVonDocDuoc = !isNaN(n);
    it.giaVon0 = !isNaN(n) && n === 0;
  });
  return dm;
}

/** Bản CHỈ SỐ: chỉ tin ô kiểu number. Đường Google đọc bằng getDisplayValues nên mọi ô về đây là CHUỖI. */
function docBanChiSo(bang, cfg) {
  const dm = DOC_THAT(bang, cfg);
  moiItem(dm, function (it) {
    const v = (bang[it.dong - 1] || [])[COT_GIA_VON];
    it.giaVonDocDuoc = typeof v === 'number';
    it.giaVon0 = typeof v === 'number' && v === 0;
  });
  return dm;
}

/** Chạy `fn` với một bản đọc giá vốn khác, rồi trả lại bản thật. */
function voiBanDoc(banDoc, fn) {
  lop.DanhMuc.doc = banDoc;
  try { return fn(); } finally { lop.DanhMuc.doc = DOC_THAT; }
}

// ---------------------------------------------------------------- bối cảnh giả

/**
 * Bảng `Tổng tồn kho` giả, ghi đè ô giá vốn của những tên viết tắt được chỉ định.
 * @param {Object} sua  { 'dt5': 0, 'A2': '#REF!' } — giá trị đặt vào cột G
 */
function bangDanhMuc(sua) {
  return lop.TestData.danhMucBang().map(function (row) {
    const r = row.slice();
    const tvt = r[COT_TVT_DM];
    if (tvt != null && Object.prototype.hasOwnProperty.call(sua || {}, tvt)) r[COT_GIA_VON] = sua[tvt];
    return r;
  });
}

/** Toàn bộ cột G thành CHUỖI hiển thị như `getDisplayValues` trả về (đường Google). */
function bangDanhMucHienThi(sua) {
  return bangDanhMuc(sua).map(function (r, i) {
    if (i < 2) return r;
    const x = r.slice();
    const v = x[COT_GIA_VON];
    if (typeof v === 'number') x[COT_GIA_VON] = v === 0 ? ' -  ' : String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return x;
  });
}

function boiCanh(bangDM) {
  const cfg = lop.Config.tao();
  const sheets = {};
  sheets['Tổng tồn kho'] = {
    ten: 'Tổng tồn kho', soDong: bangDM.length, giaTri: bangDM,
    congThuc: bangDM.map(function () { return []; }), mang: bangDM.map(function () { return []; }), dinhDang: []
  };
  sheets[TEN_SHEET] = lop.TestData.sheetGianHang(TEN_SHEET, [
    { ma: 'TEST0731AAAA01', tvt: 'dt5', sl: 1, h: 220000, i: null, j: 59100, k: 3300 }
  ], 8, 9);
  sheets['Offood'] = lop.TestData.sheetGianHang('Offood', [], 6, 30);
  sheets['Tổng xuất'] = lop.TestData.sheetTongXuat({ 'Shopee mall': 12, 'Offood': 5 });
  const kho = new lop.KhoGiaLap(sheets, lop.TestData.mappingBang());
  return { kho: kho, cfg: cfg };
}

function chay(bc, dons) {
  const nguon = new lop.NguonGiaLap([{
    san: 'SHOPEE', maGianHang: 'SP_MALL', tenFile: 'mall.xlsx',
    bang: lop.TestData.bangNguon(bc.cfg, dons)
  }]);
  return lop.chayDongBo(nguon, bc.kho, { thoiDiem: new Date(2026, 8, 7, 8, 0, 0), cfg: bc.cfg, ngayGhi: '2026-09-07' });
}

/** Dòng vừa ghi của một mã đơn trên sheet gian hàng (cột C = Thông tin ĐH). */
function dongCuaDon(kho, maDon) {
  const s = kho.sheets[TEN_SHEET];
  for (let r = 4; r <= s.giaTri.length + 2; r++) {
    const o = kho.o(TEN_SHEET, r, 3);
    if (o && String(o.gt) === maDon) return r;
  }
  throw new Error('Không tìm thấy dòng của đơn ' + maDon + ' trên sheet ' + TEN_SHEET);
}

/** Nội dung ô Note của một dòng. */
function noteCuaDong(bc, r) {
  const cNote = lop.KeyIn.cotNote(bc.kho.docSheet(TEN_SHEET), bc.cfg.keyin);
  const o = bc.kho.o(TEN_SHEET, r, cNote);
  return o && o.gt != null ? String(o.gt) : '';
}

/**
 * Phép chấm CÂU NOTE: phải nói đủ ba điều cho nhân viên hiểu ngay.
 * @returns {string[]} những điều còn thiếu; rỗng nghĩa là đạt
 */
function thieuGiCauNote(cau, maHang) {
  const t = [];
  if (String(cau).indexOf(String(maHang)) < 0) t.push('không nêu MÃ HÀNG ' + maHang);
  if (!/giá vốn 0/i.test(cau)) t.push('không nói rõ GIÁ VỐN 0');
  if (!/lãi/i.test(cau)) t.push('không nói VÌ SAO đáng ngờ (lãi tính ra cao hơn thật)');
  if (!/tặng/i.test(cau)) t.push('không nhắc mã giá vốn 0 thường là mã HÀNG TẶNG');
  return t;
}

// ---------------------------------------------------------------- danh sách chỉ tiêu

const TESTS = [];
function test(ma, ten, fn) { TESTS.push({ ma: ma, ten: ten, fn: fn }); }

// ---------------------------------------------------------------- GV-01

test('GV-01', 'Đo trên FILE THẬT: sheet `Tổng tồn kho` có đúng 3 mã giá vốn 0 và 0 mã không đọc được', async () => {
  if (!fs.existsSync(FILE_THAT)) return { boQua: true, lyDo: 'không có ' + FILE_THAT };
  // Đọc đúng đường tool đang dùng: `giaTriTinh` (ô công thức lấy kết quả đã tính sẵn), y như Main.gs.
  // Đọc bằng ảnh `giaTri` trần thì 5 ô giá vốn viết bằng công thức hóa ra "không đọc được" — sai số đo.
  const kho = new KhoTracking(FILE_THAT, path.join(os.tmpdir(), 'gia-von-0-khong-bao-gio-ghi.xlsx'), lop);
  await kho.nap(lop.Config.tao());
  const ss = kho.docSheet('Tổng tồn kho');
  const bangDM = ss.giaTriTinh || ss.giaTri;
  const dm = DOC_THAT(bangDM, lop.SCHEMA.DANH_MUC);

  /** Chỉ tiêu: số mã, số mã giá vốn 0, số mã không đọc được đúng bằng mốc đã đo. */
  function kiem(danhMuc) {
    bang(danhMuc.soDong, MOC_FILE_THAT.soMa, 'số mã trong danh mục');
    bang(danhMuc.soGiaVon0, MOC_FILE_THAT.giaVon0, 'số mã GIÁ VỐN 0 THẬT');
    bang(danhMuc.soKhongDocDuocGiaVon, MOC_FILE_THAT.khongDocDuoc, 'số mã KHÔNG ĐỌC ĐƯỢC giá vốn');
    const ma0 = [];
    moiItem(danhMuc, function (it) { if (it.giaVon0 && ma0.indexOf(it.maHang) < 0) ma0.push(it.maHang); });
    bang(ma0.sort().join(','), MOC_FILE_THAT.ma0.join(','), 'đúng ba mã giá vốn 0');
  }
  kiem(dm);

  // Cả ba mã giá vốn 0 trên file thật đều là mã khuyến mãi — đúng như BA nói ở mục 0.
  const ten0 = [];
  moiItem(dm, function (it) { if (it.giaVon0 && ten0.indexOf(it.tenVietTat) < 0) ten0.push(it.tenVietTat); });

  // ĐỐI CHỨNG ÂM: cắm 4 ô hỏng vào cột giá vốn rồi đọc LỎNG TAY. Ô lỗi và ô rỗng hóa thành "giá vốn 0"
  // nên số đếm vọt lên — chỉ tiêu phải bắt được.
  const bangHong = bangDM.map(function (r) { return r.slice(); });
  let da = 0;
  for (let i = 2; i < bangHong.length && da < 4; i++) {
    if (!bangHong[i] || !String(bangHong[i][COT_TVT_DM] || '').trim()) continue;
    if (bangHong[i][COT_GIA_VON] === 0) continue;
    bangHong[i][COT_GIA_VON] = ['#DIV/0!', '', '#N/A', '=G9*1'][da];
    da++;
  }
  const gc = doiChungAm('bộ đọc lỏng tay + 4 ô hỏng cắm vào cột giá vốn', function () { kiem(docBanLongTay(bangHong, lop.SCHEMA.DANH_MUC)); });
  return { ghiChu: MOC_FILE_THAT.soMa + ' mã · ' + dm.soGiaVon0 + ' mã giá vốn 0 thật (' + ten0.join(', ') + ') · ' +
    dm.soKhongDocDuocGiaVon + ' mã không đọc được · ' + gc };
});

// ---------------------------------------------------------------- GV-02

test('GV-02', 'Phân biệt GIÁ VỐN 0 với KHÔNG ĐỌC ĐƯỢC: 15 ca ô, kể cả dấu gạch ngang của định dạng kế toán', () => {
  // [ô đọc từ sheet, kỳ vọng: 0 = giá vốn 0 · null = không đọc được · số = giá vốn thật]
  const CA = [
    [0, 0, 'số 0 (đường Excel đọc giá trị đã tính)'],
    ['0', 0, 'chuỗi "0"'],
    ['-', 0, 'dấu gạch ngang — khúc "số 0" của định dạng kế toán'],
    [' -  ', 0, 'gạch ngang kèm khoảng đệm, đúng chuỗi getDisplayValues trả về'],
    ['', null, 'ô trống — KHÔNG BIẾT, không phải 0'],
    [null, null, 'ô null'],
    ['   ', null, 'ô chỉ có khoảng trắng'],
    ['#REF!', null, 'ô lỗi #REF!'],
    ['#N/A', null, 'ô lỗi #N/A'],
    ['#DIV/0!', null, 'ô lỗi #DIV/0! — bộ lọc lỏng tay rút gọn thành "0"'],
    ['=G3*0', null, 'công thức chưa tính'],
    ['chưa có', null, 'chữ — bộ lọc lỏng tay rút gọn thành "" rồi Number("") = 0'],
    ['n/a', null, 'chữ "n/a"'],
    [131565, 131565, 'giá vốn thật'],
    ['131,565', 131565, 'giá vốn thật dạng chuỗi hiển thị']
  ];

  /** Chỉ tiêu: mọi ca đọc ra đúng loại. */
  function kiem(docO) {
    CA.forEach(function (c) {
      const n = docO(c[0]);
      const mong = c[1];
      if (mong === null) phai(n === null, 'ca "' + c[2] + '": phải là KHÔNG ĐỌC ĐƯỢC, nhận ' + JSON.stringify(n));
      else bang(n, mong, 'ca "' + c[2] + '"');
    });
  }
  kiem(lop.DanhMuc.docGiaVon);

  // ĐỐI CHỨNG ÂM: chính bộ lọc lỏng tay mà cột tồn đang dùng.
  const long = function (v) {
    const n = Number(String(v == null ? '' : v).replace(/[^\d.\-]/g, ''));
    return isNaN(n) ? null : n;
  };
  const gc = doiChungAm('bộ lọc lỏng tay của cột tồn', function () { kiem(long); });

  // Đếm cụ thể nó sai mấy ca, để thấy đây không phải lỗi lẻ.
  let sai = 0;
  CA.forEach(function (c) { const n = long(c[0]); if ((c[1] === null) !== (n === null) || (c[1] !== null && n !== c[1])) sai++; });
  return { ghiChu: CA.length + ' ca đạt · bộ lỏng tay sai ' + sai + '/' + CA.length + ' ca · ' + gc };
});

// ---------------------------------------------------------------- GV-03

test('GV-03', 'Dòng bán trừ vào mã giá vốn 0: VẪN GHI ĐƠN, tô vàng cả dòng, Note nêu lý do', () => {
  const MA_DON = 'GV0000000001';

  /** Chỉ tiêu: đơn vẫn vào đủ, đúng dòng đó vàng, và Note nêu mã 1548. */
  function kiem() {
    const bc = boiCanh(bangDanhMuc({ dt5: 0 }));          // dt5 = mã 1548, đặt giá vốn 0
    const kq = chay(bc, [lop.TestData.don({ maDon: MA_DON })]);
    bang(kq.donGhi, 1, 'vẫn ghi đơn, không chặn');
    bang(kq.dongGhi, 1, 'ghi đúng 1 dòng');
    const r = dongCuaDon(bc.kho, MA_DON);
    bang(String(bc.kho.o(TEN_SHEET, r, 4).gt), 'dt5', 'cột D vẫn điền tên viết tắt — không bỏ trống');
    phai(bc.kho.o(TEN_SHEET, r, 8).gt > 0, 'tiền vẫn ghi đủ');
    phai(bc.kho.dongVang(TEN_SHEET, r), 'dòng ' + r + ' phải được TÔ VÀNG');
    bang(kq.dongVang, 1, 'thống kê đếm đúng 1 dòng vàng');
    const note = noteCuaDong(bc, r);
    phai(note.indexOf('1548') >= 0, 'Note phải nêu mã hàng 1548, nhận: "' + note + '"');
    phai(/giá vốn 0/i.test(note), 'Note phải nói giá vốn 0, nhận: "' + note + '"');
    return note;
  }
  const note = kiem();

  // ĐỐI CHỨNG ÂM: bản CŨ, chưa bao giờ đọc cột giá vốn — đúng hành vi trước hôm nay.
  const gc = doiChungAm('bản CŨ không đọc cột giá vốn', function () { voiBanDoc(docBanCu, kiem); });
  return { ghiChu: 'Note: "' + note + '" · ' + gc };
});

// ---------------------------------------------------------------- GV-04

test('GV-04', 'Đường Google (getDisplayValues): giá vốn 0 về dạng chuỗi " -  " vẫn bắt được', () => {
  const MA_DON = 'GV0000000002';

  /** Chỉ tiêu: bảng danh mục toàn CHUỖI hiển thị vẫn ra đúng một dòng vàng có Note. */
  function kiem() {
    const bc = boiCanh(bangDanhMucHienThi({ dt5: 0 }));
    const dm = lop.DanhMuc.doc(bc.kho.docSheet('Tổng tồn kho').giaTri, bc.cfg.danhMuc);
    bang(dm.soGiaVon0, 1, 'đọc ra đúng 1 mã giá vốn 0 từ chuỗi hiển thị');
    bang(dm.soKhongDocDuocGiaVon, 0, 'không mã nào bị coi là không đọc được');
    const kq = chay(bc, [lop.TestData.don({ maDon: MA_DON })]);
    bang(kq.dongVang, 1, 'đúng 1 dòng vàng');
    const note = noteCuaDong(bc, dongCuaDon(bc.kho, MA_DON));
    phai(note.indexOf('1548') >= 0, 'Note nêu mã 1548, nhận "' + note + '"');
  }
  kiem();

  // ĐỐI CHỨNG ÂM: bản CHỈ SỐ — chỉ tin ô kiểu number. Đường Google không có ô number nào nên trượt sạch.
  const gc = doiChungAm('bản CHỈ SỐ (bỏ qua chuỗi hiển thị)', function () { voiBanDoc(docBanChiSo, kiem); });
  return { ghiChu: 'ô giá vốn 0 về dạng " -  " · ' + gc };
});

// ---------------------------------------------------------------- GV-05

test('GV-05', 'KHÔNG tô vàng oan: ô lỗi, ô trống, công thức chưa tính đều IM LẶNG', () => {
  const MA_DON = 'GV0000000003';
  const KHONG_DOC_DUOC = ['#DIV/0!', '', '#REF!', '=G3*1', 'chưa có'];

  /** Chỉ tiêu: năm kiểu ô không đọc được, không kiểu nào sinh dòng vàng. */
  function kiem() {
    KHONG_DOC_DUOC.forEach(function (o) {
      const bc = boiCanh(bangDanhMuc({ dt5: o }));
      const kq = chay(bc, [lop.TestData.don({ maDon: MA_DON })]);
      bang(kq.donGhi, 1, 'ô ' + JSON.stringify(o) + ': vẫn ghi đơn');
      bang(kq.dongVang, 0, 'ô ' + JSON.stringify(o) + ': KHÔNG được tô vàng — không đọc được thì không kêu');
      const note = noteCuaDong(bc, dongCuaDon(bc.kho, MA_DON));
      bang(note, '', 'ô ' + JSON.stringify(o) + ': Note phải để trống');
    });
  }
  kiem();

  // ĐỐI CHỨNG ÂM: bản LỎNG TAY — '#DIV/0!' và ô trống hóa thành giá vốn 0, tô vàng oan.
  const gc = doiChungAm('bản LỎNG TAY (bỏ ký tự không phải số rồi Number)', function () { voiBanDoc(docBanLongTay, kiem); });
  return { ghiChu: KHONG_DOC_DUOC.length + ' kiểu ô không đọc được, 0 dòng vàng · ' + gc };
});

// ---------------------------------------------------------------- GV-06

test('GV-06', 'Câu Note nói đủ BA ĐIỀU: mã nào · giá vốn 0 · vì sao đáng ngờ', () => {
  const bc = boiCanh(bangDanhMuc({ dt5: 0 }));
  const kq = chay(bc, [lop.TestData.don({ maDon: 'GV0000000004' })]);
  bang(kq.dongVang, 1, 'có dòng vàng để lấy câu Note');
  const note = noteCuaDong(bc, dongCuaDon(bc.kho, 'GV0000000004'));

  /** Chỉ tiêu: câu Note không thiếu điều nào. */
  function kiem(cau) {
    const thieu = thieuGiCauNote(cau, '1548');
    phai(thieu.length === 0, 'câu Note thiếu: ' + thieu.join(' · ') + ' — câu đang có: "' + cau + '"');
    phai(cau.length < 260, 'câu Note dài quá, nhân viên sẽ không đọc (' + cau.length + ' ký tự)');
    phai(!/[A-Za-z_]+\(|\bnull\b|\bundefined\b/.test(cau), 'câu Note không được viết kiểu kỹ thuật: "' + cau + '"');
  }
  kiem(note);

  // ĐỐI CHỨNG ÂM: câu cụt kiểu cũ, không nêu mã và không nói vì sao đáng ngờ.
  const gc = doiChungAm('câu Note cụt "giá vốn 0 — kiểm tra lại"', function () { kiem('giá vốn 0 — kiểm tra lại'); });
  return { ghiChu: 'nguyên văn: "' + note + '" · ' + gc };
});

// ---------------------------------------------------------------- GV-07

test('GV-07', 'Cấu phần: combo chạm một mã giá vốn 0 → vàng + Note nêu ĐÚNG mã đó, mã còn lại không bị réo', () => {
  const MA_DON = 'GV0000000005';
  const LISTING = 'Combo đi sinh Altawell';          // cấu phần: khăn gừng (1623) x 1 · kvs (1650) x 1

  /** Chỉ tiêu: đặt giá vốn 0 cho `kvs` → hai dòng cấu phần đều vàng, Note nêu 1650 chứ không nêu 1623. */
  function kiem() {
    const bc = boiCanh(bangDanhMuc({ kvs: 0 }));
    const kq = chay(bc, [lop.TestData.don({ maDon: MA_DON, dongs: [{ ten: LISTING, sl: 1, gia: 120000 }] })]);
    bang(kq.donGhi, 1, 'vẫn ghi đơn');
    bang(kq.dongGhi, 2, 'combo bung ra 2 dòng');
    const r = dongCuaDon(bc.kho, MA_DON);
    const note = noteCuaDong(bc, r);
    phai(note.indexOf('1650') >= 0, 'Note phải nêu mã 1650 (kvs), nhận: "' + note + '"');
    phai(note.indexOf('1623') < 0, 'Note KHÔNG được réo mã 1623 (khăn gừng, giá vốn 68.000): "' + note + '"');
    phai(bc.kho.dongVang(TEN_SHEET, r), 'dòng combo phải vàng');

    // và combo sạch thì tuyệt đối không vàng
    const bc2 = boiCanh(bangDanhMuc({}));
    const kq2 = chay(bc2, [lop.TestData.don({ maDon: MA_DON, dongs: [{ ten: LISTING, sl: 1, gia: 120000 }] })]);
    bang(kq2.dongVang, 0, 'combo mà mọi cấu phần đều có giá vốn thật thì KHÔNG vàng');
  }
  kiem();

  const gc = doiChungAm('bản CŨ không đọc cột giá vốn', function () { voiBanDoc(docBanCu, kiem); });
  return { ghiChu: 'cấu phần 2 mã, chỉ mã giá vốn 0 bị nêu tên · ' + gc };
});

// ---------------------------------------------------------------- GV-08

test('GV-08', 'FR-21: câu cảnh báo và ba file lớp 2 không mang tên sàn', () => {
  const FILE_LOP_2 = ['MapListing.gs', 'Normalize.gs', 'DanhMuc.gs'];
  const TEN_SAN = ['shopee', 'tiktok', 'lazada', 'kiotviet'];

  // Từ vựng của CHÍNH file tracking (cột `Tên trên Shopee` do chủ dự án đặt) là ngoại lệ có sẵn của FR-21.
  let tuVung = [].concat(lop.SCHEMA.MAPPING, lop.SCHEMA.MAPPING_COT_NGUOI, [lop.SCHEMA.MAPPING_COT_LO_PHU],
    [lop.TEN_SHEET_MAPPING_EXCEL], [lop.TEN_TAB_MAPPING_SHEET]);
  Object.keys(lop.SCHEMA.MAPPING_BI_DANH).forEach(function (k) { tuVung = tuVung.concat(lop.SCHEMA.MAPPING_BI_DANH[k]); });
  tuVung = Array.from(new Set(tuVung.map(String))).sort(function (a, b) { return b.length - a.length; });

  /** Bỏ chú thích (chú thích là tài liệu nghiệp vụ, FR-21 chỉ rà phần chạy được). */
  function boChuThich(s) {
    return s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
  }

  /** Chỉ tiêu: không đoạn chữ nào chứa tên sàn sau khi trừ từ vựng file tracking. */
  function kiem(cacDoan) {
    cacDoan.forEach(function (x) {
      let con = String(x.text).normalize('NFC');
      tuVung.forEach(function (t) { con = con.split(t).join(' ').split(t.toLowerCase()).join(' '); });
      const low = con.toLowerCase();
      TEN_SAN.forEach(function (s) {
        phai(low.indexOf(s) < 0, x.ten + ' nhắc TÊN SÀN "' + s + '" — lớp 2 không được biết dữ liệu đến từ đâu');
      });
    });
  }

  const doan = FILE_LOP_2.map(function (f) { return { ten: f, text: boChuThich(fs.readFileSync(path.join(SRC, f), 'utf8')) }; });
  doan.push({ ten: 'câu cảnh báo giá vốn 0', text: lop.MapListing.LY_DO.GIA_VON_0 });
  doan.push({ ten: 'câu cảnh báo dựng đủ', text: lop.MapListing.canhBaoGiaVon0({ item: { maHang: '1548', tenVietTat: 'dt5', giaVon0: true } }) });
  kiem(doan);

  const gc = doiChungAm('câu cảnh báo có cắm tên sàn', function () {
    kiem([{ ten: 'câu thử', text: 'mã 1548 giá vốn 0 — kiểm lại file xuất Shopee' }]);
  });
  return { ghiChu: FILE_LOP_2.length + ' file lớp 2 + 2 câu cảnh báo · ' + gc };
});

// ---------------------------------------------------------------- chạy

async function chayTatCa() {
  const kq = [];
  for (const t of TESTS) {
    try {
      const r = await t.fn();
      if (r && r.boQua) kq.push({ ma: t.ma, ten: t.ten, dat: false, boQua: true, ghiChu: r.lyDo || '' });
      else kq.push({ ma: t.ma, ten: t.ten, dat: true, ghiChu: (r && r.ghiChu) || '' });
    } catch (e) {
      kq.push({ ma: t.ma, ten: t.ten, dat: false, loi: e && e.message ? e.message : String(e) });
    }
  }
  return kq;
}

module.exports = { chayTatCa, TESTS };

if (require.main === module) {
  chayTatCa().then(function (kq) {
    let dat = 0, hong = 0, boQua = 0;
    console.log('=== GIÁ VỐN 0 — chống lãi ảo khi dòng bán trừ vào mã hàng tặng ===\n');
    kq.forEach(function (r) {
      const tt = r.dat ? 'ĐẠT   ' : r.boQua ? 'BỎ QUA' : 'HỎNG  ';
      if (r.dat) dat++; else if (r.boQua) boQua++; else hong++;
      console.log(tt + ' ' + r.ma + ' ' + r.ten +
        (r.loi ? '\n        → ' + r.loi : '') + (r.ghiChu ? '\n        · ' + r.ghiChu : ''));
    });
    console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · ' + boQua + ' BỎ QUA · tổng ' + kq.length + ' ===');
    process.exit(hong ? 1 : 0);
  });
}
