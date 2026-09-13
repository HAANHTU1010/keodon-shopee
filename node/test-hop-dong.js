/**
 * test-hop-dong.js — YC-38.1: "HỢP ĐỒNG" FILE THÁNG. Chạy: `node node/test-hop-dong.js`.
 *
 * Không cần mạng, không đụng Google: Web App giả (`node/gia-lap-web-app.js`) chạy CHÍNH mã thật của
 * `src/ShellAppsScript.gs`. Bài nào hỏng là mã thật hỏng.
 *
 * ------------------------------------------------------------------------------ VÌ SAO BỘ NÀY TỒN TẠI
 * Tool ghi theo VỊ TRÍ: cột C là mã đơn, H..K là tiền, dòng 3 là dòng tổng. Chủ shop đổi tên hay chèn
 * một cột là tool ghi lệch toàn bộ mà không có gì báo — tiền rơi sang cột thuế, mã đơn rơi sang cột tên
 * hàng, khóa chống trùng chết và lần chạy sau nhân đôi đơn. Dọn tay trong sổ tiền sau khi đã ghi là việc
 * tệ nhất có thể xảy ra, nên `kiemHopDongFileThang_` kiểm TRƯỚC mỗi lượt ghi và dừng khi lệch.
 *
 * Bộ này canh ba điều, mỗi điều có đối chứng âm:
 *   1. Lệch khuôn → DỪNG `SAI_HOP_DONG`, câu lỗi chỉ đúng ô, và KHÔNG MỘT Ô NÀO của file bị đổi.
 *   2. Không chặn oan: thêm sheet `TikTok Shop` / `Chi Phí Hàng Ngày`, cột O là `Ghi chú`, Mapping có cột
 *      phụ, tiêu đề thừa dấu cách — đều là file thật đang dùng, phải chạy bình thường.
 *   3. Mapping ghi THEO TÊN CỘT (lỗi thật tìm thấy 13/9 trên khuôn Mapping nghiệm thu NT1 có cột lô phụ ở E).
 *
 * Mã bài `T-HD-xx` để không đụng các hệ đánh số đang có.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const gl = require('./gia-lap-web-app');

const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });

const SRC = path.join(__dirname, '..', 'src');
const THANG = '2026-09';
const NGAY = '2026-09-08T03:00:00Z';
const SCHEMA_MAP = lop.SCHEMA.MAPPING;
const COT_LO_PHU = lop.SCHEMA.MAPPING_COT_LO_PHU;
const MAU_VANG = '#FFF2CC';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
function test(ma, ten, fn) {
  try {
    const t = fn();
    soDat++;
    console.log('ĐẠT   ' + ma + ' ' + ten);
    if (t) console.log('        · ' + t);
  } catch (e) {
    soHong++;
    hong.push(ma + ' ' + ten + ' -> ' + (e && e.message));
    console.log('HỎNG  ' + ma + ' ' + ten + '\n   -> ' + (e && e.message));
  }
}
function bang(thuc, mong, vi) {
  const a = JSON.stringify(thuc), b = JSON.stringify(mong);
  if (a !== b) throw new Error((vi ? vi + ': ' : '') + 'được ' + a + ', cần ' + b);
}
function dung(dk, vi) { if (!dk) throw new Error(vi || 'điều kiện sai'); }

/**
 * Đối chứng âm: `fn` dựng lại đúng MỘT khuyết tật và trả về danh sách "đã bắt được gì" theo phép chấm
 * của bài. Danh sách RỖNG nghĩa là phép chấm mù. `fn` KHÔNG được ném — lỗi dựng ném ra mà đếm là "đã lệch"
 * thì một fixture hỏng sẽ tự làm bài xanh.
 */
function doiChungAm(fn, moTa) {
  const ra = fn();
  if (!Array.isArray(ra) || !ra.length) {
    throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  }
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + ra[0] + ') ← đúng như phải thế';
}

/** Mốc sửa nguồn cho đối chứng âm: phải có ĐÚNG `n` chỗ, không thì dừng to — đừng để bài tự xanh. */
function sua(moc, thay, n) {
  const src = fs.readFileSync(path.join(SRC, 'ShellAppsScript.gs'), 'utf8');
  const co = src.split(moc).length - 1;
  if (co !== (n || 1)) {
    throw new Error('mốc đối chứng âm cần ' + (n || 1) + ' chỗ trong ShellAppsScript.gs, tìm được ' + co +
      ': ' + moc.slice(0, 60) + ' — mã đã đổi, sửa lại mốc, ĐỪNG bỏ bài');
  }
  return (s) => s.split(moc).join(thay);
}

// ==================================================================== dựng file tháng

const BANG_TON = [
  [],
  ['', 'STT', 'Tên sản phẩm', 'Tên viết tắt', 'Mã hàng', 'Đơn vị', 'Giá vốn', 'Tổng tồn'],
  ['', 1, 'Hàng mẫu', 'dt5', 'MH001', 'cái', 1500, 9999]
];

/**
 * File tháng ĐỦ KHUÔN như file thật: 4 sheet gian hàng, `Tổng tồn kho`, Mapping 12 cột.
 * @param {Object} tc { suaNguon, mapping (bảng), sua(ss) — đổi file trước khi gọi }
 */
function dungFile(tc) {
  const o = tc || {};
  const sim = gl.taoGiaLap({ ngay: NGAY, suaNguon: o.suaNguon });
  const ss = sim.khaiThang(THANG);
  gl.dungSheetGianHang(ss, 'Shopee mall', [{ ma: 'CU0000000001', tvt: 'dt5', sl: 1, h: 1000, i: 0, j: 0, k: 0 }]);
  gl.dungSheetDanhMuc(ss, BANG_TON);
  gl.dungSheetMapping(ss, o.mapping || [SCHEMA_MAP.slice()]);
  gl.dungKhungThieu(ss);
  if (o.sua) o.sua(ss);
  sim.ss = ss;
  sim.post = (goi) => JSON.parse(sim.vo.doPost({
    postData: {
      contents: JSON.stringify(Object.assign({
        token: sim.biMat, phienBanMongDoi: sim.vo.PHIEN_BAN, thang: THANG, spreadsheetId: sim.idCua(THANG)
      }, goi))
    }
  }).getContent());
  return sim;
}

let demMa = 0;
function goiGhi(them) {
  demMa++;
  return Object.assign({
    hanhDong: 'ghi',
    lenh: [{
      tenSheet: 'Shopee mall',
      don: [{
        maDon: 'HD2609' + ('000000' + demMa).slice(-6), ngay: '2026-09-08',
        tien: { H: 250000, I: 0, J: 5000, K: 2500 }, dong: [{ tenVietTat: 'dt5', soLuong: 1 }]
      }]
    }]
  }, them || {});
}

/** Chạy một lượt ghi trên file đã đổi; trả { kq, soLenhGhi, soOKhac } — soOKhac đếm trên CẢ file. */
function chayGhi(tc, goi) {
  const sim = dungFile(tc);
  const truoc = sim.anhChup(THANG);
  sim.demLai();
  const kq = sim.post(goi || goiGhi());
  const sau = sim.anhChup(THANG);
  return { sim, kq, soLenhGhi: sim.nhatKyGhi.length, soOKhac: sim.soAnh(truoc, sau).length };
}

const doiO = (tenSheet, r, c, v) => (ss) => { ss.getSheetByName(tenSheet).giaTri[r + ':' + c] = v; };

/** Phép chấm chung của ca "phải dừng": trả danh sách điều SAI (rỗng = dừng đúng). */
function loiCuaCaDung(x, canNeu) {
  const sai = [];
  if (x.kq.ok !== false) sai.push('không dừng (ok=' + x.kq.ok + ')');
  if (x.kq.loi !== 'SAI_HOP_DONG') sai.push('mã lỗi ' + x.kq.loi);
  const t = String(x.kq.thongBao || '');
  if (t.indexOf('SỔ THÁNG KHÔNG ĐÚNG KHUÔN') !== 0) sai.push('câu mở đầu sai');
  if (t.indexOf('Tool chưa ghi gì') < 0) sai.push('không nói "Tool chưa ghi gì"');
  (canNeu || []).forEach((m) => { if (t.indexOf(m) < 0) sai.push('không nêu ' + JSON.stringify(m)); });
  if (x.soLenhGhi) sai.push(x.soLenhGhi + ' lệnh ghi');
  if (x.soOKhac) sai.push(x.soOKhac + ' ô bị đổi');
  return sai;
}

/** Gỡ trọn phần thân `kiemHopDongFileThang_` → hàm không kiểm gì (bản trước YC-38.1). */
const GO_KIEM = () => sua('function kiemHopDongFileThang_(ss, cfg) {\n  var lech = [];',
  'function kiemHopDongFileThang_(ss, cfg) {\n  return;\n  var lech = [];');

// ====================================================================================================

console.log('=== YC-38.1: HỢP ĐỒNG FILE THÁNG ===\n');
console.log('--- 1. file ĐÚNG khuôn thì chạy bình thường (không chặn oan) ---');

test('T-HD-01', 'file đủ khuôn → ghi được, đúng một đơn vào đúng sheet', () => {
  const x = chayGhi();
  dung(x.kq.ok, 'phải ghi được: ' + JSON.stringify(x.kq).slice(0, 200));
  bang(x.kq.thongKe.donGhi, 1, 'số đơn ghi');
  return 'lệnh ghi ' + x.soLenhGhi + ' · ô đổi ' + x.soOKhac + ' · ' + doiChungAm(() => {
    // Hàng rào luôn-chặn: file đúng khuôn cũng bị dừng. Phép chấm "ghi được" phải nhìn thấy.
    const y = chayGhi({ suaNguon: sua('  if (!lech.length) return;', '  if (!lech.length && false) return;') });
    return y.kq.ok ? [] : ['bị dừng: ' + y.kq.loi];
  }, 'kiểm khuôn chặn cả file đúng');
});

const THE_CO_THAT = {
    mapping: [SCHEMA_MAP.slice(0, 4).concat([COT_LO_PHU], SCHEMA_MAP.slice(4), ['', 'BUOC_DA_XONG', 'B8'])],
    sua: (ss) => {
      ss.themSheet('TikTok Shop').datNen(2, 1, { v: 'Ngày' });
      ss.themSheet('Chi Phí Hàng Ngày').datNen(1, 1, { v: 'Ngày' });
      ss.getSheetByName('Offood').giaTri['2:15'] = 'Ghi chú';
      ss.getSheetByName('Shopee mall').giaTri['2:8'] = '  tổng tiền   SP ';
      ss.getSheetByName('Tổng tồn kho').giaTri['2:8'] = 'TỔNG TỒN';
      // sheet thứ tự khác: đưa Mapping lên đầu
      ss.sheets.unshift(ss.sheets.splice(ss.sheets.indexOf(ss.getSheetByName('Mapping_san_pham')), 1)[0]);
    }
};
test('T-HD-02', 'khuôn THẬT đang dùng: thêm `TikTok Shop` + `Chi Phí Hàng Ngày`, Offood cột O `Ghi chú`, ' +
  'tiêu đề thừa dấu cách/khác hoa thường, Mapping có cột phụ + khối N1:O5 → vẫn chạy', () => {
  const x = chayGhi(THE_CO_THAT);
  dung(x.kq.ok, 'chặn oan file thật: ' + String(x.kq.thongBao).slice(0, 300));
  bang(x.kq.thongKe.donGhi, 1);
  return 'file có ' + x.sim.ss.sheets.length + ' sheet, ghi ' + x.kq.thongKe.donGhi + ' đơn · ' + doiChungAm(() => {
    // So tên cột nguyên văn (không gộp khoảng trắng, phân biệt hoa thường) là chặn oan file thật.
    const y = chayGhi(Object.assign({}, THE_CO_THAT, {
      suaNguon: sua("  return t.replace(/\\s+/g, ' ').trim().toLowerCase();", '  return t;')
    }));
    return y.kq.ok ? [] : ['chặn oan: ' + String(y.kq.thongBao).slice(0, 80)];
  }, 'so tên cột nguyên văn');
});

console.log('\n--- 2. file LỆCH khuôn → dừng trước lệnh ghi đầu tiên, nêu đúng ô ---');

test('T-HD-03', 'đổi tên cột H sheet gian hàng → DỪNG, nêu "ô H2", không một ô nào của file bị đổi', () => {
  const tc = { sua: doiO('Shopee mall', 2, 8, 'Tiền hàng') };
  const x = chayGhi(tc);
  bang(loiCuaCaDung(x, ['sheet "Shopee mall" ô H2 là "Tiền hàng", cần "Tổng Tiền SP"']), []);
  return x.kq.thongBao.slice(0, 120) + '… · ' + doiChungAm(() => {
    const y = chayGhi(Object.assign({ suaNguon: GO_KIEM() }, tc));
    return loiCuaCaDung(y, []);
  }, 'gỡ thân kiemHopDongFileThang_');
});

test('T-HD-04', 'chèn một cột mới vào giữa (E) → DỪNG, liệt kê tối đa 5 chỗ lệch + "và N chỗ lệch nữa"', () => {
  const chen = (ss) => {
    const sh = ss.getSheetByName('Importmart');
    for (let c = 16; c > 5; c--) sh.giaTri['2:' + c] = sh.giaTri['2:' + (c - 1)];
    sh.giaTri['2:5'] = 'Cột mới chủ shop chèn';
  };
  const x = chayGhi({ sua: chen });
  bang(loiCuaCaDung(x, ['sheet "Importmart" ô E2 là "Cột mới chủ shop chèn", cần "Tên sản phẩm"', 'chỗ lệch nữa)']), []);
  const soCau = x.kq.thongBao.split('; ').length;
  bang(soCau, 5, 'chỉ in 5 chỗ lệch đầu cho câu còn đọc được');
  return 'chi tiết: ' + x.kq.thongBao.match(/\(và \d+ chỗ lệch nữa\)/)[0];
});

test('T-HD-05', 'thiếu hẳn một sheet gian hàng (Babyiu) → DỪNG, nêu tên sheet', () => {
  const bo = (ss) => { ss.sheets = ss.sheets.filter((s) => s.ten !== 'Babyiu'); };
  const x = chayGhi({ sua: bo });
  bang(loiCuaCaDung(x, ['thiếu sheet "Babyiu"']), []);
  return doiChungAm(() => loiCuaCaDung(chayGhi({ sua: bo, suaNguon: GO_KIEM() }), []), 'gỡ kiểm, thiếu sheet Babyiu');
});

test('T-HD-06', 'dòng tổng mất công thức ô K3 (Offood) → DỪNG, nêu "ô K3 (dòng tổng)"', () => {
  const xoa = (ss) => { delete ss.getSheetByName('Offood').congThuc['3:11']; ss.getSheetByName('Offood').giaTri['3:11'] = 12345; };
  const x = chayGhi({ sua: xoa });
  bang(loiCuaCaDung(x, ['sheet "Offood" ô K3 (dòng tổng) không có công thức']), []);
  return doiChungAm(() => {
    // Khuyết tật thật dễ mắc nhất: lấy cột dòng tổng theo cấu hình. Ở đây dựng bản "chỉ xét H..J".
    const y = chayGhi({ sua: xoa, suaNguon: sua('var tu = 8, den = 12;', 'var tu = 8, den = 10;') });
    return loiCuaCaDung(y, []);
  }, 'chỉ xét H..J của dòng tổng');
});

test('T-HD-07', 'dòng tổng vẫn đo H..L dù `cauHinh.keyin` trỏ nhầm — khuôn là của FILE, không của cấu hình', () => {
  // Đúng thứ T-DT-35 phát hiện: lấy cột theo cấu hình thì khóa trỏ nhầm biến thành câu "sổ sai khuôn" giả.
  const x = chayGhi(undefined, goiGhi({ cauHinh: { keyin: { cot_doanh_thu: 'M' } } }));
  const t = String(x.kq.thongBao || '');
  dung(x.kq.loi !== 'SAI_HOP_DONG', 'cấu hình trỏ nhầm KHÔNG được thành "sổ sai khuôn": ' + t.slice(0, 200));
  dung(t.indexOf('TỪ CHỐI GHI: keyin.cot_doanh_thu') === 0, 'phải tới đúng hàng rào cột cấm: ' + t.slice(0, 200));
  bang(x.soLenhGhi, 0, 'hàng rào cột cấm cũng dừng trước mọi lệnh ghi');
  return 'lỗi đúng tầng: hàng rào cột cấm · ' + doiChungAm(() => {
    const y = chayGhi({ suaNguon: sua('var tu = 8, den = 12;', 'var tu = k.cot_tong_tien_sp, den = k.cot_doanh_thu;') },
      goiGhi({ cauHinh: { keyin: { cot_doanh_thu: 'M' } } }));
    return y.kq.loi === 'SAI_HOP_DONG' ? ['bản theo cấu hình ra SAI_HOP_DONG giả'] : [];
  }, 'lấy cột dòng tổng theo cấu hình');
});

test('T-HD-08', '`Tổng tồn kho` đổi tên cột E (Mã hàng) → DỪNG, nêu "ô E2"', () => {
  const tc = { sua: doiO('Tổng tồn kho', 2, 5, 'Mã SP') };
  const x = chayGhi(tc);
  bang(loiCuaCaDung(x, ['sheet "Tổng tồn kho" ô E2 là "Mã SP", cần "Mã hàng"']), []);
  return doiChungAm(() => loiCuaCaDung(chayGhi(Object.assign({ suaNguon: GO_KIEM() }, tc)), []), 'gỡ kiểm, Tổng tồn kho sai');
});

test('T-HD-09', '`Mapping_san_pham` thiếu cột "Xác nhận" → DỪNG, nêu tên cột thiếu', () => {
  const m = SCHEMA_MAP.map((t) => (t === 'Xác nhận' ? 'Duyệt' : t));
  const x = chayGhi({ mapping: [m] });
  bang(loiCuaCaDung(x, ['sheet "Mapping_san_pham" dòng 1 thiếu cột "Xác nhận"']), []);
  return doiChungAm(() => loiCuaCaDung(chayGhi({ mapping: [m], suaNguon: GO_KIEM() }), []), 'gỡ kiểm, Mapping thiếu cột');
});

test('T-HD-10', 'cột O của sheet gian hàng là chữ khác ("Note") → DỪNG; chỉ `Còn Nợ` hoặc `Ghi chú` được nhận', () => {
  const x = chayGhi({ sua: doiO('Babyiu', 2, 15, 'Note') });
  bang(loiCuaCaDung(x, ['sheet "Babyiu" ô O2 là "Note", cần "Còn Nợ" hoặc "Ghi chú"']), []);
  const y = chayGhi({ sua: doiO('Babyiu', 2, 15, 'ghi CHÚ') });
  dung(y.kq.ok, '"ghi CHÚ" phải được nhận: ' + y.kq.thongBao);
  return 'Note → dừng · ghi CHÚ → chạy · ' + doiChungAm(() => {
    // Chỉ nhận `Còn Nợ` (quên Offood dùng `Ghi chú` từ trước) → file thật của Offood bị chặn oan.
    const z = chayGhi({ sua: doiO('Babyiu', 2, 15, 'ghi CHÚ'), suaNguon: sua("['Còn Nợ', 'Ghi chú']];", "['Còn Nợ']];") });
    return z.kq.ok ? [] : ['chặn oan "Ghi chú"'];
  }, 'cột O chỉ nhận "Còn Nợ"');
});

test('T-HD-11', 'đường chạy hằng ngày `xuLy` cũng kiểm khuôn TRƯỚC khi đọc hay ghi', () => {
  const goi = {
    hanhDong: 'xuLy', lo: { so: 1, tong: 1 }, ngayGhi: '2026-09-08',
    cacFile: [{ maGianHang: 'SP_MALL', tenFile: 'thu.xlsx', dong: [{ maDonSan: 'XLHD000001' }] }]
  };
  const tc = { sua: doiO('Shopee mall', 2, 3, 'Mã đơn') };
  const x = chayGhi(tc, goi);
  bang(loiCuaCaDung(x, ['sheet "Shopee mall" ô C2 là "Mã đơn", cần "Thông tin ĐH"']), []);
  dung(!x.sim.nhatKyDoc.some((d) => d.sheet === 'Shopee mall' && d.dong1 >= 4), 'không được đọc vùng đơn trước khi kiểm khuôn');
  return doiChungAm(() => {
    const y = chayGhi(Object.assign({
      suaNguon: sua('  // ---- (0) YC-38.1: file tháng còn đúng khuôn không. Chỉ đọc; lệch là dừng khi chưa ghi gì. ----\n  kiemHopDongFileThang_(ss, cfg);',
        '')
    }, tc), goi);
    return y.kq.loi === 'SAI_HOP_DONG' ? [] : ['bản gỡ kiểm ở xuLy ra ' + y.kq.loi];
  }, 'gỡ kiểm khuôn khỏi xuLy');
});

console.log('\n--- 3. Mapping ghi THEO TÊN CỘT ---');

/** Khuôn Mapping nghiệm thu NT1: cột lô phụ chen ở E, đẩy `Hệ số` … `Ghi chú` sang phải một cột. */
const HEAD_NT1 = SCHEMA_MAP.slice(0, 4).concat([COT_LO_PHU], SCHEMA_MAP.slice(4));
const DONG_MOI = ['Shopee mall', 'Tên hàng mới HD', 'Hộp 500g', '', '', '', '', 'MH777', 'gy1', 'gy2', '08/09/2026', 'tool thêm'];

/** Đọc lại dòng Mapping vừa nối theo TÊN cột của sheet. */
function dongMappingCuoi(sim) {
  const sh = sim.ss.getSheetByName('Mapping_san_pham');
  const r = sh.getLastRow();
  const ra = {};
  for (let c = 1; c <= sh.getLastColumn(); c++) {
    const ten = sh.giaTri['1:' + c];
    if (ten) ra[ten] = sh.giaTri[r + ':' + c] === undefined ? '' : sh.giaTri[r + ':' + c];
  }
  return { r, ra, nen: sh.nen[r + ':1'] };
}

test('T-HD-12', 'Mapping khuôn NT1 (lô phụ ở E): "Mã hàng" vào đúng cột Mã hàng, cột lô phụ để trống', () => {
  const x = chayGhi({ mapping: [HEAD_NT1] }, goiGhi({ mappingThem: [DONG_MOI], mappingThemCot: SCHEMA_MAP }));
  dung(x.kq.ok, JSON.stringify(x.kq).slice(0, 200));
  bang(x.kq.thongKe.mappingThem, 1);
  const d = dongMappingCuoi(x.sim);
  bang(d.ra['Mã hàng'], 'MH777', 'Mã hàng');
  bang(d.ra['Ghi chú'], 'tool thêm', 'Ghi chú');
  bang(d.ra['Tên trên Shopee'], 'Tên hàng mới HD');
  bang(d.ra[COT_LO_PHU], '', 'cột lô phụ không được nhận nhầm giá trị');
  bang(String(d.nen).toUpperCase(), MAU_VANG, 'dòng mới phải vàng');
  return 'dòng ' + d.r + ' · ' + doiChungAm(() => {
    // Bản trước 2.6.0: ghi 12 giá trị vào A:L theo thứ tự SCHEMA.MAPPING.
    const y = chayGhi({ mapping: [HEAD_NT1], suaNguon: sua('      var cot = viTri[tenCot];', '      var cot = k;') },
      goiGhi({ mappingThem: [DONG_MOI], mappingThemCot: SCHEMA_MAP }));
    const e = dongMappingCuoi(y.sim);
    return e.ra['Mã hàng'] === 'MH777' ? [] : ['Mã hàng thành ' + JSON.stringify(e.ra['Mã hàng'])];
  }, 'ghi theo vị trí');
});

test('T-HD-13', 'máy bản cũ không gửi `mappingThemCot` → coi như thứ tự SCHEMA.MAPPING, vẫn ghi theo tên', () => {
  const x = chayGhi({ mapping: [HEAD_NT1] }, goiGhi({ mappingThem: [DONG_MOI] }));
  dung(x.kq.ok, JSON.stringify(x.kq).slice(0, 200));
  const d = dongMappingCuoi(x.sim);
  bang(d.ra['Mã hàng'], 'MH777');
  bang(d.ra['Hệ số'], '');
  return 'Mã hàng đúng cột khi thiếu trường · ' + doiChungAm(() => {
    // Khuyết tật: thiếu tên cột thì rơi về ghi theo vị trí.
    const y = chayGhi({ mapping: [HEAD_NT1], suaNguon: sua('      var cot = viTri[tenCot];', '      var cot = tenCotDong ? viTri[tenCot] : k;') },
      goiGhi({ mappingThem: [DONG_MOI] }));
    const e = dongMappingCuoi(y.sim);
    return e.ra['Mã hàng'] === 'MH777' ? [] : ['Mã hàng thành ' + JSON.stringify(e.ra['Mã hàng'])];
  }, 'thiếu mappingThemCot thì ghi theo vị trí');
});

test('T-HD-14', 'giá trị cột phụ (lô phụ, gửi ở cuối như `sangBang`) vào đúng cột E của sheet', () => {
  const cot = SCHEMA_MAP.concat([COT_LO_PHU]);
  const x = chayGhi({ mapping: [HEAD_NT1] }, goiGhi({ mappingThem: [DONG_MOI.concat(['DD 250; DD250'])], mappingThemCot: cot }));
  dung(x.kq.ok, JSON.stringify(x.kq).slice(0, 200));
  const sh = x.sim.ss.getSheetByName('Mapping_san_pham');
  bang(sh.giaTri[sh.getLastRow() + ':5'], 'DD 250; DD250', 'ô E dòng mới');
  return 'E' + sh.getLastRow() + ' = lô phụ · ' + doiChungAm(() => {
    const y = chayGhi({ mapping: [HEAD_NT1], suaNguon: sua(
      '  var cotNguon = (tenCotDong && tenCotDong.length) ? tenCotDong : SCHEMA.MAPPING;', '  var cotNguon = SCHEMA.MAPPING;') },
    goiGhi({ mappingThem: [DONG_MOI.concat(['DD 250; DD250'])], mappingThemCot: cot }));
    const s2 = y.sim.ss.getSheetByName('Mapping_san_pham');
    return s2.giaTri[s2.getLastRow() + ':5'] === 'DD 250; DD250' ? [] : ['ô E trống'];
  }, 'bỏ qua tên cột máy gửi');
});

test('T-HD-15', 'gói có cột mà sheet Mapping không có → cảnh báo nêu tên cột, các cột khác vẫn đúng chỗ', () => {
  const cot = SCHEMA_MAP.concat([COT_LO_PHU]);
  const x = chayGhi(undefined, goiGhi({ mappingThem: [DONG_MOI.concat(['DD 250'])], mappingThemCot: cot }));
  dung(x.kq.ok, JSON.stringify(x.kq).slice(0, 200));
  const cb = (x.kq.canhBao || []).join(' | ');
  dung(cb.indexOf('"' + COT_LO_PHU + '"') >= 0, 'phải cảnh báo cột thiếu: ' + cb);
  const d = dongMappingCuoi(x.sim);
  bang(d.ra['Mã hàng'], 'MH777');
  return doiChungAm(() => {
    const y = chayGhi({ suaNguon: sua("      if (cot == null) { boQua[tenCot] = 1; return; }", '      if (cot == null) return;') },
      goiGhi({ mappingThem: [DONG_MOI.concat(['DD 250'])], mappingThemCot: cot }));
    const c2 = (y.kq.canhBao || []).join(' | ');
    return c2.indexOf('"' + COT_LO_PHU + '"') >= 0 ? [] : ['không còn cảnh báo'];
  }, 'bỏ âm thầm cột thiếu');
});

console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
if (soHong) {
  hong.forEach((h) => console.log('  ' + h));
  process.exit(1);
}
