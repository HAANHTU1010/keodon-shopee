/**
 * nap-loi.js — nạp các file .gs trong src/ vào Node y như Apps Script ghép chúng vào một phạm vi toàn cục.
 * Lõi không dùng require/import nên chỉ cần nối chuỗi rồi chạy trong một hàm; mọi `var`/`function`
 * cấp cao nhất được trả về dưới dạng đối tượng.
 *
 * Thứ tự nạp = thứ tự phụ thuộc: tiện ích → lược đồ → cấu hình → lớp 1 → lớp 2 → lớp 3 → luồng chính → test.
 */
const fs = require('fs');
const path = require('path');

const THU_TU = [
  'Utils.gs', 'Schema.gs', 'CaiDat.gs', 'Config.gs',
  'adapters/AdapterFileXuat.gs',
  'DanhMuc.gs', 'MapListing.gs', 'Normalize.gs',
  'KeyIn.gs', 'Main.gs',
  'tests/KhoGiaLap.gs', 'tests/NguonGiaLap.gs', 'tests/TestData.gs', 'tests/TestSuite.gs'
];

const SRC = path.join(__dirname, '..', 'src');

function napLoi() {
  const src = THU_TU.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('\n;\n');
  const ten = new Set();
  for (const m of src.matchAll(/^(?:var|function)\s+([A-Za-z_$][\w$]*)/gm)) ten.add(m[1]);
  const body = src + '\nreturn {' + [...ten].map(n => `${n}: ${n}`).join(', ') + '};';
  return new Function(body)();   // eslint-disable-line no-new-func
}

module.exports = { napLoi, THU_TU, SRC };
