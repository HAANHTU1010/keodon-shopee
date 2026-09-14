/**
 * test-tao-thang-moi-web.js — YC-35: HÀNH ĐỘNG `taoThangMoi` TRÊN WEB APP. Chạy: `node node/test-tao-thang-moi-web.js`.
 *
 * Không mạng. Web App giả (`node/gia-lap-web-app.js`) chạy MÃ THẬT `src/ShellAppsScript.gs` + `src/TaoThangMoi.gs`
 * trên hai file tháng THẬT nạp từ `00_DAU_VAO`:
 *   · cặp A (D-45, khuôn chốt tháng 9): `DEMO THÁNG-9-2026-KINH-DOANH-POB.xlsx` → BẢN SAO nguyên vẹn làm vỏ tháng 10
 *     (đúng cách chủ dự án làm: Tệp → Tạo bản sao, đổi tên, dán link vào trường 6 của nút 3);
 *   · cặp B (Phụ lục A.9.1, khuôn tháng 8): `THÁNG-8-2026-KINH-DOANH (1).xlsx` → vỏ tháng 9 dọn tay (bỏ gộp, xóa
 *     giá trị gõ tay, GIỮ công thức) — chấm lại TM-01…TM-12.
 * Google tính lại công thức sau mỗi `flush` được thay bằng `node/tinh-lai-gia-lap.js` (cùng bộ tính của vỏ Excel).
 *
 * Mỗi chỉ tiêu kèm ĐỐI CHỨNG ÂM dựng lại đúng khuyết tật (sửa nguồn qua `suaNguon`) và chứng minh phép chấm LỆCH.
 * Mã bài `TM-W-xx`. TM-W-19…22 (2.6.1): PHÍA MÁY — nút 3 chế độ 1 → `WebAppGoogleSheet.taoThangMoi` → Web App giả, trọn đường.
 */
'use strict';

// YC-41 việc 2 — ghim TRƯỚC mọi thứ: mã `.gs` tự ghi giờ (cờ `DA_KHOI_TAO_<ngày giờ>`, TM-W-01) theo múi giờ dự án Apps Script,
// không theo múi giờ máy đang chạy test. Xem chú thích `node/mui-gio-du-an.js`; bài TM-W-25 chứng minh dòng này có tác dụng.
const MUI_GIO_DU_AN = require('./mui-gio-du-an').ghimMuiGioDuAn();

const fs = require('fs');
const path = require('path');
const gl = require('./gia-lap-web-app');
const { napXlsxVaoGiaLap, r1c1SangA1 } = require('./nap-xlsx-gia-lap');
const { tinhLaiBangTinh } = require('./tinh-lai-gia-lap');

const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });

const SRC = path.join(__dirname, '..', 'src');
const DAU_VAO = path.join(__dirname, '..', '..', '..', '00_DAU_VAO');
const FILE_T9 = path.join(DAU_VAO, 'DEMO THÁNG-9-2026-KINH-DOANH-POB.xlsx');
const FILE_T8 = path.join(DAU_VAO, 'THÁNG-8-2026-KINH-DOANH (1).xlsx');
const GIAN = ['Shopee mall', 'Offood', 'Importmart', 'Babyiu'];
const MAU_VANG = '#FFF2CC';

// ==================================================================== khung test bé

let soDat = 0, soHong = 0;
const hong = [];
async function test(ma, ten, fn) {
  try {
    const t = await fn();
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
/** `fn` dựng lại đúng MỘT khuyết tật, trả danh sách điều phép chấm bắt được. Rỗng = phép chấm mù. */
async function doiChungAm(fn, moTa) {
  const ra = await fn();
  if (!Array.isArray(ra) || !ra.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + String(ra[0]).slice(0, 140) + ') ← đúng như phải thế';
}
const NGUON_GS = ['TaoThangMoi.gs', 'ShellAppsScript.gs'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');
/** Sửa nguồn cho đối chứng âm; mốc phải có ĐÚNG một chỗ, không thì dừng to. */
function sua(moc, thay) {
  const n = NGUON_GS.split(moc).length - 1;
  if (n !== 1) throw new Error('mốc đối chứng âm cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 70) + ' — mã đã đổi, sửa mốc, ĐỪNG bỏ bài');
  return (s) => s.split(moc).join(thay);
}

// ==================================================================== file mẫu & kịch bản

const MAU = {};
async function napMau() {
  for (const [ma, file, ky, ten] of [['T9', FILE_T9, '2026-09', 'DEMO THÁNG-9-2026-KINH-DOANH-POB'],
    ['T8', FILE_T8, '2026-08', 'THÁNG-8-2026-KINH-DOANH']]) {
    const sim = gl.taoGiaLap({});
    const ss = sim.khaiThang(ky, ten);
    await napXlsxVaoGiaLap(ss, file);
    tinhLaiBangTinh(ss);                // Google luôn có giá trị đã tính; bản xuất .xlsx hay thiếu
    MAU[ma] = { ss, ky, ten };
  }
}

/** Chép nguyên một file giả sang file khác (bản sao Google). */
function saoFile(nguon, dich) {
  nguon.getSheets().forEach((sh) => {
    const n = dich.themSheet(sh.ten);
    ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((k) => { n[k] = Object.assign({}, sh[k]); });
    n.gopO = sh.gopO.map((g) => Object.assign({}, g));
    n.soDongToiDa = sh.soDongToiDa;
  });
  return dich;
}

/** Ảnh chụp so sánh được của một file giả (giá trị, công thức, ô gộp). */
function chup(ss) {
  const a = {};
  ss.getSheets().forEach((sh) => {
    const gt = {};
    Object.keys(sh.giaTri).forEach((k) => { const v = sh.giaTri[k]; if (v !== '' && v != null) gt[k] = v instanceof Date ? 'D' + v.getTime() : v; });
    const ct = {};
    Object.keys(sh.congThuc).forEach((k) => { if (sh.congThuc[k]) ct[k] = sh.congThuc[k]; });
    a[sh.ten] = { gt, ct, gop: sh.gopO.map((g) => [g.r1, g.c1, g.r2, g.c2].join(':')).sort() };
  });
  return a;
}
function soOKhac(a, b) {
  let n = 0;
  const ten = new Set(Object.keys(a).concat(Object.keys(b)));
  ten.forEach((t) => {
    const x = a[t] || { gt: {}, ct: {}, gop: [] }, y = b[t] || { gt: {}, ct: {}, gop: [] };
    ['gt', 'ct'].forEach((l) => new Set(Object.keys(x[l]).concat(Object.keys(y[l]))).forEach((k) => { if (x[l][k] !== y[l][k]) n++; }));
    if (x.gop.join('|') !== y.gop.join('|')) n++;
  });
  return n;
}

/**
 * Một lượt bấm nút 3 chế độ 1 (gọi lại khi Web App báo dừng gọn vì giờ).
 * @param {Object} tc { mau:'T9'|'T8', kyMoi, tenMoi, suaNguon, vo(ssMoi, ssCu), sauTinh(ssMoi), body, buocMs, nguongGiay, ngay, toiDaLuot }
 */
async function kichBan(tc) {
  const o = tc || {};
  const m = MAU[o.mau || 'T9'];
  const kyMoi = o.kyMoi || (m.ky === '2026-09' ? '2026-10' : '2026-09');
  const sim = gl.taoGiaLap({ ngay: o.ngay || (kyMoi + '-01T02:00:00Z'), suaNguon: o.suaNguon });
  const ssCu = saoFile(m.ss, sim.khaiThang(m.ky, m.ten));
  const ssMoi = saoFile(m.ss, sim.khaiThang(kyMoi, o.tenMoi || ('THÁNG-' + Number(kyMoi.slice(5)) + '-' + kyMoi.slice(0, 4) + '-KINH-DOANH')));
  if (o.vo) o.vo(ssMoi, ssCu, sim);
  sim.khiFlush = () => { tinhLaiBangTinh(ssMoi); if (o.sauTinh) o.sauTinh(ssMoi); };
  const truocCu = chup(ssCu), truocMoi = chup(ssMoi);
  if (o.buocMs) sim.datBuocDongHo(o.buocMs);
  sim.demLai();
  const body = Object.assign({
    token: sim.biMat, phienBanMongDoi: sim.vo.PHIEN_BAN, hanhDong: 'taoThangMoi',
    thangCu: Number(m.ky.slice(5)), namCu: Number(m.ky.slice(0, 4)), idCu: sim.idCua(m.ky),
    thangMoi: Number(kyMoi.slice(5)), namMoi: Number(kyMoi.slice(0, 4)), idMoi: sim.idCua(kyMoi),
    nguongGiay: o.nguongGiay
  }, o.body || {});
  const kqs = [];
  for (let i = 0; i < (o.toiDaLuot || 1); i++) {
    const kq = JSON.parse(sim.vo.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    kqs.push(kq);
    if (!(kq.ok && kq.xong === false)) break;
    body.buocDungTruoc = kq.buocKe;               // như máy thật: báo lại bước vừa dừng dở
  }
  sim.datBuocDongHo(0);
  return { sim, ssCu, ssMoi, kq: kqs[kqs.length - 1], kqs, truocCu, truocMoi, kyMoi };
}

/** Số ô công thức của một cột từ dòng 4, dòng đầu và dòng cuối. */
function demCT(sh, c) {
  let n = 0, dau = 0, cuoi = 0;
  Object.keys(sh.congThuc).forEach((k) => {
    const [r, cc] = k.split(':').map(Number);
    if (cc !== c || r < 4 || !sh.congThuc[k]) return;
    n++; if (!dau || r < dau) dau = r; if (r > cuoi) cuoi = r;
  });
  return { n, dau, cuoi };
}
const A1 = (sh, r, c) => (sh.congThuc[r + ':' + c] ? r1c1SangA1(sh.congThuc[r + ':' + c], r, c).slice(1) : null);
const cot = (ch) => ch.charCodeAt(0) - 64;
/** Ô gõ tay (không công thức) còn lại từ dòng `r1` ở các cột `1..c2`. */
function oDuLieu(sh, r1, c2) {
  return Object.keys(sh.giaTri).filter((k) => {
    const [r, c] = k.split(':').map(Number);
    const v = sh.giaTri[k];
    return r >= r1 && c <= c2 && v !== '' && v != null && !sh.congThuc[k];
  });
}
const coTM = (ss, r) => { const sh = ss.getSheetByName('Mapping_san_pham'); return sh ? sh.giaTri[r + ':15'] : undefined; };

/** Kiểm vùng công thức 2.000 dòng của cặp A; trả danh sách lệch. */
function lechCongThuc2000(ssMoi) {
  const lech = [];
  const cotCan = {
    'Shopee mall': 'EFLMN', Offood: 'EFLMN', Importmart: 'EFLMN', Babyiu: 'EFLMN', 'TikTok Shop': 'EFLOP',
    'Tổng nhập': 'CEFG', 'Đơn ngoài': 'FGMNO'
  };
  Object.keys(cotCan).forEach((t) => {
    const sh = ssMoi.getSheetByName(t);
    if (!sh) { lech.push('thiếu sheet ' + t); return; }
    cotCan[t].split('').forEach((ch) => {
      const d = demCT(sh, cot(ch));
      if (d.n !== 2000 || d.dau !== 4 || d.cuoi !== 2003) lech.push(t + '!' + ch + ' ' + d.n + ' ô (' + d.dau + '→' + d.cuoi + ')');
    });
  });
  return lech;
}

// ====================================================================================================

(async function chay() {
  console.log('=== YC-35: HÀNH ĐỘNG taoThangMoi TRÊN WEB APP ===\n');
  for (const f of [FILE_T9, FILE_T8]) {
    if (!fs.existsSync(f)) { console.log('HỎNG  thiếu file dữ liệu thật: ' + f); process.exit(1); }
  }
  await napMau();

  // ---------------------------------------------------------------- cặp A: bản sao tháng 9 → tháng 10
  console.log('--- cặp A (D-45): DEMO tháng 9 khuôn mới → BẢN SAO làm tháng 10 ---');
  const A = await kichBan({});

  await test('TM-W-01', 'chạy trọn: 8/8 phép K đạt, cờ DA_KHOI_TAO_, tháng 2026-10, nguồn là TÊN file (không phải ID), B7', async () => {
    dung(A.kq.ok === true && A.kq.xong === true, 'phải xong: ' + JSON.stringify(A.kq).slice(0, 400));
    bang((A.kq.kiem || []).filter((p) => p.dat).length, 8, '8 phép K');
    dung(/^DA_KHOI_TAO_2026-10-01 09:00$/.test(coTM(A.ssMoi, 1)), 'O1: ' + coTM(A.ssMoi, 1));
    bang(coTM(A.ssMoi, 2), '2026-10');
    bang(coTM(A.ssMoi, 3), MAU.T9.ten, 'NGUON_CLONE ghi TÊN file tháng cũ');
    bang(coTM(A.ssMoi, 5), 'B7');
    const id = [A.sim.idCua('2026-09'), A.sim.idCua('2026-10')];
    const oCoId = [];
    A.ssMoi.getSheets().forEach((sh) => Object.keys(sh.giaTri).forEach((k) => {
      if (id.some((x) => String(sh.giaTri[k]).indexOf(x) >= 0)) oCoId.push(sh.ten + '!' + k);
    }));
    bang(oCoId, [], 'không ô nào của file tháng mới chứa ID');
    return A.kq.kiem.map((p) => p.ma + ' ' + p.chiTiet).join(' · ').slice(0, 300) + ' · ' + await doiChungAm(async () => {
      const x = await kichBan({ suaNguon: sua("nguonClone: ssCu.getName(), thoiDiem", 'nguonClone: idCu, thoiDiem') });
      return String(coTM(x.ssMoi, 3)).indexOf(x.sim.idCua('2026-09')) >= 0 ? ['O3 chứa ID file tháng cũ'] : [];
    }, 'ghi ID vào NGUON_CLONE');
  });

  await test('TM-W-02', 'D-57/YC-39.3: E/F/L/M/N của 4 gian, E/F/L/O/P `TikTok Shop`, C/E/F/G `Tổng nhập`, cột công thức ' +
    '`Đơn ngoài` — mỗi cột ĐÚNG 2.000 ô liền dải 4 → 2003; không còn đơn, không còn ô gộp từ dòng 4; H3:L3 = SUM(x4:x2000)', async () => {
    bang(lechCongThuc2000(A.ssMoi), []);
    const loi = [];
    GIAN.concat(['TikTok Shop']).forEach((t) => {
      const sh = A.ssMoi.getSheetByName(t);
      const d = oDuLieu(sh, 4, t === 'TikTok Shop' ? 16 : 15);
      if (d.length) loi.push(t + ' còn ' + d.length + ' ô dữ liệu từ dòng 4 (vd ' + d[0] + ')');
      if (sh.gopO.some((g) => g.r2 >= 4)) loi.push(t + ' còn ô gộp từ dòng 4');
      'HIJKL'.split('').forEach((ch) => { if (A1(sh, 3, cot(ch)) !== 'SUM(' + ch + '4:' + ch + '2000)') loi.push(t + '!' + ch + '3=' + A1(sh, 3, cot(ch))); });
    });
    bang(loi, []);
    return 'Shopee mall E ' + demCT(A.ssMoi.getSheetByName('Shopee mall'), 5).n + ' ô · TikTok Shop P ' +
      demCT(A.ssMoi.getSheetByName('TikTok Shop'), 16).n + ' ô · ' + await doiChungAm(async () => {
      const x = await kichBan({ suaNguon: sua("tt.push({ loai: 'KEO_CT', sheet: ten, c: C(chu), r1: 4, r2: DONG_KEO_CT });\n    });\n    return { thaoTac: tt, gieo: gieo",
        "tt.push({ loai: 'KEO_CT', sheet: ten, c: C(chu), r1: 4, r2: DONG_KEO_CT - 1 });\n    });\n    return { thaoTac: tt, gieo: gieo") });
      return lechCongThuc2000(x.ssMoi);
    }, 'kéo thiếu 1 dòng (tới 2002)');
  });

  await test('TM-W-03', '`Tổng nhập`: đủ mọi mã danh mục (kể cả tồn 0), H = tồn cuối tháng cũ, J (Ngày nhập) trống, I2 = SUM(I4:I2000)', async () => {
    const shTon = A.ssCu.getSheetByName('Tổng tồn kho');
    const tonCu = {};
    for (let r = 3; r <= shTon.getLastRow(); r++) {
      const ten = shTon.giaTri[r + ':4'];
      if (ten != null && String(ten).trim() !== '') tonCu[String(ten).trim()] = Number(shTon.giaTri[r + ':8']) || 0;
    }
    const shN = A.ssMoi.getSheetByName('Tổng nhập');
    const khoi = {}, coNgay = [];
    for (let r = 4; r <= 2003; r++) {
      const d = shN.giaTri[r + ':4'];
      if (d == null || String(d).trim() === '') continue;
      khoi[String(d).trim()] = Number(shN.giaTri[r + ':8']);
      if (shN.giaTri[r + ':10'] != null && shN.giaTri[r + ':10'] !== '') coNgay.push(r);
    }
    const lech = Object.keys(tonCu).filter((t) => khoi[t] !== tonCu[t]).map((t) => t + ': ' + khoi[t] + '≠' + tonCu[t]);
    bang(Object.keys(khoi).length, Object.keys(tonCu).length, 'số dòng đầu kỳ');
    bang(lech, [], 'tồn từng mã');
    bang(coNgay, [], 'Ngày nhập phải trống');
    bang(A1(shN, 2, 9), 'SUM(I4:I2000)');
    const soTon0 = Object.keys(tonCu).filter((t) => tonCu[t] === 0).length;
    return Object.keys(khoi).length + ' dòng (' + soTon0 + ' mã tồn 0) · ' + await doiChungAm(async () => {
      const x = await kichBan({ suaNguon: sua('    danhMuc.forEach(function (m) {\n      tt.push(', '    danhMuc.forEach(function (m) {\n      if (!m.ton) return;\n      tt.push(') });
      const n = x.ssMoi.getSheetByName('Tổng nhập');
      let dem = 0;
      for (let r = 4; r <= 2003; r++) if (n.giaTri[r + ':4'] != null && String(n.giaTri[r + ':4']).trim() !== '') dem++;
      return dem !== Object.keys(tonCu).length ? ['còn ' + dem + ' dòng, rơi ' + (Object.keys(tonCu).length - dem) + ' mã tồn 0 (lỗi gvs km 1)'] : [];
    }, 'bỏ mã tồn 0');
  });

  await test('TM-W-04', '`Lợi nhuận` theo KHUÔN FILE: D5=10, E5=9; cột D chép nguyên văn 10 công thức tháng 9 (D7 có `TikTok Shop`, ' +
    'D11=SUM(D12:D18), D13/D15…D18 từ `Chi Phí Hàng Ngày`); D9,D10,D14 trống; E6:E18 là giá trị cứng = D tháng 9; gộp B3:E3, D4:E4', async () => {
    const cu = A.ssCu.getSheetByName('Lợi nhuận'), moi = A.ssMoi.getSheetByName('Lợi nhuận');
    bang([moi.giaTri['5:4'], moi.giaTri['5:5']], [10, 9]);
    const lech = [];
    for (let r = 6; r <= 18; r++) {
      const ctCu = A1(cu, r, 4);
      if (ctCu) { if (A1(moi, r, 4) !== ctCu) lech.push('D' + r + '=' + A1(moi, r, 4) + ' ≠ ' + ctCu); }
      else if ((moi.giaTri[r + ':4'] !== '' && moi.giaTri[r + ':4'] != null) || moi.congThuc[r + ':4']) lech.push('D' + r + ' phải trống');
      if (moi.congThuc[r + ':5']) lech.push('E' + r + ' còn công thức');
      const a = Number(cu.giaTri[r + ':4']) || 0, b = Number(moi.giaTri[r + ':5']) || 0;
      if (Math.abs(a - b) > 0.01) lech.push('E' + r + '=' + b + ' ≠ ' + a);
    }
    dung(/'TikTok Shop'!L3/.test(A1(moi, 7, 4) || ''), 'D7 phải cộng TikTok Shop: ' + A1(moi, 7, 4));
    bang(A1(moi, 11, 4), 'SUM(D12:D18)');
    bang(lech, []);
    const gop = moi.gopO.filter((g) => g.r1 <= 5).map((g) => [g.r1, g.c1, g.r2, g.c2].join(':')).sort();
    dung(gop.indexOf('3:2:3:5') >= 0 && gop.indexOf('4:4:4:5') >= 0, 'ô gộp tiêu đề/năm: ' + gop.join(' '));
    return 'D7 = ' + A1(moi, 7, 4) + ' · ' + await doiChungAm(async () => {
      // Bản trước: viết cứng năm công thức khuôn tháng 8 → mất 'TikTok Shop'!L3 và năm dòng chi phí.
      const x = await kichBan({ suaNguon: sua('      ctD.push(t != null && laCongThucThamChieu(t) ? t : null);',
        '      ctD.push(t != null && [6, 7, 8, 11, 12].indexOf(r) >= 0 && laCongThucThamChieu(t) ? t : null);') });
      const m2 = x.ssMoi.getSheetByName('Lợi nhuận');
      return [13, 15, 16, 17, 18].filter((r) => !m2.congThuc[r + ':4']).map((r) => 'D' + r + ' mất công thức');
    }, 'chỉ dựng năm công thức khuôn tháng 8');
  });

  await test('TM-W-05', '`TikTok Shop` dọn như gian hàng (dòng 1–3 y nguyên, Q3=L3); `Chi Phí Hàng Ngày` giữ dòng 1–2, xóa dữ liệu từ dòng 3', async () => {
    const tsC = A.ssCu.getSheetByName('TikTok Shop'), tsM = A.ssMoi.getSheetByName('TikTok Shop');
    const lech = [];
    // Dòng 1–3 y nguyên — trừ H3:L3 (tool dựng lại SUM) và Q3 (Còn Nợ dựng lại =L3), đều là ô công thức.
    for (let r = 1; r <= 3; r++) {
      for (let c = 1; c <= 19; c++) {
        const k = r + ':' + c;
        if (r === 3 && ((c >= 8 && c <= 12) || c === 17)) continue;
        if (tsC.congThuc[k] !== tsM.congThuc[k]) lech.push('TikTok Shop ' + k + ' công thức');
        else if (!tsC.congThuc[k] && JSON.stringify(tsC.giaTri[k]) !== JSON.stringify(tsM.giaTri[k])) lech.push('TikTok Shop ' + k + ' giá trị');
      }
    }
    bang(A1(tsM, 3, 17), 'L3', 'Còn Nợ Q3');
    bang(oDuLieu(tsM, 4, 16), [], 'TikTok Shop còn dữ liệu');
    const cpC = A.ssCu.getSheetByName('Chi Phí Hàng Ngày'), cpM = A.ssMoi.getSheetByName('Chi Phí Hàng Ngày');
    for (let r = 1; r <= 2; r++) for (let c = 1; c <= 9; c++) {
      const k = r + ':' + c;
      if (cpC.congThuc[k] !== cpM.congThuc[k]) lech.push('Chi Phí ' + k + ' công thức đổi');
      if (!cpC.congThuc[k] && JSON.stringify(cpC.giaTri[k]) !== JSON.stringify(cpM.giaTri[k])) lech.push('Chi Phí ' + k + ' giá trị đổi');
    }
    bang(oDuLieu(cpM, 3, 4), [], 'Chi Phí còn dữ liệu A..D từ dòng 3');
    bang(lech, []);
    return 'Chi Phí tháng 9 có ' + oDuLieu(cpC, 3, 4).length + ' ô dữ liệu → tháng 10 còn 0 · ' + await doiChungAm(async () => {
      const x = await kichBan({ suaNguon: sua('    var ssCP = sheet(anhMoi, SHEET_CHI_PHI);\n    if (ssCP) {', '    var ssCP = null;\n    if (ssCP) {') });
      return oDuLieu(x.ssMoi.getSheetByName('Chi Phí Hàng Ngày'), 3, 4).slice(0, 3).map((k) => 'còn ' + k);
    }, 'không dọn Chi Phí Hàng Ngày');
  });

  await test('TM-W-06', '`Mapping_san_pham` chép đủ dòng, chép xong TÔ LẠI (CÓ → trắng, chưa CÓ → vàng), khối N1:O5 đủ nhãn', async () => {
    // Bảng DEMO đã CÓ hết 317 dòng — bỏ CÓ ở năm dòng (cả hai file, như user chưa soát) để phép tô có cái mà chấm.
    const boCo = (ssMoi, ssCu) => [ssMoi, ssCu].forEach((ss) => { for (let r = 2; r <= 6; r++) ss.getSheetByName('Mapping_san_pham').giaTri[r + ':7'] = ''; });
    const X = await kichBan({ vo: boCo });
    dung(X.kq.ok === true, 'phải xong: ' + String(X.kq.thongBao).slice(0, 200));
    const mp = X.ssMoi.getSheetByName('Mapping_san_pham');
    let co = 0, vang = 0, sai = [];
    for (let r = 2; r <= mp.getLastRow(); r++) {
      if (!mp.giaTri[r + ':2']) continue;
      const laCo = lop.MapListing.laCo(mp.giaTri[r + ':7']);
      const nen = String(mp.nen[r + ':1'] || '').toUpperCase();
      if (laCo) { co++; if (nen === MAU_VANG) sai.push('dòng ' + r + ' CÓ mà vàng'); } else { vang++; if (nen !== MAU_VANG) sai.push('dòng ' + r + ' chưa CÓ mà không vàng'); }
    }
    bang(sai.slice(0, 5), []);
    bang([1, 2, 3, 4, 5].map((r) => mp.giaTri[r + ':14']), ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG']);
    return co + ' dòng CÓ · ' + vang + ' dòng vàng · ' + await doiChungAm(async () => {
      const x = await kichBan({ vo: boCo, suaNguon: sua("      if (b.ma === 'B6') toLaiMapping_(ssMoi, canhBao);", '') });
      const m2 = x.ssMoi.getSheetByName('Mapping_san_pham');
      let khongVang = 0;
      for (let r = 2; r <= m2.getLastRow(); r++) if (m2.giaTri[r + ':2'] && !lop.MapListing.laCo(m2.giaTri[r + ':7']) && String(m2.nen[r + ':1'] || '').toUpperCase() !== MAU_VANG) khongVang++;
      return khongVang ? [khongVang + ' dòng chưa CÓ không vàng'] : [];
    }, 'bỏ bước tô lại sau B6');
  });

  await test('TM-W-07', 'KHÔNG ĐỤNG FILE THÁNG CŨ: file tháng 9 y nguyên từng ô sau khi tạo tháng 10', async () => {
    bang(soOKhac(A.truocCu, chup(A.ssCu)), 0, 'số ô file cũ bị đổi');
    return '0 ô đổi · ' + await doiChungAm(async () => {
      const x = await kichBan({ suaNguon: sua("      ghiCoTM_(ssMoi, 1, 'DA_KHOI_TAO_' + ke.nhanThoiDiem);", "      ghiCoTM_(ssCu, 1, 'DA_KHOI_TAO_' + ke.nhanThoiDiem);") });
      const n = soOKhac(x.truocCu, chup(x.ssCu));
      return n ? [n + ' ô file cũ bị đổi'] : [];
    }, 'ghi cờ nhầm vào file cũ');
  });

  await test('TM-W-08', 'bấm lại lần hai trên file ĐÃ khởi tạo → DỪNG `DA_KHOI_TAO`, không một lệnh ghi nào', async () => {
    const x = await kichBan({ vo: (ssMoi) => { saoKetQua(A.ssMoi, ssMoi); } });
    bang(x.kq.loi, 'DA_KHOI_TAO');
    bang(x.sim.nhatKyGhi.length, 0, 'lệnh ghi');
    return String(x.kq.thongBao).slice(0, 90) + '… · ' + await doiChungAm(async () => {
      const y = await kichBan({
        vo: (ssMoi) => { saoKetQua(A.ssMoi, ssMoi); },
        suaNguon: sua("    // Luật một chiều: đã khởi tạo rồi thì KHÔNG BAO GIỜ khởi tạo lại, kể cả khi người dùng bấm lại nút.\n    if (/^DA_KHOI_TAO_/.test(trangThai)) {",
          "    // (đối chứng âm: gỡ luật một chiều)\n    if (false) {")
      });
      // Gỡ luật một chiều thì tầng R-1…R-4 vẫn chặn (khối đầu kỳ tháng 10 KHÁC tháng 9), nhưng câu trả lời không
      // còn là "đã khởi tạo" — người bấm nhận một lý do sai. Phép chấm mã lỗi phải nhìn thấy điều đó.
      return y.kq.loi !== 'DA_KHOI_TAO' ? ['trả ' + y.kq.loi + ' thay vì DA_KHOI_TAO, ' + y.sim.nhatKyGhi.length + ' lệnh ghi'] : [];
    }, 'gỡ luật một chiều');
  });

  await test('TM-W-09', 'bản sao mang cờ DA_KHOI_TAO của THÁNG CŨ (O2 = 2026-09) → vẫn tạo được tháng 10; cờ không ghi tháng → dừng (không đoán)', async () => {
    const datCo = (thang) => (ssMoi, ssCu) => [ssMoi, ssCu].forEach((ss) => {
      const mp = ss.getSheetByName('Mapping_san_pham');
      ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG'].forEach((n, i) => { mp.giaTri[(i + 1) + ':14'] = n; });
      mp.giaTri['1:15'] = 'DA_KHOI_TAO_2026-09-01 08:00'; mp.giaTri['2:15'] = thang; mp.giaTri['3:15'] = 'THÁNG-8'; mp.giaTri['4:15'] = 'GD3-v1.0'; mp.giaTri['5:15'] = 'B7';
    });
    const x = await kichBan({ vo: datCo('2026-09') });
    dung(x.kq.ok === true, 'bản sao cờ tháng cũ phải chạy: ' + String(x.kq.thongBao).slice(0, 200));
    dung((x.kq.nhatKy || []).some((t) => /chép theo bản sao/.test(t)), 'phải NÓI RA là bỏ qua cờ của tháng cũ');
    const y = await kichBan({ vo: datCo('') });
    bang(y.kq.loi, 'DA_KHOI_TAO', 'cờ không ghi tháng → giữ luật một chiều');
    return await doiChungAm(async () => {
      const z = await kichBan({ vo: datCo('2026-09'), suaNguon: sua("if (thangMoi && thangCo && thangCo !== String(thangMoi) && /^(DA|DANG)_KHOI_TAO_/.test(trangThai)) {", 'if (false) {') });
      return z.kq.ok ? [] : ['bản sao bị chặn oan: ' + z.kq.loi];
    }, 'không nhận ra cờ của tháng cũ');
  });

  await test('TM-W-10', 'R-1…R-4 trên bản sao: user gõ THÊM hay SỬA một ô (đơn gian hàng, TikTok Shop, Tổng nhập, Chi Phí, Lợi nhuận) → DỪNG `FILE_CO_DU_LIEU`, không ghi ô nào', async () => {
    const ca = [
      ['R-2', 'Shopee mall', (ss) => { const sh = ss.getSheetByName('Shopee mall'); sh.giaTri['40:3'] = 'DONMOI10T1'; sh.giaTri['40:4'] = 'dt5'; }],
      ['R-2', 'TikTok Shop', (ss) => { ss.getSheetByName('TikTok Shop').giaTri['30:4'] = 'Teddy Nâu'; }],
      ['R-1', 'Tổng nhập', (ss) => { const sh = ss.getSheetByName('Tổng nhập'); sh.giaTri['5:8'] = (Number(sh.giaTri['5:8']) || 0) + 1; }],
      ['R-3', 'Chi Phí Hàng Ngày', (ss) => { const sh = ss.getSheetByName('Chi Phí Hàng Ngày'); sh.giaTri['300:1'] = new Date(2026, 9, 1); sh.giaTri['300:4'] = 50000; }],
      ['R-4', 'Lợi nhuận', (ss) => { ss.getSheetByName('Lợi nhuận').giaTri['9:4'] = 123456; }]
    ];
    const ra = [];
    for (const [ma, ten, doi] of ca) {
      const x = await kichBan({ vo: doi });
      bang(x.kq.loi, 'FILE_CO_DU_LIEU', ma + ' ' + ten);
      dung(String(x.kq.thongBao).indexOf('Phép ' + ma) >= 0, ma + ' phải nêu tên phép: ' + x.kq.thongBao);
      bang(x.sim.nhatKyGhi.length, 0, ma + ' lệnh ghi');
      ra.push(ma + '/' + ten);
    }
    return ra.join(' · ') + ' · ' + await doiChungAm(async () => {
      const x = await kichBan({ vo: ca[0][2], suaNguon: sua('        if (ssCu && oCoDuLieu(ssCu, r, c) && giongNhau(o(ss, r, c), o(ssCu, r, c))) { kq.soOBanSao++; continue; }', '        if (ssCu) { kq.soOBanSao++; continue; }') });
      return x.kq.ok ? ['đơn user gõ thêm bị coi là bản sao, tool chạy và XÓA mất'] : [];
    }, 'coi mọi ô là bản sao');
  });

  await test('TM-W-11', 'ô CÔNG THỨC trả kết quả (kể cả chữ) KHÔNG phải dữ liệu: vỏ dọn tay còn nguyên công thức vẫn qua R-1…R-3', async () => {
    const vo = (ssMoi) => {
      ['Shopee mall', 'Offood', 'Importmart', 'Babyiu', 'TikTok Shop', 'Đơn ngoài', 'Tổng nhập'].forEach((t) => {
        const sh = ssMoi.getSheetByName(t);
        Object.keys(sh.giaTri).forEach((k) => {
          const r = Number(k.split(':')[0]);
          if (r >= 4 && !sh.congThuc[k]) delete sh.giaTri[k];
        });
        sh.gopO = sh.gopO.filter((g) => g.r2 < 4);
        // Vỏ lấy từ khuôn đã kéo công thức DÀI HƠN tháng cũ (tới dòng 2003): ô công thức ở chỗ tháng cũ không có ô
        // nào, và đang HIỂN THỊ chữ. Phép so với bản sao không che được ca này — chỉ luật "ô công thức không phải dữ
        // liệu" giữ cho vỏ khỏi bị chấm oan.
        const mau = Object.keys(sh.congThuc).find((k) => Number(k.split(':')[0]) === 4 && sh.congThuc[k]);
        if (!mau) return;
        const c = Number(mau.split(':')[1]);
        for (let r = 1500; r <= 1510; r++) { sh.congThuc[r + ':' + c] = sh.congThuc[mau]; sh.giaTri[r + ':' + c] = 'Gấu Teddy Nâu'; }
        sh.soDongToiDa = Math.max(sh.soDongToiDa || 1000, 2003);
      });
    };
    const x = await kichBan({ vo });
    dung(x.kq.ok === true, 'vỏ dọn tay phải chạy: ' + String(x.kq.thongBao).slice(0, 300));
    return await doiChungAm(async () => {
      // Luật nằm ở HAI lớp: vỏ chụp ảnh để `giaTri` của ô công thức là null, lõi `oCoDuLieu` bỏ qua ô công thức.
      // Gỡ cả hai (đúng lỗi "đọc giá trị hiển thị rồi coi mọi ô có chữ là dữ liệu") thì vỏ rỗng phải bị chấm oan.
      const goLop1 = sua("      if (f) { a.push(null); b.push(String(f).replace(/^=/, '')); d.push(rong ? null : v); }",
        "      if (f) { a.push(rong ? null : v); b.push(String(f).replace(/^=/, '')); d.push(rong ? null : v); }");
      const goLop2 = sua('  function oCoDuLieu(ss, r, c) {\n    if (ct(ss, r, c) != null) return false;', '  function oCoDuLieu(ss, r, c) {');
      const y = await kichBan({ vo, suaNguon: (src) => goLop2(goLop1(src)) });
      return y.kq.ok ? [] : ['vỏ rỗng bị chấm "có dữ liệu": ' + y.kq.loi + ' — ' + String(y.kq.thongBao).slice(0, 80)];
    }, 'coi ô công thức đang hiển thị chữ là dữ liệu');
  });

  await test('TM-W-12', 'B5 không chạy lại được: cờ B5_DANG_LAM → DỪNG, `Lợi nhuận` không chèn thêm cột; B5_DA_CHEN → bỏ qua chèn', async () => {
    const coDo = (moc) => (ssMoi) => {
      const mp = ssMoi.getSheetByName('Mapping_san_pham');
      ['TRANG_THAI_KHOI_TAO', 'THANG', 'NGUON_CLONE', 'PHIEN_BAN_TOOL', 'BUOC_DA_XONG'].forEach((n, i) => { mp.giaTri[(i + 1) + ':14'] = n; });
      mp.giaTri['1:15'] = 'DANG_KHOI_TAO_2026-10-01 08:00'; mp.giaTri['2:15'] = '2026-10'; mp.giaTri['3:15'] = MAU.T9.ten; mp.giaTri['4:15'] = 'GD3-v1.0'; mp.giaTri['5:15'] = moc;
    };
    const x = await kichBan({ vo: coDo('B5_DANG_LAM') });
    bang(x.kq.loi, 'B5_DANG_LAM');
    bang(soOKhac(x.truocMoi, chup(x.ssMoi)), 0, 'file mới không được đổi');
    // B5_DA_CHEN: cột đã chèn ở lần trước (dựng tay đúng trạng thái đó) → tool không chèn thêm.
    const y = await kichBan({
      vo: (ssMoi, ssCu, sim) => { coDo('B5_DA_CHEN')(ssMoi); ssMoi.getSheetByName('Lợi nhuận').insertColumnBefore(4); sim.nhatKyGhi.length = 0; }
    });
    const ln = y.ssMoi.getSheetByName('Lợi nhuận');
    bang([ln.giaTri['5:4'], ln.giaTri['5:5'], ln.giaTri['5:6']], [10, 9, undefined], 'D5/E5/F5 sau B5_DA_CHEN');
    return 'B5_DANG_LAM → dừng · B5_DA_CHEN → D5=10, E5=9, không cột thứ hai · ' + await doiChungAm(async () => {
      const z = await kichBan({ vo: coDo('B5_DANG_LAM'), suaNguon: sua("    if (m === 'B5_DANG_LAM') {", '    if (false) {') });
      const l2 = z.ssMoi.getSheetByName('Lợi nhuận');
      return l2.giaTri['5:5'] === 9 && l2.giaTri['5:4'] === 10 && z.kq.loi !== 'B5_DANG_LAM' ? ['chèn cột lần hai lên file đang dở'] : [];
    }, 'bỏ cờ B5_DANG_LAM');
  });

  await test('TM-W-13', 'chạm ngưỡng giờ giữa chừng → dừng gọn, gọi lại chạy TIẾP từ BUOC_DA_XONG; kết quả cuối y hệt chạy một hơi (một cột chèn)', async () => {
    // Ca (a) — dừng ĐÚNG RANH GIỚI BƯỚC: 300 ms mỗi lần hỏi giờ, ngưỡng 20 giây → lượt 1 làm xong B3, B4, B5a rồi
    // dừng. Lượt 2 phải bắt đầu từ B5b: làm lại B5a là chèn cột `Lợi nhuận` lần hai.
    const buocXong = (k) => (k.nhatKy || []).map((t) => (/^(B\d\w?) · .* — xong$/.exec(t) || [])[1]).filter(Boolean);
    const x = await kichBan({ buocMs: 300, nguongGiay: 20, toiDaLuot: 40 });
    dung(x.kq.ok === true && x.kq.xong === true, 'lượt cuối phải xong: ' + JSON.stringify(x.kq).slice(0, 300));
    dung(x.kqs.length >= 2 && x.kqs[0].xong === false, 'phải dừng gọn ít nhất một lần rồi chạy tiếp, được ' + x.kqs.length + ' lượt');
    const theoLuot = x.kqs.map(buocXong);
    const lamLai = theoLuot.slice(1).reduce((a, ds, i) => a.concat(ds.filter((m) => theoLuot.slice(0, i + 1).some((d) => d.indexOf(m) >= 0))), []);
    bang(lamLai, [], 'bước đã xong ở lượt trước bị làm lại');
    bang(soOKhac(chupBoCo(A.ssMoi), chupBoCo(x.ssMoi)), 0, 'khác bản chạy một hơi');
    bang(coTM(x.ssMoi, 5), 'B7', 'cờ tiến độ cuối');
    // Ca (b) — MỘT BƯỚC DÀI HƠN NGƯỠNG: 450 ms → B3 không xong nổi trong một lượt; lượt sau chạy B3 tới cùng.
    const y = await kichBan({ buocMs: 450, nguongGiay: 20, toiDaLuot: 40 });
    dung(y.kq.ok === true && y.kq.xong === true && y.kqs[0].buocKe === 'B3', 'ca bước dài: ' + JSON.stringify(y.kq).slice(0, 200));
    bang(soOKhac(chupBoCo(A.ssMoi), chupBoCo(y.ssMoi)), 0, 'ca bước dài khác bản chạy một hơi');
    return '(a) ' + theoLuot.map((d, i) => 'lượt ' + (i + 1) + ': ' + (d.join(',') || '—')).join(' · ') + ' · (b) ' + y.kqs.length +
      ' lượt · ' + await doiChungAm(async () => {
      const z = await kichBan({ buocMs: 300, nguongGiay: 20, toiDaLuot: 40, suaNguon: sua('      ghiCoTM_(ssMoi, 5, b.mocSau);\n', '') });
      const khac = soOKhac(chupBoCo(A.ssMoi), chupBoCo(z.ssMoi));
      return (!z.kq.ok || z.kq.xong === false || khac)
        ? ['không ghi cờ tiến độ: ' + (z.kq.loi || (z.kq.xong === false ? 'chưa xong' : 'ok')) + ', lệch ' + khac + ' ô'] : [];
    }, 'không ghi BUOC_DA_XONG sau mỗi bước') + ' · ' + await doiChungAm(async () => {
      const y = await kichBan({ buocMs: 450, nguongGiay: 20, toiDaLuot: 12,
        suaNguon: sua('      var epXong = body.buocDungTruoc != null && String(body.buocDungTruoc) === b.ma;', '      var epXong = false;') });
      return y.kq.xong === false ? ['sau ' + y.kqs.length + ' lượt vẫn kẹt ở ' + y.kq.buocKe] : [];
    }, 'bỏ luật chạy tới cùng bước vừa dừng dở');
  });

  await test('TM-W-14', 'tự kiểm LỆCH (sót doanh số ở Shopee mall!L3) → ok:false TU_KIEM_LECH, GIỮ cờ DANG_KHOI_TAO_', async () => {
    const sauTinh = (ss) => { ss.getSheetByName('Shopee mall').giaTri['3:12'] = 999000; ss.getSheetByName('Lợi nhuận').giaTri['7:4'] = 999000; };
    const x = await kichBan({ sauTinh });
    bang(x.kq.loi, 'TU_KIEM_LECH');
    dung(x.kq.kiem.some((p) => p.ma === 'K-7' && !p.dat), 'K-7 phải lệch');
    dung(/^DANG_KHOI_TAO_/.test(coTM(x.ssMoi, 1)), 'O1 phải giữ DANG: ' + coTM(x.ssMoi, 1));
    return await doiChungAm(async () => {
      const y = await kichBan({ sauTinh, suaNguon: sua('    if (kiem.dat) {\n      ghiCoTM_(', '    if (true) {\n      ghiCoTM_(') });
      return /^DA_KHOI_TAO_/.test(coTM(y.ssMoi, 1)) ? ['đánh dấu hoàn tất dù K-7 lệch'] : [];
    }, 'đánh dấu hoàn tất khi lệch');
  });

  await test('TM-W-15', 'cửa tham số: hai link cùng một file → TRUNG_FILE; tháng 13 → THAM_SO_SAI; tên file lệch tháng → SAI_THANG_FILE; máy khác giữ khóa → DANG_BAN; sai chuỗi bí mật → SAI_BI_MAT — đều 0 lệnh ghi', async () => {
    const ID_T9 = 'ID_FILE_2026_09_GIA_LAP_KEODON';       // `sim.idCua('2026-09')` — cùng quy ước ở mọi bản giả lập
    const ca = [
      ['TRUNG_FILE', { body: { idMoi: ID_T9 } }],
      ['THAM_SO_SAI', { body: { thangMoi: 13 } }],
      ['SAI_THANG_FILE', { tenMoi: 'THÁNG-11-2026-KINH-DOANH' }],
      ['DANG_BAN', { vo: (a, b, sim) => { sim.khoaBiMayKhacGiu = true; } }],
      ['SAI_BI_MAT', { body: { token: 'sai-chuoi' } }]
    ];
    const ra = [];
    for (const [ma, tc] of ca) {
      const x = await kichBan(tc);
      bang(x.kq.loi, ma, ma);
      bang(x.sim.nhatKyGhi.length, 0, ma + ' lệnh ghi');
      ra.push(ma);
    }
    return ra.join(' · ') + ' · ' + await doiChungAm(async () => {
      const y = await kichBan({ body: { idMoi: ID_T9 }, suaNguon: sua('  if (idCu === idMoi) {', '  if (false) {') });
      return y.kq.loi !== 'TRUNG_FILE' ? ['hai link cùng file mà vẫn chạy: ' + (y.kq.loi || 'ok') + ', ' + y.sim.nhatKyGhi.length + ' lệnh ghi'] : [];
    }, 'gỡ chặn hai link trùng');
  });

  await test('TM-W-16', 'không lọt ID/link file tháng vào phản hồi hay nhật ký Apps Script', async () => {
    // Gọi thẳng doPost nên phản hồi không đi qua `chuOiDaTraVe` — quét cả thân phản hồi.
    const quet = (sim, kqs) => {
      const toan = sim.chuOiDaTraVe.concat(sim.nhatKy, (kqs || []).map((k) => JSON.stringify(k))).join('\n');
      return ['2026-09', '2026-10'].filter((k) => toan.indexOf(sim.idCua(k)) >= 0).concat(/docs\.google\.com/.test(toan) ? ['link'] : []);
    };
    bang(quet(A.sim, A.kqs), [], 'cặp A');
    return await doiChungAm(async () => {
      const y = await kichBan({ suaNguon: sua('tenFileMoi: ssMoi.getName(), tenFileCu: ssCu.getName(),', 'tenFileMoi: ssMoi.getName(), tenFileCu: idCu,') });
      return quet(y.sim, y.kqs);
    }, 'trả ID trong phản hồi');
  });

  await test('TM-W-17', 'quota: mọi lệnh ghi bảng ≤ 200 dòng; khối đầu kỳ `Tổng nhập` ghi bằng MỘT lệnh; tổng lệnh ghi < 400', async () => {
    const ghiBang = A.sim.nhatKyGhi.filter((g) => g.kieu === 'giaTri');
    const qua = ghiBang.filter((g) => g.soDong > 200);
    bang(qua.map((g) => g.sheet + '×' + g.soDong), [], 'lệnh ghi quá 200 dòng');
    const nhap = ghiBang.filter((g) => g.sheet === 'Tổng nhập' && g.soDong > 1);
    dung(nhap.length === 1, 'khối đầu kỳ phải là 1 lệnh, được ' + nhap.length);
    dung(A.sim.nhatKyGhi.length < 400, 'tổng lệnh ghi ' + A.sim.nhatKyGhi.length);
    return A.sim.nhatKyGhi.length + ' lệnh ghi · ' + await doiChungAm(async () => {
      const y = await kichBan({ suaNguon: sua('var TM_LO_DONG = 200;', 'var TM_LO_DONG = 100000;') });
      return y.sim.nhatKyGhi.filter((g) => g.kieu === 'giaTri' && g.soDong > 200).map((g) => g.sheet + ' ' + g.soDong + ' dòng một lệnh');
    }, 'bỏ giới hạn lô');
  });

  // ---------------------------------------------------------------- cặp B: tháng 8 thật → vỏ tháng 9 dọn tay
  console.log('\n--- cặp B (Phụ lục A.9.1): tháng 8 THẬT → vỏ tháng 9 dọn tay — TM-01…TM-12 ---');
  const donTay = (ssMoi) => {
    GIAN.concat(['Đơn ngoài']).forEach((t) => donVung(ssMoi.getSheetByName(t), 4, 15));
    donVung(ssMoi.getSheetByName('Tổng nhập'), 4, 12);
    const ln = ssMoi.getSheetByName('Lợi nhuận');
    for (let r = 6; r <= 16; r++) if (!ln.congThuc[r + ':4']) delete ln.giaTri[r + ':4'];
  };
  const B = await kichBan({ mau: 'T8', kyMoi: '2026-09', vo: donTay });

  await test('TM-W-18', 'cặp tháng 8 → 9: TM-01…TM-12 (76 dòng đầu kỳ, K-2 lệch < 1 đ, dòng 5 = 9…1, gộp D4:L4, E6:E16 cứng, 5 công thức D, 2.000 dòng công thức)', async () => {
    dung(B.kq.ok === true, 'phải xong: ' + JSON.stringify(B.kq).slice(0, 400));
    const k = {}; B.kq.kiem.forEach((p) => { k[p.ma] = p; });
    const n = B.ssMoi.getSheetByName('Tổng nhập');
    let dauKy = 0, coNgay = 0;
    for (let r = 4; r <= 2003; r++) if (n.giaTri[r + ':4'] != null && String(n.giaTri[r + ':4']).trim() !== '') { dauKy++; if (n.giaTri[r + ':10']) coNgay++; }
    const ln = B.ssMoi.getSheetByName('Lợi nhuận');
    const dong5 = []; for (let c = 4; c <= 12; c++) dong5.push(ln.giaTri['5:' + c]);
    const gop4 = ln.gopO.filter((g) => g.r1 === 4 && g.r2 === 4 && g.c1 === 4).map((g) => g.c2);
    const ctD = [6, 7, 8, 11, 12].filter((r) => ln.congThuc[r + ':4']).length;
    const trongD = [9, 10, 13, 14, 15, 16].filter((r) => (ln.giaTri[r + ':4'] !== '' && ln.giaTri[r + ':4'] != null) || ln.congThuc[r + ':4']).length;
    const lech10 = [];
    GIAN.forEach((t) => 'EFLMN'.split('').forEach((ch) => { const d = demCT(B.ssMoi.getSheetByName(t), cot(ch)); if (d.n !== 2000 || d.dau !== 4 || d.cuoi !== 2003) lech10.push(t + '!' + ch + ' ' + d.n); }));
    const tm = [
      ['TM-01', dauKy === 76, dauKy + ' dòng (bản tay 75, thiếu gvs km 1)'],
      ['TM-02', k['K-1'].dat, k['K-1'].chiTiet],
      ['TM-03', k['K-2'].dat, k['K-2'].chiTiet],
      ['TM-04', coNgay === 0, coNgay + ' ô ngày'],
      ['TM-05', k['K-4'].dat && B.ssMoi.getSheets().length === B.ssCu.getSheets().length + 1, B.ssMoi.getSheets().length + ' sheet'],
      ['TM-06', dong5.join(',') === '9,8,7,6,5,4,3,2,1', dong5.join(',')],
      ['TM-07', gop4.length === 1 && gop4[0] === 12, 'D4:' + String.fromCharCode(64 + (gop4[0] || 0)) + '4'],
      ['TM-08', k['K-8'].dat, k['K-8'].chiTiet],
      ['TM-09', ctD === 5 && trongD === 0, ctD + '/5 công thức, ' + trongD + ' ô phải trống còn nội dung'],
      ['TM-10', lech10.length === 0, lech10.length ? lech10.slice(0, 4).join(' ') : '20/20 cột đúng 2.000 ô 4→2003'],
      ['TM-11', k['K-6'].dat, k['K-6'].chiTiet],
      ['TM-12', k['K-5'].dat, k['K-5'].chiTiet]
    ];
    const truot = tm.filter((x) => !x[1]);
    bang(truot.map((x) => x[0] + ': ' + x[2]), []);
    return tm.map((x) => x[0] + ' ' + x[2]).join(' · ').slice(0, 600) + ' · ' + await doiChungAm(async () => {
      // TM-10 phải trượt khi file thiếu MỘT dòng công thức (YC-39.3 nêu đích danh).
      const sh = B.ssMoi.getSheetByName('Babyiu');
      const giu = sh.congThuc['1000:13'];
      delete sh.congThuc['1000:13'];
      const d = demCT(sh, 13);
      sh.congThuc['1000:13'] = giu;
      return d.n !== 2000 ? ['Babyiu!M ' + d.n + ' ô'] : [];
    }, 'gỡ một ô công thức Babyiu!M1000');
  });

  // ---------------------------------------------------------------- phía MÁY: nút 3 chế độ 1 → WebAppGoogleSheet → Web App giả
  //
  // YC-34 + YC-35 phía máy, TRỌN ĐƯỜNG: `node/nut-3-thang-moi.js` → `WebAppGoogleSheet.taoThangMoi` → đường truyền giả (302)
  // → `doPost` của MÃ THẬT `ShellAppsScript.gs` + `TaoThangMoi.gs` trên cặp A (tháng 9 thật → bản sao tháng 10).
  // Đối chứng âm ở phần này nạp BẢN SỬA của file máy (`napBanSua`) trong bộ nhớ — không ghi file nào ra đĩa.
  console.log('\n--- phía máy (YC-34/35): nút 3 chế độ 1 → WebAppGoogleSheet.taoThangMoi → Web App giả chạy mã .gs thật ---');
  const Module = require('module');
  const os = require('os');
  const gw = require('./gsheet-web-app');
  const NUT3 = require('./nut-3-thang-moi');
  const httpsGia = require('https');                      // chính là bản giả `gia-lap-web-app` đã cắm vào require.cache
  const RAC_MAY = [];

  /** Nạp bản sửa của một file trong node/. `doi` = [[mốc, thay], …], mỗi mốc đúng MỘT chỗ. */
  function napBanSua(tenFile, doi) {
    const tep = path.join(__dirname, tenFile);
    let src = fs.readFileSync(tep, 'utf8');
    for (const [moc, thay] of doi) {
      const n = src.split(moc).length - 1;
      if (n !== 1) throw new Error('mốc đối chứng âm trong ' + tenFile + ' cần 1 chỗ, tìm được ' + n + ': ' + moc.slice(0, 70) + ' — mã đã đổi, sửa mốc, ĐỪNG bỏ bài');
      src = src.split(moc).join(thay);
    }
    const m = new Module(tep, module);
    m.filename = tep;
    m.paths = Module._nodeModulePaths(__dirname);
    m._compile(src, tep);
    return m.exports;
  }

  /** Dựng cặp A cho phía máy: Web App giả + hai file + thư mục vận hành có cấu hình thật hình dạng. */
  function dungMay(o) {
    o = o || {};
    const sim = gl.taoGiaLap({ ngay: '2026-09-28T02:00:00Z', suaNguon: o.suaNguon, epNgayNhuGoogle: o.epNgay === true });
    const ssCu = saoFile(MAU.T9.ss, sim.khaiThang('2026-09', MAU.T9.ten));
    const ssMoi = saoFile(MAU.T9.ss, sim.khaiThang('2026-10', o.tenMoi || 'THÁNG-10-2026-KINH-DOANH', { khongKhaiLink: true }));
    if (o.vo) o.vo(ssMoi, ssCu, sim);
    sim.khiFlush = () => { tinhLaiBangTinh(ssMoi); if (o.sauTinh) o.sauTinh(ssMoi); };
    if (o.buocMs) sim.datBuocDongHo(o.buocMs);
    const vh = fs.mkdtempSync(path.join(os.tmpdir(), 'keodon-tmw-may-'));
    RAC_MAY.push(vh);
    const ch = path.join(vh, 'Cấu hình');
    fs.mkdirSync(ch);
    const tep = path.join(ch, 'CAU_HINH_VAN_HANH.json');
    fs.writeFileSync(tep, JSON.stringify({
      google_sheet: { bat: true, web_app_url: sim.url, chuoi_bi_mat: sim.biMat },
      link_thang: { '2026-08': sim.linkCua('2026-08'), '2026-09': sim.linkCua('2026-09') }
    }, null, 2) + '\n', 'utf8');
    return { sim, ssCu, ssMoi, vh, ch, tep, truocCu: chup(ssCu) };
  }
  const TL1 = (sim) => ['9', '2026', sim.linkCua('2026-09'), '10', '2026', sim.linkCua('2026-10'), '1', 'c'];

  async function bamNut3(X, tc) {
    let ra = '';
    const mod = (tc && tc.mod) || NUT3;
    const ma = await mod.chay(Object.assign({
      vh: X.vh, traLoi: TL1(X.sim), mau: false, ra: (s) => { ra += s; }, thoiDiem: '2026-09-28T02:00:00Z'
    }, (tc && tc.them) || {}));
    const dNk = path.join(X.ch, 'nhật ký');
    const nhatKy = fs.existsSync(dNk) ? fs.readdirSync(dNk).map((t) => fs.readFileSync(path.join(dNk, t), 'utf8')).join('\n') : '';
    X.sim.datBuocDongHo(0);
    return { ma, ra, nhatKy };
  }

  /** Mọi thứ phía máy in ra + nhật ký: không ID, không link file tháng, không chuỗi bí mật, không link Web App. */
  function lotMay(X, chu) {
    return ['2026-08', '2026-09', '2026-10'].filter((k) => chu.indexOf(X.sim.idCua(k)) >= 0).map((k) => 'ID ' + k)
      .concat(/docs\.google\.com\/spreadsheets\/(?:u\/\d+\/)?d\/\w/.test(chu) ? ['link file tháng'] : [])
      .concat(chu.indexOf(X.sim.biMat) >= 0 ? ['chuỗi bí mật'] : [])
      .concat(chu.indexOf(X.sim.url) >= 0 ? ['link Web App'] : []);
  }

  /** Bơm lỗi của giả lập CHỈ vào gói `ping` (lượt chốt phiên bản mở đầu nút 3). */
  async function voiLoiPing(X, loi, fn) {
    const goc = httpsGia.request;
    httpsGia.request = function (opt, cb) {
      const req = goc.call(this, opt, cb);
      const viet = req.write;
      req.write = (d) => { if (/"hanhDong":"ping"/.test(String(d))) X.sim.datLoi(loi); else X.sim.xoaLoi(); return viet(d); };
      return req;
    };
    try { return await fn(); } finally { httpsGia.request = goc; X.sim.xoaLoi(); }
  }

  /** Bơm lỗi của giả lập CHỈ vào gói `taoThangMoi` (lượt `ping` chốt phiên bản đi qua bình thường). */
  async function voiLoiTaoThang(X, loi, fn) {
    const goc = httpsGia.request;
    httpsGia.request = function (opt, cb) {
      const req = goc.call(this, opt, cb);
      const viet = req.write;
      req.write = (d) => { if (/"hanhDong":"taoThangMoi"/.test(String(d))) X.sim.datLoi(loi); else X.sim.xoaLoi(); return viet(d); };
      return req;
    };
    try { return await fn(); } finally { httpsGia.request = goc; X.sim.xoaLoi(); }
  }

  await test('TM-W-19', 'phía máy `WebAppGoogleSheet.taoThangMoi`: qua đường truyền 302, bước dài hơn ngưỡng thì gọi lại kèm `buocDungTruoc` tới khi xong 8/8, kết quả y hệt chạy một hơi; mỗi lượt chờ 400 giây, không phải thời gian chờ kéo đơn', async () => {
    const chayMay = async (Lop, X) => {
      const web = new Lop.WebAppGoogleSheet(X.sim.cauHinhMay());
      const goiDi = [];
      const goc = httpsGia.request;
      httpsGia.request = function (opt, cb) {
        const req = goc.call(this, opt, cb);
        const ghi = { cho: opt.timeout, goi: null };
        goiDi.push(ghi);
        const viet = req.write;
        req.write = (d) => { const g = JSON.parse(String(d)); ghi.goi = { hanhDong: g.hanhDong, buocDungTruoc: g.buocDungTruoc }; return viet(d); };
        return req;
      };
      try {
        const kq = await web.taoThangMoi({ thangCu: 9, namCu: 2026, linkCu: X.sim.linkCua('2026-09'), thangMoi: 10, namMoi: 2026, linkMoi: X.sim.linkCua('2026-10') }, { nguongGiay: 20 });
        return { kq, goiDi };
      } finally { httpsGia.request = goc; X.sim.datBuocDongHo(0); }
    };
    const X = dungMay({ buocMs: 450 });
    const { kq, goiDi } = await chayMay(gw, X);
    dung(kq.ok === true && kq.kiem.length === 8 && kq.kiem.every((p) => p.dat), 'phải xong 8/8: ' + JSON.stringify(kq).slice(0, 300));
    const tt = goiDi.filter((g) => g.goi && g.goi.hanhDong === 'taoThangMoi');
    dung(goiDi[0].goi.hanhDong === 'ping', 'lượt đầu phải là ping chốt phiên bản');
    dung(tt.length >= 2 && kq.soLuot === tt.length, 'bước dài hơn ngưỡng phải gọi lại ≥ 2 lượt, được ' + tt.length);
    dung(tt[0].goi.buocDungTruoc === undefined && tt[1].goi.buocDungTruoc === 'B3', 'lượt 2 phải báo lại bước vừa dừng dở B3, được ' + tt[1].goi.buocDungTruoc);
    bang(tt.map((g) => g.cho).filter((c) => c !== gw.TIMEOUT_TAO_THANG_MS), [], 'thời gian chờ lượt taoThangMoi');
    dung(gw.TIMEOUT_TAO_THANG_MS >= 370000 && goiDi[0].cho === gw.TIMEOUT_MS, 'chờ tạo tháng phải ≥ 6 phút 10 giây; ping giữ thời gian chờ kéo đơn TIMEOUT_MS');
    bang(soOKhac(chupBoCo(A.ssMoi), chupBoCo(X.ssMoi)), 0, 'khác bản chạy một hơi');
    return tt.length + ' lượt · chờ ' + (gw.TIMEOUT_TAO_THANG_MS / 1000) + ' giây/lượt · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['        buocDungTruoc: buocDungTruoc || undefined,\n', '        buocDungTruoc: undefined,\n']]);
      const Y = dungMay({ buocMs: 450 });
      try { const r = await chayMay(Sai, Y); return r.kq.ok ? [] : ['không xong: ' + r.kq.loi]; } catch (e) { return ['kẹt: ' + e.message.slice(0, 90)]; }
    }, 'không gửi buocDungTruoc') + ' · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['    const choMs = laTaoThang ? TIMEOUT_TAO_THANG_MS : TIMEOUT_MS;', '    const choMs = TIMEOUT_MS;']]);
      const Y = dungMay({});
      const r = await chayMay(Sai, Y);
      return r.goiDi.filter((g) => g.goi && g.goi.hanhDong === 'taoThangMoi' && g.cho < 370000).map((g) => 'lượt tạo tháng chờ ' + g.cho / 1000 + ' giây');
    }, 'chờ như kéo đơn (TIMEOUT_MS)');
  });

  await test('TM-W-20', 'nút 3 chế độ 1 TRỌN ĐƯỜNG: 8/8 → ghi link_thang["2026-10"], file tháng mới y hệt chạy thẳng Web App, file tháng 9 không đổi ô nào; màn hình + nhật ký không lọt ID/link/chuỗi bí mật', async () => {
    const X = dungMay({ buocMs: 300 });
    const r = await bamNut3(X, { them: { nguongGiay: 20 } });
    dung(r.ma === 0, 'phải thoát mã 0: ' + r.ra.slice(-500));
    const cfg = JSON.parse(fs.readFileSync(X.tep, 'utf8'));
    dung(cfg.link_thang['2026-10'] === X.sim.linkCua('2026-10'), 'link_thang["2026-10"] không đúng link [6/7]');
    dung(/^DA_KHOI_TAO_/.test(coTM(X.ssMoi, 1)), 'O1: ' + coTM(X.ssMoi, 1));
    bang((r.ra.match(/K-[1-8] ĐẠT /g) || []).length, 8, 'bảng 8 phép K ĐẠT trên màn hình');
    dung(/DA GHI link thang 2026-10\. Tu ngay 1\/10\/2026/.test(r.ra), 'thiếu câu DA GHI link thang 2026-10');
    bang(soOKhac(chupBoCo(A.ssMoi), chupBoCo(X.ssMoi)), 0, 'file tháng mới khác bản chạy thẳng Web App');
    bang(soOKhac(X.truocCu, chup(X.ssCu)), 0, 'số ô file tháng 9 bị đổi');
    bang(lotMay(X, r.ra + '\n' + r.nhatKy), [], 'INV-7 phía máy');
    dung(/Chế độ: 1 · Mã thoát: 0/.test(r.nhatKy), 'nhật ký LOG_TAO_THANG_ thiếu dòng tổng');
    return 'mã 0 · ' + (r.ra.match(/lượt \d+\)/g) || []).length + ' lần gọi tiếp · ' + await doiChungAm(async () => {
      // Máy coi lượt dừng gọn đầu tiên là "xong" và không gọi tiếp.
      const Sai = napBanSua('gsheet-web-app.js', [['      if (kq.xong !== false) return kqGon;\n', '      return kqGon;\n']]);
      const Y = dungMay({ buocMs: 300 });
      const y = await bamNut3(Y, { them: { nguongGiay: 20, WebApp: Sai.WebAppGoogleSheet } });
      const c = JSON.parse(fs.readFileSync(Y.tep, 'utf8'));
      return (y.ma !== 0 || !c.link_thang['2026-10'] || !/^DA_KHOI_TAO_/.test(coTM(Y.ssMoi, 1)))
        ? ['thoát ' + y.ma + ', O1 = ' + coTM(Y.ssMoi, 1) + ', link ' + (c.link_thang['2026-10'] ? 'có' : 'không')] : [];
    }, 'không gọi tiếp khi Google dừng gọn');
  });

  await test('TM-W-21', 'nút 3 chế độ 1 TỰ KIỂM LỆCH (sót doanh số Shopee mall!L3) → mã 3, CAU_HINH_VAN_HANH.json y nguyên từng byte, O1 giữ DANG_KHOI_TAO_, màn hình nêu K-7 và việc phải làm', async () => {
    const sauTinh = (ss) => { ss.getSheetByName('Shopee mall').giaTri['3:12'] = 999000; ss.getSheetByName('Lợi nhuận').giaTri['7:4'] = 999000; };
    const X = dungMay({ sauTinh });
    const truoc = fs.readFileSync(X.tep);
    const r = await bamNut3(X);
    bang(r.ma, 3, 'mã thoát');
    dung(Buffer.compare(fs.readFileSync(X.tep), truoc) === 0, 'tự kiểm lệch mà CAU_HINH_VAN_HANH.json đã bị ghi');
    dung(/^DANG_KHOI_TAO_/.test(coTM(X.ssMoi, 1)), 'O1: ' + coTM(X.ssMoi, 1));
    dung(/K-7 LỆCH/.test(r.ra) && /\[TU_KIEM_LECH\]/.test(r.ra) && /KHÔNG khai link/.test(r.ra), 'màn hình thiếu K-7 / mã / việc phải làm: ' + r.ra.slice(-400));
    return await doiChungAm(async () => {
      const Sai = napBanSua('nut-3-thang-moi.js', [['    if (!du8) {', '    if (false) {']]);
      const Y = dungMay({ sauTinh });
      const t = fs.readFileSync(Y.tep);
      await bamNut3(Y, { mod: Sai });
      return Buffer.compare(fs.readFileSync(Y.tep), t) !== 0 ? ['khai link cho file tháng mới đang lệch K-7'] : [];
    }, 'ghi link dù tự kiểm lệch');
  });

  await test('TM-W-22', 'nút 3 chế độ 1 các ca hỏng qua đường truyền — bấm lại lần hai, lệch bản, lỗi quyền file tháng cũ, Google cắt 6 phút, đứt mạng: đúng mã thoát, đúng câu việc phải làm, cấu hình y nguyên', async () => {
    const ra = [];
    const kiemCa = async (ten, X, maMong, rxCo, rxKhong, lam) => {
      const truoc = fs.readFileSync(X.tep);
      const r = await (lam ? lam() : bamNut3(X));
      dung(r.ma === maMong, ten + ': phải thoát mã ' + maMong + ', được ' + r.ma + ' — ' + r.ra.slice(-300));
      rxCo.forEach((rx) => dung(rx.test(r.ra), ten + ': thiếu ' + rx + ' — ' + r.ra.slice(-400)));
      (rxKhong || []).forEach((rx) => dung(!rx.test(r.ra), ten + ': không được có ' + rx));
      dung(Buffer.compare(fs.readFileSync(X.tep), truoc) === 0, ten + ': CAU_HINH_VAN_HANH.json đã bị ghi');
      bang(lotMay(X, r.ra + r.nhatKy), [], ten + ' INV-7');
      ra.push(ten + '→' + r.ma);
      return r;
    };
    // (a) file đã khởi tạo → bấm lại lần hai → gợi ý chế độ 2
    const Xa = dungMay({ vo: (ssMoi) => { saoKetQua(A.ssMoi, ssMoi); } });
    await kiemCa('đã khởi tạo', Xa, 3, [/\[DA_KHOI_TAO\]/, /CHẾ ĐỘ 2/]);
    // (b) Web App còn bản cũ → dừng ở ping, KHÔNG gửi gói taoThangMoi nào
    const Xb = dungMay({});
    Xb.sim.datLoi({ lechPhienBan: { dangChay: '2.5.0', can: gw.PHIEN_BAN } });
    await kiemCa('lệch bản', Xb, 4, [/2\.5\.0/, /KHÔNG TẠO ĐƯỢC THÁNG 2026-10/]);
    bang(Xb.sim.nhatKyGoi.filter((g) => g.hanhDong === 'taothangmoi').length, 0, 'lệch bản mà vẫn gửi gói taoThangMoi');
    Xb.sim.xoaLoi();
    // (c) tài khoản deploy không có quyền mở file THÁNG CŨ → câu chuẩn D-46 nêu đúng tháng 2026-09
    const Xc = dungMay({});
    const QUYEN = { loiMoFile: 'Exception: You do not have permission to access the requested document.' };
    await kiemCa('lỗi quyền', Xc, 4, [/LỖI QUYỀN TRUY CẬP/, /file Google Sheet tháng 2026-09 phải/], [], () => voiLoiTaoThang(Xc, QUYEN, () => bamNut3(Xc)));
    // (d) Google cắt ngang ở 6 phút → bảo bấm lại nút 3, KHÔNG bảo "chia nhỏ file", KHÔNG nói "chưa ghi gì"
    const Xd = dungMay({});
    await kiemCa('quá 6 phút', Xd, 4, [/bấm lại nút 3/, /link_thang CHƯA được khai/], [/chia nhỏ file/, /Tool chưa ghi gì/],
      () => voiLoiTaoThang(Xd, { quaSauPhut: true }, () => bamNut3(Xd)));
    // (f) Google ném một câu LẠ có dán mã file tháng mới (chưa nằm trong link_thang) → vẫn không lọt ra màn hình / nhật ký
    const Xf = dungMay({});
    const LA = (X) => ({ loiMoFile: 'Service Spreadsheets failed while accessing document with id ' + X.sim.idCua('2026-10') + '.' });
    await kiemCa('câu lạ có mã file', Xf, 4, [/NGOAI_LE/, /<ID file tháng>/], [], () => voiLoiTaoThang(Xf, LA(Xf), () => bamNut3(Xf)));
    // (g) MẤT MẠNG NGAY LƯỢT PING chốt phiên bản (ca mất mạng hay gặp nhất) → câu nút 3 "chưa gửi lệnh tạo tháng", không câu kéo đơn
    const Xg = dungMay({});
    await kiemCa('mất mạng ở ping', Xg, 4, [/CHƯA gửi lệnh tạo tháng nào/], [/không bị ghi trùng/, /Chưa biết Google đã chuyển sổ/],
      () => voiLoiPing(Xg, { loiKetNoi: 'getaddrinfo ENOTFOUND' }, () => bamNut3(Xg)));
    bang(Xg.sim.nhatKyGoi.filter((g) => g.hanhDong === 'taothangmoi').length, 0, 'mất mạng ở ping mà vẫn gửi gói taoThangMoi');
    // (h) quên đổi tên bản sao ("Bản sao của …" mang tháng 9) → câu của NÚT 3: nêu trường [6/7], cấm chế độ 2 — không câu nút 4
    const Xh = dungMay({ tenMoi: 'Bản sao của ' + MAU.T9.ten });
    await kiemCa('quên đổi tên bản sao', Xh, 3, [/\[SAI_THANG_FILE\]/, /tháng mới \[6\/7\]/, /ĐỪNG chọn chế độ 2/], [/link_thang\["2026-10"\] trong/, /bấm 3_TAO_FILE_THANG_MOI\.bat chế độ 2/]);
    // (e) đứt mạng
    const Xe = dungMay({});
    await kiemCa('đứt mạng', Xe, 4, [/link_thang CHƯA được khai/, /chế độ 2/], [/không bị ghi trùng/],
      () => voiLoiTaoThang(Xe, { loiKetNoi: 'ECONNRESET' }, () => bamNut3(Xe)));
    return ra.join(' · ') + ' · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['      const mTh = laTaoThang ? /tháng (\\d{4}-\\d{2})/.exec(tb) : null;', '      const mTh = null;']]);
      const Y = dungMay({});
      const y = await voiLoiTaoThang(Y, QUYEN, () => bamNut3(Y, { them: { WebApp: Sai.WebAppGoogleSheet } }));
      return /file Google Sheet tháng 2026-09 phải/.test(y.ra) ? [] : ['câu lỗi quyền chỉ sai file: ' + ((y.ra.match(/file Google Sheet tháng \d{4}-\d{2}/) || ['?'])[0])];
    }, 'câu lỗi quyền nêu tháng mới thay vì file hỏng quyền') + ' · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [['            if (laTaoThang) {\n              // "Chia nhỏ file thả vào"', '            if (false) {\n              // "Chia nhỏ file thả vào"']]);
      const Y = dungMay({});
      const y = await voiLoiTaoThang(Y, { quaSauPhut: true }, () => bamNut3(Y, { them: { WebApp: Sai.WebAppGoogleSheet } }));
      return /chia nhỏ file/.test(y.ra) ? ['bảo "chia nhỏ file thả vào" giữa lúc tạo tháng'] : [];
    }, 'dùng câu 6 phút của kéo đơn') + ' · ' + await doiChungAm(async () => {
      // Bỏ CẢ HAI lớp che link/ID vừa gõ (phía máy Web App và nút 3) — chỉ còn mẫu chung, không che được mã file trơ trọi.
      const Sai = napBanSua('gsheet-web-app.js', [['    [idCu, idMoi].forEach((x) => this.cheThem(x));\n', ''], ['    [o.linkCu, o.linkMoi].forEach((x) => this.cheThem(x));\n', '']]);
      const SaiN3 = napBanSua('nut-3-thang-moi.js', [['        if (LA_LINK[i]) cheThem(String(x).trim());\n', ''],
        ["    if (typeof w.cheThem === 'function') [gt.linkCu, gt.linkMoi].forEach((x) => w.cheThem(x));\n", '']]);
      const Y = dungMay({});
      const y = await voiLoiTaoThang(Y, LA(Y), () => bamNut3(Y, { mod: SaiN3, them: { WebApp: Sai.WebAppGoogleSheet } }));
      return lotMay(Y, y.ra + y.nhatKy);
    }, 'không che link/ID vừa gõ') + ' · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [["    await this.chotPhienBan({ boiCanh: 'taoThang' });", '    await this.chotPhienBan();']]);
      const Y = dungMay({});
      const y = await voiLoiPing(Y, { loiKetNoi: 'getaddrinfo ENOTFOUND' }, () => bamNut3(Y, { them: { WebApp: Sai.WebAppGoogleSheet } }));
      return /không bị ghi trùng/.test(y.ra) ? ['mất mạng ở ping in câu kéo đơn "không bị ghi trùng"'] : [];
    }, 'ping chốt bản không mang bối cảnh tạo tháng') + ' · ' + await doiChungAm(async () => {
      const Y = dungMay({ tenMoi: 'Bản sao của ' + MAU.T9.ten,
        suaNguon: sua("    kiemTenFileKhopThang_(ssMoi, kyMoi, canhBao, 'tháng mới [6/7]');", '    kiemTenFileKhopThang_(ssMoi, kyMoi, canhBao);') });
      const y = await bamNut3(Y);
      return /chế độ 2, rồi chạy lại/.test(y.ra) ? ['bảo khai link_thang / chế độ 2 cho bản sao chưa chuyển sổ'] : [];
    }, 'dùng câu SAI_THANG_FILE của nút 4');
  });

  await test('TM-W-23', 'đường truyền cắt ngang KHÔNG làm treo nút 3: phản hồi đứt giữa thân (Node chỉ báo close, không end) và lượt GET chuyển hướng đứng im đều ra LỖI có câu nút 3', async () => {
    const TS = (X) => ({ thangCu: 9, namCu: 2026, linkCu: X.sim.linkCua('2026-09'), thangMoi: 10, namMoi: 2026, linkMoi: X.sim.linkCua('2026-10') });
    const hanChot = (p, ms) => Promise.race([p.then((v) => ({ v }), (e) => ({ e })), new Promise((r) => setTimeout(() => r({ treo: true }), ms))]);
    // (a) phản hồi của gói taoThangMoi bị cắt giữa thân: có 'data' nửa chừng rồi 'close', không 'end', không 'error'
    const catThan = async (Lop) => {
      const X = dungMay({});
      const web = new Lop.WebAppGoogleSheet(X.sim.cauHinhMay());
      const goc = httpsGia.request;
      httpsGia.request = function (opt, cb) {
        const { EventEmitter } = require('events');
        const req = new EventEmitter();
        let than = '';
        req.write = (d) => { than += d; return true; };
        req.destroy = () => { };
        req.end = () => {
          if (!/"hanhDong":"taoThangMoi"/.test(than)) {
            const that = goc.call(httpsGia, opt, cb);
            that.on('error', (e) => req.emit('error', e));
            that.on('timeout', () => req.emit('timeout'));
            that.write(than); that.end();
            return;
          }
          setImmediate(() => {
            const res = new EventEmitter();
            res.statusCode = 200; res.headers = {}; res.setEncoding = () => res; res.resume = () => res;
            cb(res);
            setImmediate(() => { res.emit('data', '{"ok":true,"xo'); res.emit('close'); });
          });
        };
        return req;
      };
      try { return await hanChot(web.taoThangMoi(TS(X)), 4000); } finally { httpsGia.request = goc; }
    };
    const a = await catThan(gw);
    dung(!a.treo && a.e && /ngắt kết nối giữa lúc trả lời/.test(a.e.message) && /link_thang CHƯA được khai/.test(a.e.message),
      'đứt giữa thân phải ra lỗi có câu nút 3: ' + (a.treo ? 'TREO' : (a.e ? a.e.message.slice(0, 160) : 'không lỗi')));
    // (b) lượt GET theo chuyển hướng 302 của gói taoThangMoi đứng im tới hết giờ
    const dungGet = async (Lop) => {
      const X = dungMay({});
      const web = new Lop.WebAppGoogleSheet(X.sim.cauHinhMay());
      const gocReq = httpsGia.request, gocGet = httpsGia.get;
      let sauTaoThang = false;
      httpsGia.request = function (opt, cb) {
        const req = gocReq.call(this, opt, cb);
        const viet = req.write;
        req.write = (d) => { sauTaoThang = /"hanhDong":"taoThangMoi"/.test(String(d)); return viet(d); };
        return req;
      };
      httpsGia.get = function (u, o2, cb) {
        if (!sauTaoThang) return gocGet.call(this, u, o2, cb);
        const { EventEmitter } = require('events');
        const g = new EventEmitter();
        g.destroy = (e) => { if (e) setImmediate(() => g.emit('error', e)); };
        setImmediate(() => g.emit('timeout'));            // hết `timeout` của Node: chỉ PHÁT sự kiện, không tự hủy
        return g;
      };
      try { return await hanChot(web.taoThangMoi(TS(X)), 4000); } finally { httpsGia.request = gocReq; httpsGia.get = gocGet; }
    };
    const b = await dungGet(gw);
    dung(!b.treo && b.e && /không trả lời sau 400 giây/.test(b.e.message) && /link_thang CHƯA được khai/.test(b.e.message),
      'GET đứng im phải ra lỗi hết giờ có câu nút 3: ' + (b.treo ? 'TREO' : (b.e ? b.e.message.slice(0, 160) : 'không lỗi')));
    return '(a) ' + a.e.message.slice(0, 70) + '… · (b) ' + b.e.message.slice(0, 70) + '… · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [["        res.on('close', () => setImmediate(() => { if (!daHet) tuChoi(loiMang(new Error('Web App ngắt kết nối giữa lúc trả lời'))); }));\n", '']]);
      const x = await catThan(Sai);
      return x.treo ? ['treo vô hạn khi phản hồi đứt giữa thân'] : [];
    }, 'không nghe close của phản hồi') + ' · ' + await doiChungAm(async () => {
      const Sai = napBanSua('gsheet-web-app.js', [["          g.on('timeout', () => { g.destroy(new Error('Web App không trả lời sau ' + (choMs / 1000) + ' giây')); });\n", '']]);
      const x = await dungGet(Sai);
      return x.treo ? ['treo vô hạn khi GET chuyển hướng đứng im'] : [];
    }, 'GET chuyển hướng không nghe timeout');
  });

  await test('TM-W-24', 'Google tự đổi chuỗi "2026-10" ở ô cờ O2 thành NGÀY: chạy tiếp nhiều lượt vẫn xong 8/8 và ghi link; bấm lại vẫn ra DA_KHOI_TAO (O2 ghi dạng văn bản + đọc cờ chịu kiểu ngày)', async () => {
    const X = dungMay({ epNgay: true, buocMs: 300 });
    const r = await bamNut3(X, { them: { nguongGiay: 20 } });
    dung(r.ma === 0, 'Google đổi kiểu mà lượt chạy tiếp không xong: ' + r.ra.slice(-400));
    dung(coTM(X.ssMoi, 2) === '2026-10', 'O2 phải là VĂN BẢN "2026-10", đang là ' + String(coTM(X.ssMoi, 2)));
    const r2 = await bamNut3(X);
    dung(r2.ma === 3 && /\[DA_KHOI_TAO\]/.test(r2.ra), 'bấm lại lần hai phải ra [DA_KHOI_TAO], được mã ' + r2.ma + ': ' + r2.ra.slice(-300));
    return (r.ra.match(/lượt \d+\)/g) || []).length + ' lần gọi tiếp · bấm lại → [DA_KHOI_TAO] · ' + await doiChungAm(async () => {
      const Y = dungMay({ epNgay: true, buocMs: 300, suaNguon: (src) => sua("gt: giaTri[i], dinhDang: '@' });", 'gt: giaTri[i] });')(
        sua("    var thangCo = ssMap ? chuanThangCo(tinh(ssMap, 2, C('O'))) : '';", "    var thangCo = ssMap ? String(tinh(ssMap, 2, C('O')) || '').trim() : '';")(src)) });
      const y = await bamNut3(Y, { them: { nguongGiay: 20 } });
      const y2 = y.ma === 0 ? await bamNut3(Y) : null;
      return (y.ma !== 0 || !y2 || !/\[DA_KHOI_TAO\]/.test(y2.ra))
        ? ['mã ' + y.ma + (y2 ? ', bấm lại ra ' + ((y2.ra.match(/\[[A-Z_]+\]/) || ['?'])[0]) : '') + ' — ' + ((y.ra.match(/\[[A-Z_]+\]/) || [''])[0])] : [];
    }, 'ghi O2 không ép văn bản và đọc cờ bằng String()');
  });

  await test('TM-W-25', 'YC-41 việc 2: bộ này chạy mã .gs theo múi giờ dự án (appsscript.json) dù máy test đặt UTC hay Los Angeles — ' +
    'nhãn giờ của cờ DA_KHOI_TAO_ ra đúng giờ Việt Nam', async () => {
    const { spawnSync } = require('child_process');
    // Nhãn giờ của cờ do đúng dòng này của lõi sinh ra — dòng đổi thì bài phải được viết lại, không lặng lẽ chấm hàm khác.
    dung(NGUON_GS.indexOf('var nhan = Utils.dinhDangNgayGio(thoiDiem).slice(0, 16);') >= 0, 'lõi không còn sinh nhãn giờ bằng Utils.dinhDangNgayGio — sửa bài');
    bang(process.env.TZ, MUI_GIO_DU_AN, 'tiến trình bộ này phải đang ghim múi giờ dự án');
    const THOI_DIEM = '2026-10-01T02:00:00Z';            // đúng mốc giả lập của TM-W-01: 09:00 ngày 1/10 giờ Việt Nam
    const chayCon = (tz, ghim) => {
      const ma = (ghim ? "require('./node/mui-gio-du-an').ghimMuiGioDuAn();" : '') +
        "const L=require('./node/nap-loi').napLoi();" +
        "console.log(new Date().getTimezoneOffset()+'|'+L.Utils.dinhDangNgayGio(new Date('" + THOI_DIEM + "')).slice(0,16));";
      const env = Object.assign({}, process.env, { TZ: tz });
      const r = spawnSync(process.execPath, ['-e', ma], { cwd: path.join(__dirname, '..'), encoding: 'utf8', env: env });
      if (r.status !== 0) throw new Error('tiến trình con (' + tz + ') hỏng: ' + String(r.stderr || r.stdout).slice(0, 200));
      const [lech, nhan] = String(r.stdout).trim().split('|');
      return { lech: Number(lech), nhan: nhan };
    };
    const kq = [];
    for (const tz of ['UTC', 'America/Los_Angeles']) {
      const khong = chayCon(tz, false);
      // Không có dòng này thì bài không chứng minh gì: tiến trình con phải THẬT SỰ lệch giờ Việt Nam trước khi ghim.
      dung(khong.lech !== -420, 'tiến trình con ' + tz + ' không thật sự chạy khác giờ Việt Nam (lệch ' + khong.lech + ' phút)');
      const co = chayCon(tz, true);
      bang(co.nhan, '2026-10-01 09:00', 'máy ' + tz + ' đã ghim');
      // ĐỐI CHỨNG ÂM: cùng máy, KHÔNG ghim → nhãn lệch → đúng câu chấm của TM-W-01 phải TRƯỢT.
      if (/^DA_KHOI_TAO_2026-10-01 09:00$/.test('DA_KHOI_TAO_' + khong.nhan)) {
        throw new Error('ĐỐI CHỨNG ÂM KHÔNG LỆCH: máy ' + tz + ' không ghim mà nhãn vẫn 09:00 — bài không phân biệt được');
      }
      kq.push(tz + ': ghim → ' + co.nhan + ' · không ghim → ' + khong.nhan + ' (câu chấm TM-W-01 LỆCH)');
    }
    return 'múi giờ dự án ' + MUI_GIO_DU_AN + ' · ' + kq.join(' · ') + ' ← đối chứng âm đúng như phải thế';
  });

  // ================================================================ YC-43: NÚT 3 CHẾT Ở B5 TRÊN GOOGLE THẬT (14/9 21:47)
  //
  // Giả lập từ 2.7.0 bắt chước đúng luật Google: `copyTo` vào vùng giao MỘT PHẦN với ô gộp → ném "Bạn không thể thực hiện lệnh
  // dán khi vùng dán giao một phần với một ô hợp nhất." (xem `VungGia.copyTo`). Trước luật này 24 bài trên đều xanh trong khi
  // Google thật chết ngay ở B5 — đúng bệnh TM-10.
  const gopLN = (ss) => ss.getSheetByName('Lợi nhuận').gopO.map((g) => [g.r1, g.c1, g.r2, g.c2].join(':')).sort();
  const soLN = (ss, r) => { const sh = ss.getSheetByName('Lợi nhuận'); return { ct: sh.congThuc[r + ':4'] || null, gt: sh.giaTri[r + ':4'] }; };
  const CAU_DAN_GOP = 'Bạn không thể thực hiện lệnh dán khi vùng dán giao một phần với một ô hợp nhất.';
  const ghep = (...fs2) => (s) => fs2.reduce((x, f) => f(x), s);
  const CHET_B4 = sua('    var t = dsThaoTac[i];', "    var t = dsThaoTac[i];\n    if (t.sheet === 'Tổng nhập') throw new Error('GIẢ LẬP: Google cắt ngang giữa lúc ghi Tổng nhập');");
  const CHET_B5A = sua('    daChen = true;', "    daChen = true;\n    throw new Error('GIẢ LẬP: Google cắt ngang ngay sau khi chèn cột');");

  await test('TM-W-26', 'YC-43.1: `Lợi nhuận` gỡ gộp TRƯỚC lệnh dán rồi gộp lại — hết NGOAI_LE ô hợp nhất; mọi cụm gộp y nguyên, riêng khối tiêu đề (dòng 3) / năm (dòng 4) nới đúng một cột theo A.5 bước 22', async () => {
    dung(A.kq.ok === true, 'cặp A phải xong: ' + JSON.stringify(A.kq).slice(0, 200));
    const truoc = gopLN(A.ssCu), sau = gopLN(A.ssMoi);
    const tieuDe = A.ssCu.getSheetByName('Lợi nhuận').gopO.filter((g) => g.r1 === 3)[0];
    dung(tieuDe, 'khuôn tháng 9 phải có cụm gộp tiêu đề ở dòng 3');
    const cuoiMoi = tieuDe.c2 + 1;
    const mong = truoc.filter((k) => { const [r1, c1] = k.split(':').map(Number); return r1 !== 3 && !(r1 === 4 && c1 === 4); })
      .concat(['3:' + tieuDe.c1 + ':3:' + cuoiMoi, '4:4:4:' + cuoiMoi]).sort();
    bang(sau, mong, 'cụm gộp `Lợi nhuận` sau khi chạy');
    // ĐỐI CHỨNG ÂM 1 — bỏ bước gỡ gộp: phải chết đúng câu Google thật trả ngày 14/9.
    const khongGo = await kichBan({ suaNguon: sua('  gop.forEach(function (g) { sh.getRange(g.r, g.c, g.nr, g.nc).breakApart(); });', '') });
    dung(khongGo.kq.loi === 'NGOAI_LE' && String(khongGo.kq.thongBao).indexOf(CAU_DAN_GOP) >= 0,
      'ĐỐI CHỨNG ÂM KHÔNG LỆCH đúng lỗi: bỏ gỡ gộp mà được ' + JSON.stringify(khongGo.kq).slice(0, 200));
    // ĐỐI CHỨNG ÂM 2 — gỡ mà quên gộp lại: chạy xong 8/8 nhưng mất cụm gộp nhãn B6:C6… — phép so vùng gộp phải bắt.
    const khongGop = await kichBan({ suaNguon: sua('      sh.getRange(g.r, c1, g.nr, c2 - c1 + 1).merge();', '') });
    const mat = mong.filter((k) => gopLN(khongGop.ssMoi).indexOf(k) < 0);
    dung(mat.length > 0, 'ĐỐI CHỨNG ÂM KHÔNG LỆCH: quên gộp lại mà vùng gộp vẫn đủ');
    return truoc.length + ' cụm trước → ' + sau.length + ' cụm sau (tiêu đề ' + truoc.filter((k) => k.startsWith('3:'))[0] + ' → 3:' + tieuDe.c1 + ':3:' + cuoiMoi +
      ', năm 4:4:4:' + cuoiMoi + ', ' + (sau.length - 2) + ' cụm khác y nguyên) · đối chứng âm "bỏ gỡ gộp" -> LỆCH (NGOAI_LE: ' + CAU_DAN_GOP.slice(0, 40) +
      '…) · "quên gộp lại" -> LỆCH (mất ' + mat.length + ' cụm, vd ' + mat[0] + ')';
  });

  await test('TM-W-27', 'YC-43.2: chết giữa chừng NGAY SAU khi đã dọn gian hàng (ở B4) → cột tháng cũ `Lợi nhuận` đã là SỐ CỨNG bằng đúng tháng cũ (K-8 lúc chết) — đóng băng TRƯỚC, phá hủy SAU', async () => {
    const chamK8 = (x) => {
      const lech = [];
      const n = 18;                         // khuôn tháng 9: nhãn `Lợi nhuận` từ dòng 6 tới `CP khác` ở dòng 18
      for (let r = 6; r <= n; r++) {
        const moi = soLN(x.ssMoi, r), cu = soLN(x.ssCu, r);
        const a = cu.gt == null || cu.gt === '' ? null : cu.gt, b = moi.gt == null || moi.gt === '' ? null : moi.gt;
        const khop = (a === null && b === null) || (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 0.01) || a === b;
        if (moi.ct || !khop) lech.push('D' + r + (moi.ct ? ' còn công thức' : '') + ' = ' + JSON.stringify(b) + ' (tháng cũ ' + JSON.stringify(a) + ')');
      }
      return lech;
    };
    const x = await kichBan({ suaNguon: CHET_B4 });
    dung(x.kq.ok === false && x.kq.loi === 'NGOAI_LE', 'phải chết giữa chừng ở B4: ' + JSON.stringify(x.kq).slice(0, 160));
    bang(coTM(x.ssMoi, 5), 'B3', 'cờ lúc chết');
    dung(oDuLieu(x.ssMoi.getSheetByName('Shopee mall'), 4, 15).length === 0, 'B3 phải đã dọn sạch gian hàng — bài này đo đúng khoảnh khắc nguy hiểm');
    bang(chamK8(x), [], 'cột tháng cũ `Lợi nhuận` lúc chết');
    // ĐỐI CHỨNG ÂM — thứ tự 2.6.1: không có B2b, đóng băng mãi tới B5b (sau khi dọn) → chết ở B4 là mất số tháng cũ.
    const cu = await kichBan({ suaNguon: ghep(CHET_B4, sua("      { ma: 'B2b', ten: 'Đóng băng tháng cũ ở `Lợi nhuận` (trước khi dọn sheet nào)', mocSau: 'B2b', thaoTac: ttB2b },\n", '')) });
    const lechCu = chamK8(cu);
    dung(lechCu.length > 0, 'ĐỐI CHỨNG ÂM KHÔNG LỆCH: đóng băng sau khi dọn mà chết ở B4 vẫn còn đủ số tháng cũ');
    const d7 = soLN(x.ssMoi, 7).gt;
    return 'chết ở B4 (cờ B3, gian hàng đã dọn) → D6:D18 là số cứng khớp tháng cũ (Tổng doanh số D7 = ' + d7 + ') · đối chứng âm "thứ tự 2.6.1" -> LỆCH ' +
      lechCu.length + ' ô (' + lechCu.filter((s) => /^D7/.test(s))[0] + ')';
  });

  await test('TM-W-28', 'YC-43.3: mọi ngoại lệ giữa chừng nói BƯỚC ĐANG LÀM + cờ BUOC_DA_XONG + nguyên văn lỗi Google + VIỆC PHẢI LÀM; chết trong B5a → câu "bản sao đã hỏng", và vẫn gộp lại ô', async () => {
    const x = await kichBan({ suaNguon: CHET_B4 });
    const tb = String(x.kq.thongBao);
    dung(/ở bước B4 · Ghi khối nhập đầu kỳ/.test(tb) && /cờ BUOC_DA_XONG đang là B3/.test(tb) && /GIẢ LẬP: Google cắt ngang giữa lúc ghi Tổng nhập/.test(tb) &&
      /Việc phải làm: Bấm lại nút 3 chế độ 1/.test(tb), 'câu chết ở B4 thiếu bước / cờ / nguyên văn / việc phải làm: ' + tb);
    const y = await kichBan({ suaNguon: CHET_B5A });
    const tbY = String(y.kq.thongBao);
    dung(/ở bước B5a/.test(tbY) && /B5_DANG_LAM/.test(tbY) && tbY.indexOf('Bản sao này đã hỏng giữa chừng — xóa nó đi, tạo bản sao MỚI từ sổ tháng trước rồi chạy lại.') >= 0,
      'chết trong B5a phải nói bản sao đã hỏng: ' + tbY);
    dung(gopLN(y.ssMoi).indexOf('6:2:6:3') >= 0, 'chết giữa lúc chèn cột mà cụm gộp nhãn B6:C6 không được gộp lại (finally)');
    const tho = await kichBan({ suaNguon: ghep(CHET_B4, sua('    if (buocDangLam) throw loiGiuaChungTM_(err, buocDangLam, docCoTM_(ssMoi, 5));', '')) });
    dung(!/ở bước B4/.test(String(tho.kq.thongBao)), 'ĐỐI CHỨNG ÂM KHÔNG LỆCH: bỏ bọc câu mà vẫn thấy tên bước');
    return 'B4: "' + tb.slice(0, 110) + '…" · B5a: nêu B5_DANG_LAM + câu bản sao hỏng, cụm gộp vẫn đủ · đối chứng âm "ném lỗi thô" -> LỆCH ("' +
      String(tho.kq.thongBao).slice(0, 60) + '")';
  });

  await test('TM-W-29', 'YC-43.4: bấm lại trên bản sao kẹt B5_DANG_LAM → DỪNG ngay, câu nguyên văn "Bản sao này đã hỏng giữa chừng — xóa nó đi…", không một lệnh ghi; máy in cùng việc phải làm', async () => {
    const y = await kichBan({ suaNguon: CHET_B5A });
    bang(coTM(y.ssMoi, 5), 'B5_DANG_LAM', 'cờ sau khi chết trong B5a');
    const bamLai = (sim) => {
      sim.demLai();
      return JSON.parse(sim.vo.doPost({ postData: { contents: JSON.stringify({
        token: sim.biMat, phienBanMongDoi: sim.vo.PHIEN_BAN, hanhDong: 'taoThangMoi', thangCu: 9, namCu: 2026, idCu: sim.idCua('2026-09'),
        thangMoi: 10, namMoi: 2026, idMoi: sim.idCua('2026-10') }) } }).getContent());
    };
    const kq = bamLai(y.sim);
    bang(kq.loi, 'B5_DANG_LAM');
    dung(String(kq.thongBao).indexOf('KHÔNG KHỞI TẠO — Bản sao này đã hỏng giữa chừng — xóa nó đi, tạo bản sao MỚI từ sổ tháng trước rồi chạy lại.') === 0,
      'câu dừng phải mở đầu bằng nguyên văn BA: ' + kq.thongBao);
    bang(y.sim.nhatKyGhi.length, 0, 'bấm lại trên bản sao hỏng mà vẫn có lệnh ghi');
    const goiY = require('./gsheet-web-app').GOI_Y_TAO_THANG.B5_DANG_LAM;
    dung(/Xóa bản sao đó/.test(goiY) && /bản sao MỚI/.test(goiY), 'gợi ý phía máy cho B5_DANG_LAM không chỉ việc làm bản sao mới');
    // ĐỐI CHỨNG ÂM — câu 2.6.1 (bắt người mở D5 rồi tự sửa cờ).
    const z = await kichBan({ suaNguon: ghep(CHET_B5A, sua("        lyDo: CAU_BAN_SAO_HONG + ' (Lượt trước", "        lyDo: 'Hãy mở `Lợi nhuận` xem `D5` rồi sửa cờ' + ' (Lượt trước")) });
    const kqZ = bamLai(z.sim);
    dung(String(kqZ.thongBao).indexOf('Bản sao này đã hỏng giữa chừng') < 0, 'ĐỐI CHỨNG ÂM KHÔNG LỆCH: câu cũ mà vẫn chấm là đúng');
    return 'cờ B5_DANG_LAM → dừng, 0 lệnh ghi, "' + String(kq.thongBao).slice(0, 90) + '…" · đối chứng âm "câu 2.6.1" -> LỆCH';
  });

  RAC_MAY.forEach((d) => { try { fs.rmSync(d, { recursive: true, force: true }); } catch (e) { /* thư mục tạm */ } });

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  ' + h)); process.exit(1); }

  // ---------------------------------------------------------------- tiện ích dùng ở trên
  function donVung(sh, r1, c2) {
    Object.keys(sh.giaTri).forEach((k) => {
      const [r, c] = k.split(':').map(Number);
      if (r >= r1 && r <= 2000 && c <= c2 && !sh.congThuc[k]) delete sh.giaTri[k];
    });
    sh.gopO = sh.gopO.filter((g) => g.r2 < r1);
  }
})().catch((e) => { console.log('LỖI: ' + (e && e.stack)); process.exit(1); });

/** Chép TRẠNG THÁI file đã khởi tạo (kết quả cặp A) đè lên vỏ — dựng ca "bấm lại lần hai". */
function saoKetQua(nguon, dich) {
  dich.sheets.length = 0;
  saoFile(nguon, dich);
}

/** Ảnh chụp bỏ khối cờ N1:O5 (dấu giờ khác nhau giữa hai lần chạy là đúng). */
function chupBoCo(ss) {
  const a = chup(ss);
  const mp = a['Mapping_san_pham'];
  if (mp) ['gt', 'ct'].forEach((l) => Object.keys(mp[l]).forEach((k) => { const c = Number(k.split(':')[1]); if (c === 14 || c === 15) delete mp[l][k]; }));
  return a;
}
