/**
 * tinh-lai-gia-lap.js — "GOOGLE TÍNH LẠI CÔNG THỨC" CHO GOOGLE SHEET GIẢ.
 *
 * Google Sheet giả (`node/gia-lap-web-app.js`) cất công thức nhưng KHÔNG tính. Hành động `taoThangMoi` đọc lại
 * file sau khi ghi để chạy tám phép tự kiểm (K-2 tổng tiền đầu kỳ, K-6 dòng tổng ra số, K-7 doanh số tháng mới
 * bằng 0…) — không có bước tính lại thì mọi ô tool vừa dựng đọc ra rỗng và K-6 lệch ở chỗ không đáng.
 *
 * Dùng lại ĐÚNG bộ tính của vỏ Excel (`tinhLai` trong `node/tao-thang-moi.js`) — chuỗi gian hàng → Tổng xuất →
 * Tổng tồn kho ← Tổng nhập → Lợi nhuận, và cột D `Lợi nhuận` tính theo công thức đang nằm trong file. Chỉ dùng
 * trong test (gắn vào `sim.khiFlush`). Trên Google thật, Google tự tính.
 */
'use strict';

const { tinhLai, apGhiDe, napLoiTaoThangMoi } = require('./tao-thang-moi');
const { r1c1SangA1 } = require('./nap-xlsx-gia-lap');

let _lop = null;
function lop() { if (!_lop) _lop = napLoiTaoThangMoi(); return _lop; }

/** BangTinhGia → ảnh chụp theo hợp đồng `TaoThangMoi.gs` (giá trị gõ tay / công thức A1 / giá trị đã tính). */
function anhTuBangTinh(ss) {
  const anh = { ten: ss.getName(), tenSheet: [], sheets: {} };
  ss.getSheets().forEach((sh) => {
    anh.tenSheet.push(sh.ten);
    const nr = sh.getLastRow(), nc = sh.getLastColumn();
    const giaTri = [], congThuc = [], mang = [], giaTriTinh = [];
    for (let r = 0; r < nr; r++) { giaTri.push([]); congThuc.push([]); mang.push([]); giaTriTinh.push([]); }
    // Chỉ `Lợi nhuận` cần NGUYÊN VĂN công thức (bộ tính đọc cột D). Sheet khác chỉ cần biết "ô này là công thức" —
    // đổi R1C1 → A1 cho ~40.000 ô ở mỗi lần flush là thứ làm bài chậm gấp mười.
    const canVanBan = sh.ten === 'Lợi nhuận';
    Object.keys(sh.congThuc).forEach((k) => {
      if (!sh.congThuc[k]) return;
      const [r, c] = k.split(':').map(Number);
      congThuc[r - 1][c - 1] = canVanBan ? r1c1SangA1(sh.congThuc[k], r, c).slice(1) : '(công thức)';
    });
    Object.keys(sh.giaTri).forEach((k) => {
      const [r, c] = k.split(':').map(Number);
      const v = sh.giaTri[k];
      if (v === '' || v == null) return;
      giaTriTinh[r - 1][c - 1] = v;
      if (congThuc[r - 1][c - 1] == null) giaTri[r - 1][c - 1] = v;
    });
    anh.sheets[sh.ten] = { ten: sh.ten, soDong: nr, giaTri, congThuc, mang, giaTriTinh, gopO: sh.gopO.slice() };
  });
  return anh;
}

/** Tính lại và GHI kết quả vào ô công thức của file giả (giá trị hiển thị mà `getValues` sẽ trả). */
function tinhLaiBangTinh(ss) {
  const anh = anhTuBangTinh(ss);
  const tl = tinhLai(anh, lop());
  Object.keys(tl.ghiDe).forEach((ten) => {
    const sh = ss.getSheetByName(ten);
    if (!sh) return;
    Object.keys(tl.ghiDe[ten]).forEach((k) => {
      const [r, c] = k.split(',').map(Number);
      sh.giaTri[r + ':' + c] = tl.ghiDe[ten][k];
    });
  });
  return tl.so;
}

module.exports = { anhTuBangTinh, tinhLaiBangTinh, apGhiDe };
