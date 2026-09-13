/**
 * dong-run.js — DÒNG TỔNG KẾT RUN của mỗi lượt nút 4 (YC-38.3).
 *
 * Mỗi lượt bấm in ra màn hình và ghi vào LOG đúng MỘT dòng chuẩn:
 *   RUN <yyyyMMdd_HHmmss_máy> | bản dựng <mã> | file <tên> | gian <X> | đơn vào N | ghi N | bỏ qua N | vàng N | lỗi N | Mapping: N dòng CÓ, băm <8 ký tự>
 *
 * Vì sao: 2–3 máy cùng ghi một file tháng, nhật ký nằm rải trên từng máy. Khi cần trả lời "đơn này vào
 * sổ lúc nào, máy nào, với bảng Mapping nào", một dòng cố định khuôn là thứ duy nhất grep được qua mọi
 * máy. Cùng RUN id được gửi kèm POST nên dòng tương ứng trong nhật ký Apps Script (Executions) nối được
 * về đúng máy và đúng lượt bấm. Không thêm sheet nhật ký vào file tháng (Q-12 chưa duyệt).
 *
 * Luật in:
 *   · lượt hỏng giữa chừng vẫn có dòng RUN; số nào KHÔNG CHẮC thì in `?`, không in 0 — Google có thể đã
 *     ghi xong rồi mới rớt phản hồi (T-WA-05), in "ghi 0" là nói sai
 *   · không mang link/ID file tháng, không mang chuỗi bí mật (INV-7): chỉ tên file xuất + tên sheet gian
 *   · nhiều file trong một lượt → nối bằng ` + ` (một lượt vẫn là MỘT dòng)
 */
'use strict';

const os = require('os');

const LECH_GIO_VN_MS = 7 * 3600 * 1000;       // Việt Nam không đổi giờ mùa hè — cùng luật `phanNgayVN`

function haiSo(n) { return ('0' + n).slice(-2); }

/** Tên máy an toàn cho RUN id: chỉ A-Z a-z 0-9 và `-`, tối đa 40 ký tự (Web App kiểm đúng mẫu này). */
function tenMay(ten) {
  const s = String(ten == null ? os.hostname() : ten).replace(/[^A-Za-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return s || 'MAY';
}

/** `yyyyMMdd_HHmmss_<máy>` theo GIỜ VIỆT NAM, bất kể múi giờ đặt trên máy. */
function taoRunId(thoiDiem, may) {
  const d = new Date((thoiDiem ? new Date(thoiDiem) : new Date()).getTime() + LECH_GIO_VN_MS);
  return d.getUTCFullYear() + haiSo(d.getUTCMonth() + 1) + haiSo(d.getUTCDate()) + '_' +
    haiSo(d.getUTCHours()) + haiSo(d.getUTCMinutes()) + haiSo(d.getUTCSeconds()) + '_' + tenMay(may);
}

function so(x) { return (typeof x === 'number' && isFinite(x)) ? String(x) : '?'; }
function ds(x) {
  const a = [];
  (x || []).forEach((t) => { if (t && a.indexOf(t) < 0) a.push(String(t)); });
  return a.length ? a.join(' + ') : '?';
}

/**
 * @param {Object} o { runId, banDung, file:[tên], gian:[sheet], donVao, ghi, boQua, vang, loi, mappingCo, mappingBam }
 */
function dongRun(o) {
  const x = o || {};
  const map = (typeof x.mappingCo === 'number' && /^[0-9a-f]{8}$/.test(String(x.mappingBam || '')))
    ? x.mappingCo + ' dòng CÓ, băm ' + x.mappingBam
    : '? dòng CÓ, băm ?';
  return 'RUN ' + (x.runId || '?') +
    ' | bản dựng ' + (x.banDung || '?') +
    ' | file ' + ds(x.file) +
    ' | gian ' + ds(x.gian) +
    ' | đơn vào ' + so(x.donVao) +
    ' | ghi ' + so(x.ghi) +
    ' | bỏ qua ' + so(x.boQua) +
    ' | vàng ' + so(x.vang) +
    ' | lỗi ' + so(x.loi) +
    ' | Mapping: ' + map;
}

/**
 * Dòng RUN của một lượt ĐÃ XONG: `run` là phần máy biết trước khi gọi Google (id, file, gian, đơn vào, số file
 * lỗi), `kq` là kết quả `chayLenGoogleSheet`. Một hàm dùng chung cho `chay-thu.js` và bộ test — test chấm
 * đúng thứ nút 4 in ra, không chấm một bản chép tay.
 */
function dongRunTuKetQua(run, kq) {
  const tk = (kq && kq.thongKe) || {};
  return dongRun(Object.assign({}, run, {
    banDung: kq && kq.banDung, ghi: tk.donGhi, boQua: tk.donDaCo, vang: tk.dongVang,
    mappingCo: kq && kq.mappingCo, mappingBam: kq && kq.mappingBam
  }));
}

/** Mẫu khớp một dòng RUN đầy đủ số (dùng cho test và cho người grep LOG). */
const RE_DONG_RUN = /^RUN \d{8}_\d{6}_[A-Za-z0-9-]{1,40} \| bản dựng [0-9a-f]+ \| file .+ \| gian .+ \| đơn vào \d+ \| ghi \d+ \| bỏ qua \d+ \| vàng \d+ \| lỗi \d+ \| Mapping: \d+ dòng CÓ, băm [0-9a-f]{8}$/;

module.exports = { taoRunId, dongRun, dongRunTuKetQua, tenMay, RE_DONG_RUN };
