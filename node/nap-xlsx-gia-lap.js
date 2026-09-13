/**
 * nap-xlsx-gia-lap.js — NẠP MỘT FILE THÁNG .xlsx THẬT VÀO GOOGLE SHEET GIẢ (`node/gia-lap-web-app.js`).
 *
 * Vì sao cần: các bài bất biến (INV-11, YC-38.2) và bài tạo tháng mới trên Web App (YC-35) phải chạy trên
 * KHUÔN THẬT — 18 sheet, ô gộp thật, công thức từng dòng thật tới dòng 500, file vừa đổi khuôn từ tháng 9
 * (`TikTok Shop`, `Chi Phí Hàng Ngày`). Fixture tự dựng chỉ có đúng thứ người viết test nghĩ tới, nên
 * không bao giờ bắt được thứ người viết test không nghĩ tới.
 *
 * Nạp những gì Apps Script nhìn thấy:
 *   · giá trị: ô thường lấy giá trị; ô công thức lấy KẾT QUẢ đã lưu (file Google xuất ra hay thiếu — khi đó
 *     để trống, đúng như `getDisplayValues()` của ô công thức trả `""`)
 *   · công thức: đổi A1 → R1C1 (Web App đọc/chép `getFormulasR1C1`)
 *   · ô gộp, định dạng số, số dòng lưới (`getMaxRows`)
 *   · ô con của cụm gộp KHÔNG mang giá trị (ExcelJS trả giá trị ô chủ cho mọi ô con; Google trả `""`)
 * Không nạp: màu, viền, độ rộng cột — không bài nào đo những thứ đó qua giả lập.
 */
'use strict';

const ExcelJS = require('exceljs');

function chiSoCot(chu) {
  let n = 0;
  const s = String(chu).toUpperCase();
  for (let i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64);
  return n;
}

/**
 * Công thức A1 (không dấu `=`) tại ô (r, c) → R1C1 kiểu Google (`R[1]C[-2]`, `R3C4`). Bỏ qua chuỗi trong
 * nháy kép và tên sheet trong nháy đơn; không đụng tên hàm có số (`LOG10(`) hay tên định danh.
 */
const RE_A1 = /(\$?)([A-Z]{1,3})(\$?)(\d+)/y;
const RE_R1C1 = /R(\[-?\d+\]|\d+)?C(\[-?\d+\]|\d+)?/y;

function a1SangR1C1(text, r, c) {
  const n = text.length;
  let out = '', i = 0;
  while (i < n) {
    const ch = text.charAt(i);
    if (ch === '"') { let j = text.indexOf('"', i + 1); if (j < 0) j = n - 1; out += text.slice(i, j + 1); i = j + 1; continue; }
    if (ch === "'") { let j = text.indexOf("'", i + 1); if (j < 0) j = n - 1; out += text.slice(i, j + 1); i = j + 1; continue; }
    let m = null;
    if (ch === '$' || (ch >= 'A' && ch <= 'Z')) { RE_A1.lastIndex = i; m = RE_A1.exec(text); }
    const truoc = out.charAt(out.length - 1);
    if (m && !/[A-Za-z0-9_.]/.test(truoc)) {
      const sau = text.charAt(i + m[0].length);
      if (!/[A-Za-z0-9_(]/.test(sau)) {
        const cot = chiSoCot(m[2]), dong = +m[4];
        const rr = m[3] ? 'R' + dong : (dong === r ? 'R' : 'R[' + (dong - r) + ']');
        const cc = m[1] ? 'C' + cot : (cot === c ? 'C' : 'C[' + (cot - c) + ']');
        out += rr + cc;
        i += m[0].length;
        continue;
      }
    }
    out += ch; i++;
  }
  return '=' + out;
}

function chuCot(n) { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

/**
 * R1C1 kiểu Google (có hoặc không dấu `=`) tại ô (r, c) → A1 (có `=`). Chiều ngược của `a1SangR1C1`, đủ cho mọi
 * công thức file tháng đang dùng: `R[1]C[-2]`, `RC4`, `R3C`, vùng `R3C3:R489C7`, tên sheet trong nháy.
 */
function r1c1SangA1(text, r, c) {
  const src = String(text || '').replace(/^=/, '');
  const n = src.length;
  let out = '', i = 0;
  while (i < n) {
    const ch = src.charAt(i);
    if (ch === '"') { let j = src.indexOf('"', i + 1); if (j < 0) j = n - 1; out += src.slice(i, j + 1); i = j + 1; continue; }
    if (ch === "'") { let j = src.indexOf("'", i + 1); if (j < 0) j = n - 1; out += src.slice(i, j + 1); i = j + 1; continue; }
    let m = null;
    if (ch === 'R') { RE_R1C1.lastIndex = i; m = RE_R1C1.exec(src); }
    const truoc = out.charAt(out.length - 1);
    if (m && !/[A-Za-z0-9_.]/.test(truoc) && !/[A-Za-z0-9_(]/.test(src.charAt(i + m[0].length))) {
      const dong = m[1] == null ? { so: r, tuyetDoi: false } : (m[1][0] === '[' ? { so: r + Number(m[1].slice(1, -1)), tuyetDoi: false } : { so: Number(m[1]), tuyetDoi: true });
      const cot = m[2] == null ? { so: c, tuyetDoi: false } : (m[2][0] === '[' ? { so: c + Number(m[2].slice(1, -1)), tuyetDoi: false } : { so: Number(m[2]), tuyetDoi: true });
      out += (cot.tuyetDoi ? '$' : '') + chuCot(cot.so) + (dong.tuyetDoi ? '$' : '') + dong.so;
      i += m[0].length;
      continue;
    }
    out += ch; i++;
  }
  return '=' + out;
}

function giaTriO(v) {
  if (v == null) return '';
  if (v instanceof Date) return new Date(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate(), v.getUTCHours(), v.getUTCMinutes(), v.getUTCSeconds());
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.error != null) return String(v.error);
    if (v.text != null) return String(v.text);
    return '';
  }
  return v;
}

/**
 * @param {BangTinhGia} ss  file tháng giả (thường là `sim.khaiThang(...)`)
 * @param {string} duongDan .xlsx
 * @param {Object} [tc] { chiSheet: [tên…] — chỉ nạp các sheet này }
 * @returns {Promise<{soSheet, soCongThuc, soOGop}>}
 */
async function napXlsxVaoGiaLap(ss, duongDan, tc) {
  const o = tc || {};
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(duongDan);
  const dem = { soSheet: 0, soCongThuc: 0, soOGop: 0 };
  wb.eachSheet((ws) => {
    if (o.chiSheet && o.chiSheet.indexOf(ws.name) < 0) return;
    const sh = ss.themSheet(ws.name);
    dem.soSheet++;
    sh.soDongToiDa = Math.max(ws.rowCount, 1000);
    for (const s of (ws.model.merges || [])) {
      const m = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(s);
      if (!m) continue;
      sh.gopO.push({ r1: +m[2], c1: chiSoCot(m[1]), r2: +m[4], c2: chiSoCot(m[3]) });
      dem.soOGop++;
    }
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (cell.isMerged && cell.master && cell.master.address !== cell.address) return;
        const v = cell.value;
        const k = r + ':' + c;
        if (v && typeof v === 'object' && (v.formula != null || v.sharedFormula != null)) {
          const text = cell.formula;
          if (text) { sh.congThuc[k] = a1SangR1C1(String(text), r, c); dem.soCongThuc++; }
          const kq = giaTriO(v.result);
          if (kq !== '') sh.giaTri[k] = kq;
        } else {
          const gt = giaTriO(v);
          if (gt !== '') sh.giaTri[k] = gt;
        }
        if (cell.numFmt && cell.numFmt !== 'General') sh.dinhDang[k] = cell.numFmt;
      });
    });
  });
  return dem;
}

module.exports = { napXlsxVaoGiaLap, a1SangR1C1, r1c1SangA1 };
