/**
 * test-tao-thang-moi-yc63.js — YC-63 (bản 2.8.3): sửa nút 3 chế độ 1 sau sự cố tạo sổ 2026-11 ngày 2/11/2026.
 * Chạy: `node node/test-tao-thang-moi-yc63.js`.
 *
 * Không mạng. Web App giả (`node/gia-lap-web-app.js`) chạy MÃ THẬT `src/ShellAppsScript.gs` + `src/TaoThangMoi.gs` trên sổ THẬT
 * `00_DAU_VAO/DEMO THÁNG-9-2026-KINH-DOANH-POB.xlsx` (bản sao làm tháng 10, đúng D-45), có DỰNG THÊM đúng khuyết tật đo được trên
 * sổ T10 thật (không đưa sổ T10 vào kho — sổ đó có dữ liệu người mua):
 *   · việc 1 — `Đơn ngoài` có ô công thức gõ tay trong DÒNG ĐƠN (I `=75000*25+70000`, L `=I-J`), dòng trống chỉ M mang `=I-J`;
 *              `TikTok Shop` không có công thức nào ở dòng trống (sổ T10: dòng 427→987);
 *   · việc 2 — `Tổng xuất`!I..N SUMIF tới sheet gian hàng: vùng nằm TRỌN trong khối xóa (T10 `Importmart` $4:$31, đơn tới dòng 33)
 *              và vùng CO một phần; ô ở sheet khác trỏ vào khối xóa; ô `Tổng xuất` lạ dạng;
 *   · việc 3 — `THU CHI B` sổ quỹ chạy liên tục, K4:R4 `SUMPRODUCT(($B$n:$B$1004=K3)*($F$n:$G$1004))` với n = dòng đầu tháng cũ.
 * Giả lập nay CO / #REF! tham chiếu từ sheet khác khi `deleteRows` y như Google (`doiA1KhiXoaDong`) — tới 2.8.2 nó bỏ qua nên không bài
 * nào thấy được sự cố. Bộ tính lại (`tinhLai`) tính `Tổng xuất` theo ĐÚNG vùng công thức và lan lỗi `#REF!` như Google.
 *
 * Mỗi bài có ĐỐI CHỨNG ÂM: đổi đúng đoạn mã vừa sửa về mã 2.8.2 (sửa nguồn trong bộ nhớ, `sua`) và chứng minh phép chấm TRƯỢT.
 * Mã bài `YC63-xx`.
 */
'use strict';

require('./mui-gio-du-an').ghimMuiGioDuAn();

const fs = require('fs');
const path = require('path');
const gl = require('./gia-lap-web-app');
const { napXlsxVaoGiaLap, a1SangR1C1, r1c1SangA1 } = require('./nap-xlsx-gia-lap');
const { tinhLaiBangTinh } = require('./tinh-lai-gia-lap');
const { tinhCongThucDon } = require('./tao-thang-moi');

const lop = gl.napLoiMay();
['DanhMuc', 'MapListing', 'Normalize'].forEach((t) => { global[t] = lop[t]; });

const SRC = path.join(__dirname, '..', 'src');
const FILE_T9 = path.join(__dirname, '..', '..', '..', '00_DAU_VAO', 'DEMO THÁNG-9-2026-KINH-DOANH-POB.xlsx');
const NGUON_GS = ['TaoThangMoi.gs', 'ShellAppsScript.gs'].map((f) => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n');

// ==================================================================== khung test bé (cùng kiểu test-tao-thang-moi-web.js)

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
async function doiChungAm(fn, moTa) {
  const ra = await fn();
  if (!Array.isArray(ra) || !ra.length) throw new Error('ĐỐI CHỨNG ÂM KHÔNG BÁO LỆCH: ' + moTa + ' — phép chấm này không bắt được gì');
  return 'đối chứng âm: ' + moTa + ' -> LỆCH (' + String(ra[0]).slice(0, 160) + ') ← đúng như phải thế';
}
/** Sửa nguồn cho đối chứng âm; mỗi mốc phải có ĐÚNG một chỗ, không thì dừng to. */
function sua(...cap) {
  for (let i = 0; i < cap.length; i += 2) {
    const n = NGUON_GS.split(cap[i]).length - 1;
    if (n !== 1) throw new Error('mốc đối chứng âm cần 1 chỗ, tìm được ' + n + ': ' + cap[i].slice(0, 80) + ' — mã đã đổi, sửa mốc, ĐỪNG bỏ bài');
  }
  return (s) => { for (let i = 0; i < cap.length; i += 2) s = s.split(cap[i]).join(cap[i + 1]); return s; };
}
/** 2.9.0: bỏ hẳn lệnh ghi khuôn ở vỏ Google — công thức của vỏ (bản sao tháng cũ) giữ nguyên như chưa có khuôn. */
const BO_KHUON = () => sua("    if (t.loai === 'GHI_KHUON') {\n      ghiKhuonTM_(sheetTM_(ssMoi, t.sheet), t, dem);", "    if (t.loai === 'GHI_KHUON') {\n      void ghiKhuonTM_;");
/** Mã 2.8.2 của việc 2: không có bước ghi lại vùng `Tổng xuất`. */
const MA_CU_TONG_XUAT = () => sua('    var ttB3b = tx.thaoTac.concat(tcb.thaoTac);', '    var ttB3b = tcb.thaoTac;');
/** Mã 2.8.2 của việc 3: không đổi dòng bắt đầu `THU CHI B`. */
const MA_CU_THU_CHI_B = () => sua('    var ttB3b = tx.thaoTac.concat(tcb.thaoTac);', '    var ttB3b = tx.thaoTac;');

// ==================================================================== sổ mẫu & kịch bản

let MAU = null;
async function napMau() {
  const sim = gl.taoGiaLap({});
  const ss = sim.khaiThang('2026-09', 'DEMO THÁNG-9-2026-KINH-DOANH-POB');
  await napXlsxVaoGiaLap(ss, FILE_T9);
  tinhLaiBangTinh(ss);
  MAU = { ss, ky: '2026-09', ten: 'DEMO THÁNG-9-2026-KINH-DOANH-POB' };
  sim.thaoGo();
}
function saoFile(nguon, dich) {
  nguon.getSheets().forEach((sh) => {
    const n = dich.themSheet(sh.ten);
    ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((k) => { n[k] = Object.assign({}, sh[k]); });
    n.gopO = sh.gopO.map((g) => Object.assign({}, g));
    n.soDongToiDa = sh.soDongToiDa;
  });
  return dich;
}
function chup(ss, chiSheet) {
  const a = {};
  ss.getSheets().forEach((sh) => {
    if (chiSheet && chiSheet.indexOf(sh.ten) < 0) return;
    const gt = {}, ct = {};
    Object.keys(sh.giaTri).forEach((k) => { const v = sh.giaTri[k]; if (v !== '' && v != null && !sh.congThuc[k]) gt[k] = v instanceof Date ? 'D' + v.getTime() : v; });
    Object.keys(sh.congThuc).forEach((k) => { if (sh.congThuc[k]) ct[k] = sh.congThuc[k]; });
    a[sh.ten] = { gt, ct, gop: sh.gopO.map((g) => [g.r1, g.c1, g.r2, g.c2].join(':')).sort() };
  });
  return a;
}
/** Danh sách ô khác nhau giữa hai ảnh chụp (`sheet!r:c loại`). */
function oKhac(a, b) {
  const ra = [];
  new Set(Object.keys(a).concat(Object.keys(b))).forEach((t) => {
    const x = a[t] || { gt: {}, ct: {}, gop: [] }, y = b[t] || { gt: {}, ct: {}, gop: [] };
    ['gt', 'ct'].forEach((l) => new Set(Object.keys(x[l]).concat(Object.keys(y[l]))).forEach((k) => { if (x[l][k] !== y[l][k]) ra.push(t + '!' + k + ' ' + l); }));
    if (x.gop.join('|') !== y.gop.join('|')) ra.push(t + ' gộp');
  });
  return ra;
}
function khiFlush(sim, ssMoi) {
  let moc = 0;
  return () => {
    const ds = sim.nhatKyGhi;
    if (ds.length < moc) moc = 0;
    let can = false;
    for (let i = moc; i < ds.length && !can; i++) if (ds[i].sheet !== 'Mapping_san_pham') can = true;
    moc = ds.length;
    if (can) tinhLaiBangTinh(ssMoi);
  };
}
const C = (ch) => { let n = 0; for (const x of ch) n = n * 26 + x.charCodeAt(0) - 64; return n; };
const A1 = (sh, r, c) => (sh.congThuc[r + ':' + c] ? r1c1SangA1(sh.congThuc[r + ':' + c], r, c).slice(1) : null);
const datCT = (sh, r, c, text) => { sh.congThuc[r + ':' + c] = a1SangR1C1(text, r, c); delete sh.giaTri[r + ':' + c]; };
const datGT = (sh, r, c, v) => { delete sh.congThuc[r + ':' + c]; if (v == null) delete sh.giaTri[r + ':' + c]; else sh.giaTri[r + ':' + c] = v; };
const coTM = (ss, r) => { const sh = ss.getSheetByName('Mapping_san_pham'); return sh ? sh.giaTri[r + ':15'] : undefined; };
function demCT(sh, c, r1, r2) {
  let n = 0;
  for (let r = r1 || 4; r <= (r2 || 2003); r++) if (sh.congThuc[r + ':' + c]) n++;
  return n;
}
const kiemLech = (kq) => (kq.kiem || []).filter((p) => !p.dat);
const moTaKiem = (kq) => kiemLech(kq).map((p) => p.ma + ' ' + p.chiTiet).join(' · ').slice(0, 400);

/**
 * Một lượt bấm nút 3 chế độ 1 trên cặp DEMO T9 → bản sao T10 (gọi lại khi Web App dừng gọn vì giờ).
 * @param {Object} o { vo(ssMoi, ssCu, sim), suaNguon, nguongGiay, toiDaLuot, sim (dùng lại sim cũ = "bấm lại") }
 */
async function kichBan(o) {
  o = o || {};
  let X = o.lai;
  if (!X) {
    const sim = gl.taoGiaLap({ ngay: '2026-10-01T02:00:00Z', suaNguon: o.suaNguon });
    const ssCu = saoFile(MAU.ss, sim.khaiThang('2026-09', MAU.ten));
    const ssMoi = saoFile(MAU.ss, sim.khaiThang('2026-10', 'THÁNG-10-2026-KINH-DOANH'));
    if (o.vo) o.vo(ssMoi, ssCu, sim);
    tinhLaiBangTinh(ssCu); tinhLaiBangTinh(ssMoi);      // Google luôn có giá trị đã tính của sổ đang dùng
    sim.khiFlush = khiFlush(sim, ssMoi);
    X = { sim, ssCu, ssMoi, truocCu: chup(ssCu), truocMoi: chup(ssMoi) };
  }
  const sim = X.sim;
  sim.demLai();
  const body = {
    token: sim.biMat, phienBanMongDoi: sim.vo.PHIEN_BAN, hanhDong: 'taoThangMoi',
    thangCu: 9, namCu: 2026, idCu: sim.idCua('2026-09'), thangMoi: 10, namMoi: 2026, idMoi: sim.idCua('2026-10'), nguongGiay: o.nguongGiay
  };
  Object.assign(body, o.body || {});
  let kq = null;
  for (let i = 0; i < (o.toiDaLuot || 3); i++) {
    kq = JSON.parse(sim.vo.doPost({ postData: { contents: JSON.stringify(body) } }).getContent());
    if (!(kq.ok && kq.xong === false)) break;
    body.buocDungTruoc = kq.buocKe;
  }
  X.kq = kq;
  return X;
}
function xong(X) { X.sim.thaoGo(); }

// ==================================================================== dựng khuyết tật đo trên sổ T10 thật

/** Tên viết tắt + mã hàng của mã đầu danh mục `Tổng tồn kho` (dòng 3). */
function maDau(ss) {
  const sh = ss.getSheetByName('Tổng tồn kho');
  return { ten: String(sh.giaTri['3:4']).trim(), ma: sh.giaTri['3:5'] != null ? sh.giaTri['3:5'] : null };
}

/** Việc 1 — `Đơn ngoài` ba dòng đơn như sổ T10: I hằng số gõ tay, L `=I-J` gõ khi nhập đơn, dòng OANH có M `=I-J`. */
function donNgoaiNhuT10(ss) {
  const sh = ss.getSheetByName('Đơn ngoài'), x = maDau(ss).ten;
  [4, 5].forEach((r) => { delete sh.congThuc[r + ':' + C('M')]; });
  datGT(sh, 4, C('C'), 'PHƯƠNG'); datGT(sh, 4, C('E'), x); datGT(sh, 4, C('H'), 2); datGT(sh, 4, C('I'), 320000); datGT(sh, 4, C('L'), 320000);
  datGT(sh, 5, C('C'), 'PHƯƠNG'); datGT(sh, 5, C('E'), x); datGT(sh, 5, C('H'), 1); datCT(sh, 5, C('I'), '75000*25+70000'); datGT(sh, 5, C('J'), 135000);
  datCT(sh, 5, C('L'), 'I5-J5');
  datGT(sh, 6, C('C'), 'OANH'); datGT(sh, 6, C('E'), x); datGT(sh, 6, C('H'), 1); datGT(sh, 6, C('I'), 150000); datGT(sh, 6, C('J'), 27000);
}

/** Việc 1 — `TikTok Shop` như sổ T10: KHÔNG có công thức nào dưới khối đơn; dòng 4 cột L là công thức HẰNG SỐ gõ tay. */
function tiktokShopNhuT10(ss) {
  const sh = ss.getSheetByName('TikTok Shop');
  const khoa = 4; // cột D
  let cuoi = 0;
  Object.keys(sh.giaTri).forEach((k) => { const [r, c] = k.split(':').map(Number); if (c === khoa && r >= 4 && !sh.congThuc[k] && sh.giaTri[k] !== '' && sh.giaTri[k] != null) cuoi = Math.max(cuoi, r); });
  Object.keys(sh.congThuc).forEach((k) => { const [r] = k.split(':').map(Number); if (r > cuoi) delete sh.congThuc[k]; });
  datCT(sh, 4, C('L'), '150000-20000');
  return cuoi;
}

/** Việc 2 — thêm đơn `Importmart` dòng 4→10 (chép giá trị gõ tay của dòng 4) để khối xóa dài như sổ T10. */
function importmartToi10(ss) {
  const sh = ss.getSheetByName('Importmart');
  for (let r = 5; r <= 10; r++) {
    for (let c = 1; c <= 15; c++) {
      const k4 = '4:' + c;
      if (sh.congThuc[k4] || sh.giaTri[k4] == null || sh.giaTri[k4] === '') continue;
      if (!sh.congThuc[r + ':' + c]) sh.giaTri[r + ':' + c] = sh.giaTri[k4];
    }
  }
}
/** `Tổng xuất` cột K (Importmart): đáy vùng = `day` — đáy ≤ khối xóa (10) là vùng nằm TRỌN trong khối, như T10 `$4:$31`. */
function tongXuatKToi(ss, day) {
  const sh = ss.getSheetByName('Tổng xuất');
  Object.keys(sh.congThuc).forEach((k) => {
    const [r, c] = k.split(':').map(Number);
    if (c !== C('K') || r < 4) return;
    const f = A1(sh, r, c);
    if (/^SUMIF\(Importmart!/.test(f)) datCT(sh, r, c, f.replace(/\$M\$4:\$M\$\d+/, '$M$4:$M$' + day).replace(/\$G\$4:\$G\$\d+/, '$G$4:$G$' + day));
  });
}

/** Việc 3 — `THU CHI B` sổ quỹ chạy liên tục: tháng 8 dòng 5→12, tháng 9 dòng 13→25; K4:P4 SUMPRODUCT bắt đầu dòng 13 (đầu tháng 9). */
function themThuChiB(ss) {
  const sh = ss.themSheet('THU CHI B');
  const nhan = ['NGÀY', 'NGUỒN', 'DANH MỤC', 'OANH', 'PHƯƠNG', 'OANH', 'PHƯƠNG'];
  nhan.forEach((t, i) => { sh.giaTri['3:' + (i + 1)] = t; });
  ['Marketing', 'Phí ship', 'Phí in', 'Phí khác', 'Phí Đóng Gói', 'Phí rút tiền shopee', 'Mặt bằng'].forEach((t, i) => { sh.giaTri['3:' + (C('K') + i)] = t; });
  datCT(sh, 4, C('D'), 'SUM(D5:D1004)'); datCT(sh, 4, C('E'), 'SUM(E5:E1004)'); datCT(sh, 4, C('F'), 'SUM(F5:F1004)'); datCT(sh, 4, C('G'), 'SUM(G5:G1004)');
  datCT(sh, 4, C('H'), 'D4+E4-F4-G4');
  datGT(sh, 4, C('I'), 3000000);
  // J4 CỐ Ý mang đúng dạng SUMPRODUCT bắt đầu dòng 13 — H4/I4/J4 tuyệt đối không được đụng dù khớp dạng.
  datCT(sh, 4, C('J'), 'SUMPRODUCT(($B$13:$B$1004="Marketing")*($F$13:$G$1004))');
  for (let i = 0; i < 6; i++) { const c = C('K') + i; datCT(sh, 4, c, 'SUMPRODUCT(($B$13:$B$1004=' + String.fromCharCode(64 + c) + '3)*($F$13:$G$1004))'); }
  // Q4: hai vùng bắt đầu ở hai dòng khác nhau → không khớp dạng → không sửa, cảnh báo.
  datCT(sh, 4, C('Q'), 'SUMPRODUCT(($B$13:$B$1004=Q3)*($F$12:$G$1004))');
  const loai = ['Marketing', 'Phí ship', 'Phí in', 'Phí khác', 'Phí Đóng Gói'];
  for (let r = 5; r <= 25; r++) {
    const thang = r <= 12 ? 7 : 8;             // tháng JS: 7 = tháng 8, 8 = tháng 9
    sh.giaTri[r + ':1'] = new Date(2026, thang, r <= 12 ? r : r - 10);
    sh.giaTri[r + ':2'] = loai[r % loai.length];
    sh.giaTri[r + ':3'] = 'khoản ' + r;
    sh.giaTri[r + ':' + (r % 2 ? 6 : 7)] = 1000 * r;
  }
  return sh;
}
/** `Lợi nhuận` cột D tháng cũ: dòng 13 và 14 trỏ `THU CHI B` (như `Lợi nhuận`!D14…D18 sổ T10). */
function loiNhuanTroThuChiB(ss) {
  const sh = ss.getSheetByName('Lợi nhuận');
  datCT(sh, 13, 4, "'THU CHI B'!O4");
  datCT(sh, 14, 4, "'THU CHI B'!K4+'THU CHI B'!L4");
}

// ====================================================================================================

(async function chay() {
  console.log('=== YC-63 (2.8.3) + KHUÔN CÔNG THỨC CHUẨN (2.9.0): nút 3 chế độ 1 ===\n');
  if (!fs.existsSync(FILE_T9)) { console.log('HỎNG  thiếu file dữ liệu thật: ' + FILE_T9); process.exit(1); }
  await napMau();

  await test('YC63-00', 'giả lập Google: xóa dòng ở một sheet làm CO / #REF! tham chiếu từ sheet khác (như Google), không đụng tham chiếu ngoài khối', async () => {
    const d = gl.doiA1KhiXoaDong;
    bang(d("SUMIF(Importmart!$M$4:$M$31;'Tổng xuất'!$E4;Importmart!$G$4:$G$31)", 'Importmart', 4, 30), "SUMIF(#REF!;'Tổng xuất'!$E4;#REF!)", 'vùng nằm trọn trong khối');
    bang(d("SUMIF('Shopee mall'!$M$4:$M$2000;$E4;'Shopee mall'!$G$4:$G$2000)", 'Shopee mall', 4, 454), "SUMIF('Shopee mall'!$M$4:$M$1546;$E4;'Shopee mall'!$G$4:$G$1546)", 'co một phần');
    bang(d("'Shopee mall'!L3+'Shopee mall'!L10+'Shopee mall'!L900+Offood!L10+\"Shopee mall!L10\"", 'Shopee mall', 4, 454),
      "'Shopee mall'!L3+#REF!+'Shopee mall'!L446+Offood!L10+\"Shopee mall!L10\"", 'ô đơn trên / trong / dưới khối, sheet khác, chuỗi');
    return 'Importmart $4:$31 xóa 30 dòng → #REF! · Shopee mall $4:$2000 xóa 454 dòng → $4:$1546';
  });

  // ---------------------------------------------------------------- VIỆC 1
  await test('YC63-01', 'việc 1 (nghiệm thu 2a): `Đơn ngoài` có ô hằng số + `=I-J` ở cột L TRONG dòng đơn → cột kéo/mẫu chỉ đo ở dòng trống: ' +
    'F,G,M,N,O; I4:I2003 rỗng; L không công thức; M đủ 2.000 ô; L3 = M3 = 0; K-9 ĐẠT; 11/11', async () => {
    const vo = (m, c) => { donNgoaiNhuT10(m); donNgoaiNhuT10(c); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true && X.kq.kiem.length === 13, 'phải 13/13: ' + moTaKiem(X.kq) + ' ' + String(X.kq.thongBao).slice(0, 300));
    const dn = X.ssMoi.getSheetByName('Đơn ngoài');
    bang(demCT(dn, C('I')), 0, 'I4:I2003 không được có công thức');
    bang(Object.keys(dn.giaTri).filter((k) => { const [r, c] = k.split(':').map(Number); return c === C('I') && r >= 4 && dn.giaTri[k] !== '' && dn.giaTri[k] != null; }).length, 0, 'I4:I2003 không được có giá trị');
    bang(demCT(dn, C('L')), 0, 'L (PHƯƠNG) không được mang công thức ở dòng trống');
    bang(['F', 'G', 'M', 'N', 'O'].map((ch) => demCT(dn, C(ch))), [2000, 2000, 2000, 2000, 2000], 'F,G,M,N,O đủ 2.000 ô');
    bang(A1(dn, 4, C('M')), 'IFERROR(I4-J4,"")', 'M4 (khuôn chuẩn)');
    const k9 = X.kq.kiem.filter((p) => p.ma === 'K-9')[0];
    dung(k9 && k9.dat, 'K-9 phải ĐẠT: ' + JSON.stringify(k9));
    // Nghiệm thu 3 (phần đơn ngoài): user gõ một đơn ngoài OANH vào tháng mới → doanh số tính MỘT lần.
    datGT(dn, 4, C('C'), 'OANH'); datGT(dn, 4, C('E'), maDau(X.ssMoi).ten); datGT(dn, 4, C('H'), 1); datGT(dn, 4, C('I'), 200000); datGT(dn, 4, C('J'), 20000);
    const giaTriO = (ten, r, c) => (ten === 'Đơn ngoài' ? (dn.giaTri[r + ':' + c] || 0) : 0);
    const tienL = A1(dn, 4, C('L')) ? tinhCongThucDon(A1(dn, 4, C('L')), 'Đơn ngoài', giaTriO) : (dn.giaTri['4:' + C('L')] || 0);
    const tienM = A1(dn, 4, C('M')) ? tinhCongThucDon(A1(dn, 4, C('M')), 'Đơn ngoài', giaTriO) : (dn.giaTri['4:' + C('M')] || 0);
    bang(tienL + tienM, 180000, 'đơn ngoài 200.000 − 20.000 chỉ được tính MỘT lần (L + M)');
    xong(X);
    return 'khuôn F,G,M,N,O · I/L trống · M4 =IFERROR(I4-J4,"") · đơn thử L+M = 180.000 (một lần) · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: BO_KHUON() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-9' || p.ma === 'K-13').map((p) => 'không ghi khuôn: ' + p.ma + ' ' + p.chiTiet);
      const dz = Z.ssMoi.getSheetByName('Đơn ngoài');
      if (demCT(dz, C('I'))) ra.push('I mang ' + demCT(dz, C('I')) + ' ô công thức (I4 =' + A1(dz, 4, C('I')) + ')');
      xong(Z);
      return ra;
    }, 'không ghi khuôn (công thức gõ tay trong dòng đơn của bản sao ở lại)');
  });

  await test('YC63-02', 'việc 1 + khuôn 2.9.0 — `TikTok Shop` KHÔNG có công thức ở dòng trống (như sổ T10), L4 là hằng số gõ tay → khuôn chuẩn ghi ' +
    'E/F/L/O/P đủ 2.000 ô, L4 = IFERROR(H4-I4-J4-K4,""), không còn hằng số', async () => {
    const vo = (m, c) => { tiktokShopNhuT10(m); tiktokShopNhuT10(c); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true, 'phải 13/13: ' + moTaKiem(X.kq) + ' ' + String(X.kq.thongBao).slice(0, 300));
    const ts = X.ssMoi.getSheetByName('TikTok Shop');
    bang(['E', 'F', 'L', 'O', 'P'].map((ch) => demCT(ts, C(ch))), [2000, 2000, 2000, 2000, 2000], 'E,F,L,O,P đủ 2.000 ô');
    bang(A1(ts, 4, C('L')), 'IFERROR(H4-I4-J4-K4,"")', 'L4 đúng khuôn, không phải hằng số gõ tay');
    xong(X);
    return 'L4 =IFERROR(H4-I4-J4-K4,"") · 5 cột × 2.000 ô · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: BO_KHUON() });
      const ts2 = Z.ssMoi.getSheetByName('TikTok Shop');
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-13').map((p) => 'không khuôn: K-13 ' + p.chiTiet);
      if (demCT(ts2, C('L')) !== 2000) ra.push('L chỉ còn ' + demCT(ts2, C('L')) + ' ô công thức');
      xong(Z);
      return ra;
    }, 'không ghi khuôn');
  });

  // ---------------------------------------------------------------- VIỆC 2
  await test('YC63-03', 'việc 2 (nghiệm thu 2b — vùng nằm TRỌN trong khối xóa): `Tổng xuất`!K trỏ `Importmart`!$4:$8, đơn tới dòng 10 → B3b ghi lại ' +
    '$4:$2003, không #REF!, K-6/K-11 ĐẠT, `Tổng tồn kho`!K1 là số', async () => {
    const vo = (m, c) => { [m, c].forEach((s) => { importmartToi10(s); tongXuatKToi(s, 8); }); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true, 'phải 13/13: ' + moTaKiem(X.kq));
    const tx = X.ssMoi.getSheetByName('Tổng xuất');
    const sai = [];
    Object.keys(tx.congThuc).forEach((k) => {
      const [r, c] = k.split(':').map(Number);
      if (r < 4 || c < C('I') || c > C('N')) return;
      const f = A1(tx, r, c);
      if (/#REF!/.test(f) || (f.match(/\$\d+(?=[,;)])/g) || []).some((x) => x !== '$2003')) sai.push(k + ' ' + f);
    });
    bang(sai.slice(0, 3), [], 'mọi ô I..N phải trỏ $4:$2003');
    dung(typeof X.ssMoi.getSheetByName('Tổng tồn kho').giaTri['1:11'] === 'number', 'Tổng tồn kho K1 phải là số');
    bang(X.kq.nhatKy.filter((s) => /^B3b · /.test(s)).length, 1, 'nhật ký có bước B3b');
    xong(X);
    return 'K: ' + A1(tx, 4, C('K')) + ' · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: MA_CU_TONG_XUAT() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-11' || p.ma === 'K-6').map((p) => p.ma + ' ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'mã 2.8.2 không ghi lại vùng `Tổng xuất` (Google để #REF!)');
  });

  await test('YC63-04', 'việc 2 (nghiệm thu 2b — vùng CO một phần) + nghiệm thu 3: sau khi tạo, đơn `Importmart` ở dòng 4 VÀ dòng 1500 đều được ' +
    '`Tổng xuất` trừ tồn; đơn ngoài tính một lần', async () => {
    const vo = (m, c) => { [m, c].forEach((s) => importmartToi10(s)); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true, 'phải 13/13: ' + moTaKiem(X.kq));
    const thuDon = (Y) => {
      const im = Y.ssMoi.getSheetByName('Importmart'), x = maDau(Y.ssMoi);
      [[4, 2], [1500, 3]].forEach(([r, sl]) => { datGT(im, r, C('A'), new Date(2026, 9, 2)); datGT(im, r, C('D'), x.ten); datGT(im, r, C('G'), sl); datGT(im, r, C('H'), 100000 * sl); });
      tinhLaiBangTinh(Y.ssMoi);
      const tk = Y.ssMoi.getSheetByName('Tổng tồn kho');
      return { xuat: tk.giaTri['3:10'], k1: tk.giaTri['1:11'] };
    };
    const t = thuDon(X);
    bang(t.xuat, 5, '`Tổng tồn kho`!J (xuất) của mã đầu danh mục = 2 + 3 (cả đơn dòng 1500)');
    xong(X);
    return 'xuất = ' + t.xuat + ' (dòng 4: 2 + dòng 1500: 3) · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: MA_CU_TONG_XUAT() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-11').map((p) => 'K-11 ' + p.chiTiet);
      const tz = thuDon(Z);
      if (tz.xuat !== 5) ra.push('thiếu thầm: xuất = ' + tz.xuat + ' (đơn dòng 1500 nằm dưới đáy vùng đã co)');
      xong(Z);
      return ra;
    }, 'mã 2.8.2 để Google co vùng `Tổng xuất`');
  });

  await test('YC63-05', 'việc 2b: ô ở sheet KHÔNG bị dọn (`Doanh thu thuế`) trỏ `Importmart`!$L$4:$L$6 nằm trọn trong khối xóa → DỪNG trước B1, mã ' +
    'THAM_CHIEU_SE_VO, nêu ô + việc phải làm, sổ mới KHÔNG đổi ô nào; cùng công thức ở `Thông tin shop ` (INV-10) không đọc, không chặn', async () => {
    const vo = (m, c) => { [m, c].forEach((s) => { importmartToi10(s); datCT(s.getSheetByName('Doanh thu thuế'), 1, 26, 'SUM(Importmart!$L$4:$L$6)'); }); };
    const X = await kichBan({ vo });
    bang([X.kq.ok, X.kq.loi], [false, 'THAM_CHIEU_SE_VO'], 'mã dừng');
    dung(/`Doanh thu thuế`!Z1 trỏ Importmart!\$L\$4:\$L\$6/.test(X.kq.thongBao) && /Việc phải làm/.test(X.kq.thongBao) && /chưa ghi ô nào/.test(X.kq.thongBao),
      'câu dừng phải nêu ô + việc phải làm: ' + X.kq.thongBao);
    bang(oKhac(X.truocMoi, chup(X.ssMoi)).slice(0, 3), [], 'sổ mới không đổi ô nào');
    xong(X);
    // INV-10: đặt công thức đó ở `Thông tin shop ` — tool không đọc sheet này nên không chặn, và không có lệnh đọc nào chạm nó.
    const Y = await kichBan({ vo: (m, c) => { [m, c].forEach((s) => { importmartToi10(s); datCT(s.getSheetByName('Thông tin shop '), 1, 26, 'SUM(Importmart!$L$4:$L$6)'); }); } });
    dung(Y.kq.ok === true, '`Thông tin shop ` không được làm dừng: ' + Y.kq.loi + ' ' + moTaKiem(Y.kq));
    bang(Y.sim.nhatKyDoc.filter((d) => d.sheet === 'Thông tin shop ').length, 0, 'không lệnh đọc nào chạm `Thông tin shop `');
    xong(Y);
    return String(X.kq.thongBao).slice(0, 160) + '… · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: sua('    if (vo.tong) {', '    if (false) {') });
      const f = A1(Z.ssMoi.getSheetByName('Doanh thu thuế'), 1, 26);
      xong(Z);
      return /#REF!/.test(f) ? ['bỏ phép kiểm: chạy tiếp và `Doanh thu thuế`!Z1 thành =' + f] : [];
    }, 'bỏ phép kiểm trước B1');
  });

  await test('YC63-06', 'việc 2a + khuôn 2.9.0: ô `Tổng xuất`!K5 lạ dạng (trỏ `Offood` dưới tiêu đề Importmart) → khuôn ghi đè đúng SUMIF tới `Importmart` $4:$2003, 13/13 (2.8.3 dừng TONG_XUAT_LA_DANG bắt sửa tay)', async () => {
    const vo = (m, c) => { [m, c].forEach((s) => datCT(s.getSheetByName('Tổng xuất'), 5, C('K'), "SUMIF(Offood!$M$4:$M$70,'Tổng xuất'!$E5,Offood!$G$4:$G$70)")); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq));
    const k5 = A1(X.ssMoi.getSheetByName('Tổng xuất'), 5, C('K'));
    bang(k5, 'SUMIF(Importmart!$M$4:$M$2003,$E5,Importmart!$G$4:$G$2003)', 'K5 đúng khuôn');
    xong(X);
    return 'K5 =' + k5 + ' · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: MA_CU_TONG_XUAT() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-11').map((p) => 'không ghi khuôn Tổng xuất: K-11 ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'không ghi khuôn `Tổng xuất`');
  });

  await test('YC63-07', 'việc 2 — lượt CHẠY TIẾP: Google chết ở B3b SAU khi B3 đã xóa dòng (`Tổng xuất`!K đã #REF!) → bấm lại: khuôn không cần ' +
    'công thức của vỏ, 13/13, mọi ô $4:$2003', async () => {
    const vo = (m, c, sim) => { [m, c].forEach((s) => { importmartToi10(s); tongXuatKToi(s, 8); }); sim.datLoi({ quaHan: { kieu: 'congThuc', sheet: 'Tổng xuất', lan: [1], cau: 'khac' } }); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === false && coTM(X.ssMoi, 5) === 'B3', 'lượt 1 phải chết ở B3b, cờ B3: ' + X.kq.loi + ' cờ ' + coTM(X.ssMoi, 5));
    dung(/#REF!/.test(A1(X.ssMoi.getSheetByName('Tổng xuất'), 4, C('K'))), 'sau lượt 1, K4 phải đã #REF! (Google co khi xóa dòng)');
    const Y = await kichBan({ lai: X });
    dung(Y.kq.ok === true, 'bấm lại phải 11/11: ' + Y.kq.loi + ' ' + moTaKiem(Y.kq) + String(Y.kq.thongBao).slice(0, 300));
    const k4 = A1(Y.ssMoi.getSheetByName('Tổng xuất'), 4, C('K'));
    bang(k4, 'SUMIF(Importmart!$M$4:$M$2003,$E4,Importmart!$G$4:$G$2003)', 'K4 sau khi bấm lại');
    xong(Y);
    return 'lượt 1 chết ở B3b (cờ B3, K4 #REF!) → bấm lại: K4 =' + k4 + ' · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: MA_CU_TONG_XUAT() });
      const W = await kichBan({ lai: Z });
      const ra = kiemLech(W.kq).filter((p) => p.ma === 'K-11' || p.ma === 'K-6').map((p) => 'không ghi khuôn: bấm lại vẫn ' + p.ma + ' ' + p.chiTiet);
      xong(W);
      return ra;
    }, 'không ghi khuôn `Tổng xuất` ở lượt chạy tiếp');
  });

  // ---------------------------------------------------------------- VIỆC 3
  await test('YC63-08', 'việc 3 (nghiệm thu 2c): `THU CHI B` sổ quỹ chạy liên tục → K4:P4 dòng bắt đầu 13 → 26 (dòng cuối có ngày 25 + 1), giữ đáy; ' +
    'H4/I4/J4 (J4 cố ý cùng dạng) KHÔNG đụng; Q4 lạ dạng không sửa + cảnh báo; mọi ô khác y nguyên; K-10 ĐẠT', async () => {
    const vo = (m, c) => { [m, c].forEach((s) => { themThuChiB(s); loiNhuanTroThuChiB(s); }); };
    const X = await kichBan({ vo });
    dung(X.kq.ok === true && X.kq.kiem.length === 13, 'phải 13/13: ' + moTaKiem(X.kq) + ' ' + String(X.kq.thongBao).slice(0, 300));
    const sh = X.ssMoi.getSheetByName('THU CHI B');
    for (let i = 0; i < 6; i++) {
      const c = C('K') + i, ch = String.fromCharCode(64 + c);
      bang(A1(sh, 4, c), 'SUMPRODUCT(($B$26:$B$1004=' + ch + '3)*($F$26:$G$1004))', ch + '4');
    }
    bang(A1(sh, 4, C('J')), 'SUMPRODUCT(($B$13:$B$1004="Marketing")*($F$13:$G$1004))', 'J4 không đụng');
    bang([A1(sh, 4, C('H')), sh.giaTri['4:' + C('I')]], ['D4+E4-F4-G4', 3000000], 'H4/I4 không đụng');
    bang(A1(sh, 4, C('Q')), 'SUMPRODUCT(($B$13:$B$1004=Q3)*($F$12:$G$1004))', 'Q4 lạ dạng không sửa');
    dung((X.kq.canhBao || []).some((s) => /`THU CHI B`!Q4: các vùng bắt đầu ở nhiều dòng khác nhau/.test(s)), 'cảnh báo Q4');
    dung((X.kq.nhatKy || []).some((s) => /dòng cuối có ngày ở cột A = 25 \(\d\d\/09\/2026\) → chi phí tháng mới tính từ dòng 26/.test(s) && /bắt đầu dòng 13 \(ngày 03\/09\/2026\), dòng 12 ngày 12\/08\/2026/.test(s)),
      'nhật ký phải nêu số đo dòng bắt đầu: ' + JSON.stringify((X.kq.nhatKy || []).filter((s) => /THU CHI B/.test(s))));
    const khac = oKhac(chup(X.ssCu, ['THU CHI B']), chup(X.ssMoi, ['THU CHI B']));
    bang(khac.sort(), ['K', 'L', 'M', 'N', 'O', 'P'].map((ch) => 'THU CHI B!4:' + C(ch) + ' ct').sort(), 'chỉ đúng K4:P4 đổi, mọi ô khác y nguyên');
    const k10 = X.kq.kiem.filter((p) => p.ma === 'K-10')[0];
    dung(k10 && k10.dat && /2\/2/.test(k10.chiTiet), 'K-10: ' + JSON.stringify(k10));
    xong(X);
    return 'K4 =' + A1(sh, 4, C('K')) + ' · K-10 ' + k10.chiTiet + ' · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo, suaNguon: MA_CU_THU_CHI_B() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-10').map((p) => 'mã 2.8.2: K-10 ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'mã 2.8.2 không đổi dòng bắt đầu `THU CHI B`');
  });

  await test('YC63-09', 'việc 3c: sổ KHÔNG có `THU CHI B` mà có `Chi Phí Hàng Ngày` → luồng cũ `thaoTacChiPhi` (dọn dữ liệu), K-10 "không áp dụng"', async () => {
    const X = await kichBan({});
    dung(X.kq.ok === true, 'phải 13/13: ' + moTaKiem(X.kq));
    const cp = X.ssMoi.getSheetByName('Chi Phí Hàng Ngày');
    const conDuLieu = Object.keys(cp.giaTri).filter((k) => { const [r, c] = k.split(':').map(Number); return r >= 3 && c <= 4 && !cp.congThuc[k] && cp.giaTri[k] !== '' && cp.giaTri[k] != null; });
    bang(conDuLieu.length, 0, '`Chi Phí Hàng Ngày` dòng dữ liệu phải được dọn');
    const k10 = X.kq.kiem.filter((p) => p.ma === 'K-10')[0];
    dung(k10.dat && /không áp dụng/.test(k10.chiTiet), 'K-10: ' + JSON.stringify(k10));
    xong(X);
    return 'Chi Phí Hàng Ngày dọn sạch · K-10 ' + k10.chiTiet;
  });

  await test('YC63-10', 'tương thích: máy 2.8.2 (đếm cứng `kiem.length === 8`) gọi Google 2.8.3 — đủ 11/11 → Google trả 8 phép gốc + ghi K-9…K-11 vào ' +
    'nhật ký, máy cũ khai link; lệch một phép mới → trả đủ, máy cũ KHÔNG khai link', async () => {
    const mayCu = (kq) => kq.ok === true && Array.isArray(kq.kiem) && kq.kiem.length === 8 && kq.kiem.every((p) => p && p.dat === true);   // luật 3 của nút 3 bản 2.8.2
    const X = await kichBan({ body: { banMay: '2.8.2', phienBanMongDoi: '2.8.3' } });
    dung(mayCu(X.kq), 'máy 2.8.2 phải khai được link khi đủ 11/11: ' + JSON.stringify((X.kq.kiem || []).map((p) => p.ma)));
    dung(/^DA_KHOI_TAO_/.test(String(coTM(X.ssMoi, 1))), 'cờ DA_KHOI_TAO');
    dung((X.kq.nhatKy || []).some((s) => /^Tự kiểm thêm .*K-9 ĐẠT .*K-10 ĐẠT .*K-11 ĐẠT .*K-12 ĐẠT .*K-13 ĐẠT /.test(s)), 'nhật ký phải nêu K-9…K-13 đã đạt');
    xong(X);
    // `THU CHI B`!K4 có hai vùng bắt đầu ở hai dòng khác nhau (tool không sửa) mà `Lợi nhuận`!D14 trỏ vào → K-10 lệch → máy cũ thấy bảng đủ, không khai link.
    const lechK10 = (m, c) => [m, c].forEach((s) => { const sh = themThuChiB(s); loiNhuanTroThuChiB(s); datCT(sh, 4, C('K'), 'SUMPRODUCT(($B$13:$B$1004=K3)*($F$12:$G$1004))'); });
    const Y = await kichBan({ vo: lechK10, body: { banMay: '2.8.2', phienBanMongDoi: '2.8.3' } });
    dung(Y.kq.ok === false && Y.kq.kiem.length === 13 && !mayCu(Y.kq), 'lệch K-10: máy cũ không được khai link, bảng đủ 13: ' + Y.kq.loi + ' ' + (Y.kq.kiem || []).length + ' ' + moTaKiem(Y.kq));
    xong(Y);
    return 'đủ 13/13 → máy cũ thấy 8/8 + nhật ký K-9…K-13 · K-10 lệch → ' + Y.kq.loi + ', 13 phép · ' + await doiChungAm(async () => {
      const Z = await kichBan({ body: { banMay: '2.8.2', phienBanMongDoi: '2.8.3' }, suaNguon: sua("    if (kiem.dat && /^\\d+(\\.\\d+)+$/.test(banMayGui) && !banDuTu_(banMayGui, '2.8.3')) {", '    if (false) {') });
      const ra = mayCu(Z.kq) ? [] : ['không có lớp tương thích: máy 2.8.2 nhận ' + Z.kq.kiem.length + ' phép → "KHÔNG KHAI LINK" dù sổ đã DA_KHOI_TAO'];
      xong(Z);
      return ra;
    }, 'bỏ lớp tương thích máy cũ');
  });

  // ---------------------------------------------------------------- 2.9.0: KHUÔN CÔNG THỨC CHUẨN (chủ dự án 3/11)
  /** Dựng đúng kiểu lệch đo trên sổ T11 thật: đáy vùng tra 434/435/457/514/714, cột Mã hàng không IFERROR, ô tổng giãn 2688/3020. */
  const lechNhuT11 = (s) => {
    const sm = s.getSheetByName('Shopee mall'), tn = s.getSheetByName('Tổng nhập'), tk = s.getSheetByName('Tổng tồn kho');
    for (let r = 25; r <= 60; r++) {
      datCT(sm, r, C('M'), "INDEX('Tổng tồn kho'!$C$3:$G$435, MATCH($D" + r + ",'Tổng tồn kho'!$D$3:$D$435,0),3)");
      datCT(sm, r, C('E'), "IFERROR(INDEX('Tổng tồn kho'!$C$3:$G$457, MATCH($D" + r + ",'Tổng tồn kho'!$D$3:$D$457,0),1),\"\")");
      datCT(sm, r, C('L'), 'H' + r + '-I' + r + '-J' + r + '-K' + r);
    }
    for (let r = 95; r <= 120; r++) datCT(tn, r, C('G'), "IFERROR(INDEX('Tổng tồn kho'!$C$3:$G$434,MATCH('Tổng nhập'!$D" + r + ",'Tổng tồn kho'!$D$3:$D$434,0),5),\"\")");
    datCT(sm, 3, C('H'), 'SUM(H4:H2688)');
    datCT(tk, 5, C('I'), "SUMIF('Tổng nhập'!$E$4:$E$3020,'Tổng tồn kho'!E5,'Tổng nhập'!$H$4:$H$3020)");
  };

  await test('KC-01', 'khuôn 2.9.0: vỏ mang công thức lệch như sổ T11 thật (đáy 434/435/457, Mã hàng không IFERROR, I tồn kho 3020) → mọi ô khuôn ' +
    'đúng công thức chuẩn, K-13 ĐẠT; 13/13', async () => {
    const X = await kichBan({ vo: (m, c) => { lechNhuT11(m); lechNhuT11(c); } });
    dung(X.kq.ok === true && X.kq.kiem.length === 13, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq));
    const sm = X.ssMoi.getSheetByName('Shopee mall'), tn = X.ssMoi.getSheetByName('Tổng nhập'), tk = X.ssMoi.getSheetByName('Tổng tồn kho');
    bang(A1(sm, 30, C('M')), "IFERROR(INDEX('Tổng tồn kho'!$C$3:$G$2003,MATCH($D30,'Tổng tồn kho'!$D$3:$D$2003,0),3),\"\")", 'Shopee mall M30');
    bang(A1(sm, 2003, C('N')), "IFERROR(INDEX('Tổng tồn kho'!$E$3:$H$2003,MATCH(M2003,'Tổng tồn kho'!$E$3:$E$2003,0),4),\"\")", 'Shopee mall N2003');
    bang(A1(tn, 100, C('G')), "IFERROR(INDEX('Tổng tồn kho'!$C$3:$G$2003,MATCH($D100,'Tổng tồn kho'!$D$3:$D$2003,0),5),\"\")", 'Tổng nhập G100');
    bang(A1(tk, 5, C('I')), "SUMIF('Tổng nhập'!$E$4:$E$2003,$E5,'Tổng nhập'!$H$4:$H$2003)", 'Tổng tồn kho I5');
    bang(A1(sm, 3, C('H')), 'SUM(H4:H2003)', 'Shopee mall H3');
    const k13 = X.kq.kiem.filter((p) => p.ma === 'K-13')[0];
    xong(X);
    return 'K-13 ' + k13.chiTiet + ' · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo: (m, c) => { lechNhuT11(m); lechNhuT11(c); }, suaNguon: BO_KHUON() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-13').map((p) => 'không ghi khuôn: K-13 ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'không ghi khuôn (công thức lệch của bản sao ở lại)');
  });

  await test('KC-02', 'khuôn 2.9.0: ô TỔNG ghi SAU khi nới lưới → không bị Google giãn (sổ T11: `Shopee mall`!H3 = SUM(H4:H2688)); mọi ô tổng tới đúng 2003, ' +
    'K-12 ĐẠT', async () => {
    const X = await kichBan({});
    dung(X.kq.ok === true, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq));
    const tong = [['Shopee mall', 3, 'H'], ['TikTok Shop', 3, 'L'], ['Đơn ngoài', 3, 'M'], ['Tổng nhập', 2, 'I'], ['Tổng tồn kho', 1, 'K'], ['Tổng xuất', 2, 'O']]
      .map(([t, r, ch]) => t + '!' + ch + r + '=' + A1(X.ssMoi.getSheetByName(t), r, C(ch)));
    bang(tong.filter((x) => !/2003\)$/.test(x)), [], 'ô tổng tới 2003');
    xong(X);
    return tong.slice(0, 3).join(' · ') + ' · ' + await doiChungAm(async () => {
      // Mã 2.8.3: ghi ô tổng TRƯỚC lệnh kéo/khuôn (lệnh đó nới lưới) → Google giãn đáy.
      const Z = await kichBan({ suaNguon: sua(
        '    // tới 2003) và đáy = `DONG_KEO_CT` — xem `oTongDayChuan`.\n    tt = tt.concat(oTongDayChuan(ten, boCuc.cotTong, 3));', '    // (đối chứng âm)',
        '    tt.push(opKhuon(ten, 4, DONG_KEO_CT, khuonSheetDon(boCuc)));', '    tt = tt.concat(oTongDayChuan(ten, boCuc.cotTong, 3));\n    tt.push(opKhuon(ten, 4, DONG_KEO_CT, khuonSheetDon(boCuc)));') });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-12').map((p) => 'ghi tổng trước khi nới lưới: K-12 ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'ghi ô tổng trước lệnh nới lưới (như 2.8.3)');
  });

  await test('KC-03', 'khuôn 2.9.0: sheet NGOÀI khuôn (`THU CHI`, `Lazada`, `Lịch Làm Việc`, `bảng giá sophie`, `Doanh thu thuế`, `Thông tin shop `, `Tiktok` vỏ rỗng) ' +
    'giữ nguyên văn từng ô', async () => {
    const NGOAI = ['THU CHI', 'Lazada', 'Lịch Làm Việc', 'bảng giá sophie', 'Doanh thu thuế', 'Thông tin shop ', 'Tiktok'];
    const X = await kichBan({});
    dung(X.kq.ok === true, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq));
    const co = NGOAI.filter((t) => X.ssMoi.getSheetByName(t));
    bang(oKhac(chup(X.ssCu, co), chup(X.ssMoi, co)).slice(0, 3), [], 'sheet ngoài khuôn không đổi ô nào');
    xong(X);
    return co.length + ' sheet ngoài khuôn y nguyên · ' + await doiChungAm(async () => {
      const Z = await kichBan({ suaNguon: sua("    var ttB3b = tx.thaoTac.concat(tcb.thaoTac);", "    var ttB3b = tx.thaoTac.concat(tcb.thaoTac, [{ loai: 'GHI_O', sheet: 'Lazada', r: 5, c: 3, gt: 'x' }]);") });
      const ra = oKhac(chup(Z.ssCu, co), chup(Z.ssMoi, co));
      xong(Z);
      return ra;
    }, 'tool lỡ ghi một ô vào sheet ngoài khuôn');
  });

  await test('KC-04', 'khuôn 2.9.0: `Tổng nhập` khối đầu kỳ mang khuôn C/E/F/G/I (không còn chép giá vốn gõ tay `=7286400/240` của dòng nhập hàng tháng cũ), ' +
    'K-1/K-2 ĐẠT', async () => {
    const giaVonTay = (s) => { const tn = s.getSheetByName('Tổng nhập'); datCT(tn, 4, C('G'), '7286400/240'); datCT(tn, 4, C('I'), '5*5'); };
    const X = await kichBan({ vo: (m, c) => { giaVonTay(m); giaVonTay(c); } });
    dung(X.kq.ok === true, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq));
    const tn = X.ssMoi.getSheetByName('Tổng nhập');
    bang([A1(tn, 4, C('G')), A1(tn, 4, C('I'))], ["IFERROR(INDEX('Tổng tồn kho'!$C$3:$G$2003,MATCH($D4,'Tổng tồn kho'!$D$3:$D$2003,0),5),\"\")", 'IFERROR(H4*G4,"")'], 'G4, I4');
    xong(X);
    return 'G4/I4 đúng khuôn · ' + await doiChungAm(async () => {
      const Z = await kichBan({ vo: (m, c) => { giaVonTay(m); giaVonTay(c); }, suaNguon: BO_KHUON() });
      const ra = kiemLech(Z.kq).filter((p) => p.ma === 'K-13').map((p) => 'không ghi khuôn: K-13 ' + p.chiTiet);
      xong(Z);
      return ra;
    }, 'không ghi khuôn');
  });

  // ------------------------------------------------------------------ 2.9.1 — sự cố chạy thử thật T11 → T12 (3/11)
  // Google thật: `setFormulasR1C1` nhận '' để lại CHỮ `#ERROR!` (không công thức) ở `Đơn ngoài`!I và L 2.000 dòng → L3 = SUM(L4:L2003) ra
  // #ERROR!, nút 3 dừng CONG_THUC_HONG ở B3 › Đơn ngoài. Giả lập 2.9.0 coi '' là xóa sạch nên 15/15 xanh.
  const GHI_RONG_NHU_290 = () => sua('      if (trong) vungGhi.clearContent();', "      if (trong) vungGhi.setFormulasR1C1(Array.apply(null, Array(j - i + 1)).map(function () { return Array.apply(null, Array(d2 - d1 + 1)).map(function () { return ''; }); }));");
  const IL = (sh) => { const ra = []; for (let r = 4; r <= 2003; r++) [C('I'), C('L')].forEach((c) => { const k = r + ':' + c; if (sh.congThuc[k] || (sh.giaTri[k] != null && sh.giaTri[k] !== '')) ra.push(k); }); return ra; };

  await test('YC63-11', '2.9.1 — giả lập đúng Google đo 3/11: `setFormulasR1C1` nhận \'\' để lại chữ `#ERROR!`, không công thức; `clearContent` xóa sạch', async () => {
    const sim = gl.taoGiaLap({});
    const sh = sim.khaiThang('2026-09', 'THÁNG-9-2026-KINH-DOANH').insertSheet('X');
    sh.getRange(1, 1, 1, 2).setFormulasR1C1([['=1+1', '']]);
    bang([sh.congThuc['1:1'], sh.congThuc['1:2'] || null, sh.giaTri['1:2']], ['=1+1', null, '#ERROR!'], "ghi '' qua setFormulasR1C1");
    sh.getRange(1, 1, 1, 2).clearContent();
    bang([sh.congThuc['1:1'] || null, sh.giaTri['1:2'] == null], [null, true], 'clearContent');
    sim.thaoGo();
    return "'' → #ERROR! (như Google), clearContent → trống";
  });

  await test('YC63-12', '2.9.1 — cột trống-khuôn `Đơn ngoài`!I, L xóa bằng clearContent: I4:L2003 không công thức, không chữ #ERROR!; L3 = 0; 13/13', async () => {
    const X = await kichBan({});
    dung(X.kq.ok === true && X.kq.kiem.length === 13, 'phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq) + ' ' + String(X.kq.thongBao || '').slice(0, 200));
    const dn = X.ssMoi.getSheetByName('Đơn ngoài');
    bang(IL(dn).slice(0, 3), [], 'I/L 4..2003 phải trống');
    xong(X);
    return 'I, L trống 2.000 dòng · ' + await doiChungAm(async () => {
      const Z = await kichBan({ suaNguon: GHI_RONG_NHU_290() });
      const ra = Z.kq.ok ? [] : [Z.kq.loi + ' ' + String(Z.kq.thongBao).slice(0, 140)];
      xong(Z);
      return ra;
    }, "ghi '' như 2.9.0 (Google để #ERROR!)");
  });

  await test('YC63-13', '2.9.1 — BẤM LẠI đúng như chủ dự án sẽ làm: lượt 1 mã 2.9.0 chết CONG_THUC_HONG ở B3 › Đơn ngoài (I, L 2.000 ô chữ #ERROR!, cờ ' +
    'B3:TikTok Shop) → lượt 2 mã 2.9.1 chạy TIẾP trên đúng sổ đó: khuôn dọn sạch chữ #ERROR! (không coi là gõ tay), 13/13', async () => {
    const Y = await kichBan({ suaNguon: GHI_RONG_NHU_290() });
    dung(!Y.kq.ok && Y.kq.loi === 'CONG_THUC_HONG', 'lượt 1 (mã 2.9.0) phải chết CONG_THUC_HONG: ' + Y.kq.loi);
    const coB3 = coTM(Y.ssMoi, 5);
    const dangDo = { moi: Y.ssMoi, cu: Y.ssCu };
    const chep = (nguon, dich) => nguon.getSheets().forEach((sh) => {
      const n = dich.getSheetByName(sh.ten) || dich.themSheet(sh.ten);
      ['giaTri', 'congThuc', 'dinhDang', 'nen', 'dam'].forEach((k) => { n[k] = Object.assign({}, sh[k]); });
      n.gopO = sh.gopO.map((g) => Object.assign({}, g)); n.soDongToiDa = sh.soDongToiDa;
    });
    const tiepTuc = (m, c) => { chep(dangDo.moi, m); chep(dangDo.cu, c); };
    const X = await kichBan({ vo: tiepTuc });
    xong(Y);
    dung(X.kq.ok === true && X.kq.kiem.length === 13, 'lượt 2 phải 13/13: ' + X.kq.loi + ' ' + moTaKiem(X.kq) + ' ' + String(X.kq.thongBao || '').slice(0, 200));
    bang(IL(X.ssMoi.getSheetByName('Đơn ngoài')).slice(0, 3), [], 'I/L 4..2003 phải trống');
    xong(X);
    return 'lượt 1 cờ ' + coB3 + ' → lượt 2 13/13, chữ #ERROR! dọn sạch · ' + await doiChungAm(async () => {
      // lượt 2 mà khuôn coi chữ #ERROR! là gõ tay (như 2.9.0) → để yên; phải bị bắt (soát sau ghi / K-9 / K-13), không được 13/13
      const Z = await kichBan({ vo: tiepTuc, suaNguon: sua(' && !laChuLoiTM_(v); };', '; };') });
      const ra = Z.kq.ok ? kiemLech(Z.kq).map((p) => p.ma + ' ' + p.chiTiet) : [Z.kq.loi + ' ' + String(Z.kq.thongBao).slice(0, 160)];
      xong(Z);
      return ra;
    }, 'lượt 2 coi chữ #ERROR! là dữ liệu gõ tay');
  });

  console.log('\n=== ' + soDat + ' ĐẠT · ' + soHong + ' HỎNG · tổng ' + (soDat + soHong) + ' ===');
  if (soHong) { hong.forEach((h) => console.log('  ' + h)); process.exit(1); }
})().catch((e) => { console.log('LỖI: ' + (e && e.stack)); process.exit(1); });
