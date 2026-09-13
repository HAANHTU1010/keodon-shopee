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
 * Mã bài `TM-W-xx`.
 */
'use strict';

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
