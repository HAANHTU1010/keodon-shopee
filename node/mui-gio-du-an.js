/**
 * mui-gio-du-an.js — GHIM múi giờ của TIẾN TRÌNH TEST theo múi giờ của dự án Apps Script (YC-41 việc 2).
 *
 * VÌ SAO CẦN. Trên Google, JavaScript của Web App chạy theo `timeZone` khai trong `src/appsscript.json`
 * (`Asia/Ho_Chi_Minh`): mọi `getHours()` / `getDate()` trong mã `.gs` là giờ Việt Nam, dù máy chủ Google đặt ở đâu.
 * Giả lập Web App chạy CHÍNH mã `.gs` đó trong Node — và Node lấy giờ theo MÁY ĐANG CHẠY TEST. Máy đặt múi giờ khác thì
 * lõi ghi nhãn giờ khác bản chạy thật (cờ `DA_KHOI_TAO_2026-10-01 09:00` thành `… 02:00` ở UTC, `2026-09-30 19:00` ở
 * Los Angeles), và bài test hỏng OAN: mã đúng, giả lập lệch (BA gặp đúng ca này với TM-W-01).
 *
 * CÁCH DÙNG. Gọi `ghimMuiGioDuAn()` ở dòng đầu bộ test nào chấm giờ/ngày do mã `.gs` tự sinh, TRƯỚC khi chạy bài nào.
 * Múi giờ đọc thẳng từ `src/appsscript.json`, không gõ cứng: đổi múi giờ dự án là bộ test đi theo.
 *
 * KHÔNG dùng cho bộ canh PHÍA MÁY. Máy user có thể đặt sai múi giờ thật, và phía máy tự ép giờ Việt Nam
 * (`phanNgayVN`) — ghim múi giờ ở đó là giấu đúng lỗi phải bắt. Phía máy được canh bằng tiến trình con chạy UTC (T-DT-44).
 */
'use strict';

const fs = require('fs');
const path = require('path');

const TEP_MANIFEST = path.join(__dirname, '..', 'src', 'appsscript.json');

/** Múi giờ dự án khai trong `src/appsscript.json`. Không có → ném: bộ test không được đoán. */
function muiGioDuAn() {
  const tz = String((JSON.parse(fs.readFileSync(TEP_MANIFEST, 'utf8')) || {}).timeZone || '').trim();
  if (!tz) throw new Error('src/appsscript.json không khai timeZone — không biết Web App chạy giờ nào');
  return tz;
}

/**
 * Đặt `process.env.TZ` = múi giờ dự án rồi KIỂM NGAY bằng `Intl` (bộ dữ liệu múi giờ độc lập với `Date`): giờ địa phương
 * của một thời điểm mẫu phải trùng giờ `Intl` tính cho múi giờ đó. Không trùng (Node không áp được biến TZ) → ném, để bộ
 * test HỎNG ỒN ÀO ngay đầu chứ không chạy tiếp với giờ máy rồi hỏng oan ở bài giữa chừng.
 * @returns {string} múi giờ đã ghim
 */
function ghimMuiGioDuAn() {
  const tz = muiGioDuAn();
  process.env.TZ = tz;
  const mau = [Date.UTC(2026, 9, 1, 2, 0, 0), Date.UTC(2026, 0, 15, 20, 30, 0)];
  for (const t of mau) {
    const d = new Date(t);
    const phan = {};
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach((p) => { phan[p.type] = p.value; });
    const theoIntl = phan.year + '-' + phan.month + '-' + phan.day + ' ' + phan.hour + ':' + phan.minute;
    const hai = (n) => ('0' + n).slice(-2);
    const theoDate = d.getFullYear() + '-' + hai(d.getMonth() + 1) + '-' + hai(d.getDate()) + ' ' + hai(d.getHours()) + ':' + hai(d.getMinutes());
    if (theoIntl !== theoDate) {
      throw new Error('KHÔNG GHIM ĐƯỢC múi giờ ' + tz + ' cho tiến trình test: Date ra ' + theoDate + ', Intl ra ' + theoIntl +
        '. Bộ test dừng thay vì chạy mã .gs theo giờ máy.');
    }
  }
  return tz;
}

module.exports = { muiGioDuAn, ghimMuiGioDuAn, TEP_MANIFEST };
