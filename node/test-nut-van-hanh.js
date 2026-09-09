/**
 * BỐN NÚT CỦA NGƯỜI VẬN HÀNH — kiểm hình dạng file, không kiểm nghiệp vụ.
 *
 * VÌ SAO CÓ BÀI NÀY. Hai lần chạy thật của chủ shop đã hỏng câm vì đúng ba tật dưới đây,
 * và không bài test nào bắt được:
 *   · `CHAY_TOOL.bat` từng RỖNG — bấm vào không ra gì, không báo lỗi.
 *   · `CAI_DAT_1_LAN.bat` có dòng `echo ... (khong can quyen quan tri)` nằm trong khối
 *     `if (...)`. cmd.exe đọc dấu `)` đó là dấu ĐÓNG KHỐI nên nuốt mất phần sau và bung
 *     ra thông báo `: was unexpected at this time.`
 *   · file lưu bằng UTF-8 hoặc LF thì cmd.exe đọc sai chữ và sai dòng.
 *
 * Ba tật đều là hình dạng file, đo được bằng máy, nên không có lý do gì để chúng lọt lần nữa.
 */
const fs = require('fs');
const path = require('path');

const THU_MUC = path.resolve(__dirname, '..', '..', '..', '03_VAN_HANH');
const NUT_BAT_BUOC = ['1_CAI_DAT_LAN_DAU.bat', '2_CAP_NHAT.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat'];
const CO_MO_KHOI = /^(if|for)\b.*\($/i;
const CO_ELSE = /\)\s*else\s*\($/i;
const LA_ECHO = /^echo(\s|\.|$)/i;

/** Soi một file .bat, trả về danh sách chỗ sai (rỗng là đạt). */
function soiMotNut(duong) {
  const b = fs.readFileSync(duong);
  const loi = [];

  if (b.length === 0) { loi.push('FILE RỖNG — bấm vào không ra gì'); return loi; }

  for (let i = 0; i < b.length; i++) {
    if (b[i] > 0x7f) { loi.push('không phải ASCII thuần: byte 0x' + b[i].toString(16) + ' ở vị trí ' + i); break; }
  }

  const s = b.toString('latin1');
  const soLF = (s.match(/\n/g) || []).length;
  const soCRLF = (s.match(/\r\n/g) || []).length;
  if (soLF !== soCRLF) loi.push('có ' + (soLF - soCRLF) + ' dòng xuống dòng kiểu LF trần — cmd.exe cần CRLF');

  let sau = 0;
  s.split('\n').forEach((d, k) => {
    const c = d.replace(/\r$/, '').trim();
    if (sau > 0 && LA_ECHO.test(c)) {
      for (let j = 0; j < c.length; j++) {
        if ('()<>'.indexOf(c[j]) >= 0 && (j === 0 || c[j - 1] !== '^')) {
          loi.push('dòng ' + (k + 1) + ': ký tự `' + c[j] + '` chưa thoát bằng ^ trong khối if(...) — ' + c.slice(0, 60));
        }
      }
    }
    if (CO_MO_KHOI.test(c) || CO_ELSE.test(c)) sau++;
    else if (c === ')' && sau > 0) sau--;
  });

  return loi;
}

const BAI = [];
function test(ten, fn) { BAI.push({ ten, fn }); }

test('N-22 đủ bốn nút, đánh số 1→4 đúng thứ tự người vận hành làm', () => {
  const co = fs.readdirSync(THU_MUC).filter((t) => t.toLowerCase().endsWith('.bat')).sort();
  const thieu = NUT_BAT_BUOC.filter((t) => co.indexOf(t) < 0);
  if (thieu.length) throw new Error('thiếu nút: ' + thieu.join(', ') + ' (đang có: ' + co.join(', ') + ')');
  const thua = co.filter((t) => NUT_BAT_BUOC.indexOf(t) < 0);
  if (thua.length) throw new Error('có nút lạ ngoài bốn nút: ' + thua.join(', '));
  return co.length + ' nút: ' + co.join(' · ');
});

NUT_BAT_BUOC.forEach((ten, i) => {
  test('N-2' + (3 + i) + ' ' + ten + ': không rỗng · ASCII thuần · CRLF thuần · echo trong if(...) đã thoát', () => {
    const d = path.join(THU_MUC, ten);
    if (!fs.existsSync(d)) throw new Error('không có file ' + ten);
    const loi = soiMotNut(d);
    if (loi.length) throw new Error(loi.join(' | '));
    return Math.round(fs.statSync(d).size / 1024) + ' KB, sạch';
  });
});

test('N-27 không nút nào còn gọi tên cũ của nút khác', () => {
  const CU = [/(?<![0-9_])CHAY_TOOL\.bat/, /3_CHAY_TOOL\.bat/, /2_TAO_FILE_THANG_MOI\.bat/,
    /(?<![0-9_])TAO_FILE_THANG_MOI\.bat/, /(?<![0-9_])CAP_NHAT\.bat/, /CAI_DAT_1_LAN\.bat/];
  const xau = [];
  NUT_BAT_BUOC.forEach((ten) => {
    const s = fs.readFileSync(path.join(THU_MUC, ten), 'latin1');
    CU.forEach((rx) => { const m = s.match(rx); if (m) xau.push(ten + ' còn nhắc "' + m[0] + '"'); });
  });
  if (xau.length) throw new Error(xau.join(' | '));
  return 'bốn nút chỉ gọi nhau bằng tên hiện hành';
});

let dat = 0, hong = 0;
console.log('=== BỐN NÚT CỦA NGƯỜI VẬN HÀNH (hình dạng file .bat) ===\n');
BAI.forEach((b) => {
  try { const t = b.fn(); dat++; console.log('ĐẠT   ' + b.ten + (t ? '\n        · ' + t : '')); }
  catch (e) { hong++; console.log('HỎNG  ' + b.ten + '\n   -> ' + e.message); }
});
console.log('\n=== ' + dat + ' ĐẠT · ' + hong + ' HỎNG · tổng ' + BAI.length + ' ===');
process.exit(hong ? 1 : 0);
