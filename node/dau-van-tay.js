/**
 * DẤU VÂN TAY BẢN DỰNG — biết chắc bản Apps Script trên Google là bản nào.
 *
 *   node node/dau-van-tay.js            → in dấu vân tay hiện tại, so với dấu đã đóng trong mã
 *   node node/dau-van-tay.js --ghi      → đóng lại dấu vào 11 file .gs (chạy sau mỗi lần sửa .gs)
 *   node node/dau-van-tay.js --kiem     → chỉ kiểm, lệch thì thoát mã 1
 *
 * VÌ SAO CẦN. Tám file `.gs` do người dán tay lên Google, còn `PHIEN_BAN` chỉ đổi khi lên phiên
 * bản mới. Nghĩa là **mọi bản dựng trong cùng một số phiên bản trông giống hệt nhau**: dán thiếu
 * một file, hay dán nhầm bản cũ, thì tool vẫn chạy êm và sai lặng lẽ. Đúng một lần như vậy đã xảy
 * ra: nhật ký không có câu cảnh báo nào về công thức, nhưng cột E/F/N trên Google lại trống trơn —
 * và không ai phân biệt được là "mã chạy đúng, công thức trả chuỗi rỗng" hay "bản trên Google cũ
 * hơn bản trên máy".
 *
 * VÌ SAO DẤU VÂN TAY PHẢI THEO TỪNG FILE, KHÔNG PHẢI MỘT SỐ CHUNG.
 * Một số chung chỉ nằm được ở MỘT file. Dán đúng file đó bản mới nhưng sót `Normalize.gs` bản cũ
 * thì số chung vẫn khớp — mà `Normalize.gs` mới là chỗ tính tiền. Nên mỗi file mang dấu riêng,
 * `ping` trả về cả cụm, và máy so từng cái một. Ca "sót đúng một file" là ca dễ xảy ra nhất khi
 * dán tay mười một file, nên nó phải là ca bắt được chắc nhất.
 *
 * Dấu do MÁY sinh, không phải người gõ. Người gõ thì sẽ có ngày quên đổi — mà quên đổi nghĩa là
 * dấu vân tay nói dối, tệ hơn không có.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SRC = path.join(__dirname, '..', 'src');

/** file .gs → tên hằng mang dấu vân tay của nó. Thêm file .gs mới thì thêm một dòng ở đây. */
const TEN_HANG = {
  'CaiDat.gs': 'VAN_TAY_CAIDAT',
  'Config.gs': 'VAN_TAY_CONFIG',
  'DanhMuc.gs': 'VAN_TAY_DANHMUC',
  'KeyIn.gs': 'VAN_TAY_KEYIN',
  'Main.gs': 'VAN_TAY_MAIN',
  'MapListing.gs': 'VAN_TAY_MAPLISTING',
  'Normalize.gs': 'VAN_TAY_NORMALIZE',
  'Schema.gs': 'VAN_TAY_SCHEMA',
  'ShellAppsScript.gs': 'VAN_TAY_SHELL',
  'TaoThangMoi.gs': 'VAN_TAY_TAOTHANGMOI',
  'Utils.gs': 'VAN_TAY_UTILS'
};

/** Hằng tổng, nằm trong ShellAppsScript.gs — băm của cả cụm dấu từng file. */
const HANG_TONG = 'BAN_DUNG';
const FILE_TONG = 'ShellAppsScript.gs';

const RX_DAU = (ten) => new RegExp('^var ' + ten + " = '[0-9a-f]*';.*$", 'm');
const DONG_DAU = (ten, v, ghiChu) => "var " + ten + " = '" + v + "';   // " + ghiChu;
const GHI_CHU = 'dấu vân tay file này — MÁY sinh bằng `npm run dau-van-tay`, đừng sửa tay';
const GHI_CHU_TONG = 'dấu vân tay CẢ BẢN DỰNG — MÁY sinh, đừng sửa tay';

/**
 * Đọc file và bỏ đi phần KHÔNG được tính vào băm: chính dòng dấu vân tay của nó (nếu tính cả
 * thì băm tự tham chiếu, không bao giờ hội tụ), và hằng tổng.
 * Chuẩn hóa CRLF → LF: cùng một nội dung mà khác xuống dòng phải ra cùng một băm, nếu không thì
 * máy Windows và máy Linux đọc ra hai dấu khác nhau và cảnh báo kêu oan suốt ngày.
 */
function noiDungDeBam(ten, chu) {
  let s = chu.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  s = s.replace(RX_DAU(TEN_HANG[ten]), '');
  if (ten === FILE_TONG) s = s.replace(RX_DAU(HANG_TONG), '');
  // Cắt sạch khoảng trắng cuối file. Lần đóng dấu ĐẦU TIÊN nối thêm dòng vào cuối file, nên nếu
  // không cắt thì nội dung đem băm đổi ngay sau khi vừa đóng dấu — băm không bao giờ hội tụ và
  // phép kiểm kêu lệch vĩnh viễn. Đã đo: không có dòng này thì 12/12 chỗ báo lệch ngay sau `--ghi`.
  return s.replace(/\s*$/, '');
}

function bam(s, doDai) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, doDai || 8); }

/** Tính dấu vân tay ĐÚNG cho hiện trạng src/, không đọc dấu đang đóng trong mã. */
function tinh() {
  const tungFile = {};
  for (const ten of Object.keys(TEN_HANG).sort()) {
    const d = path.join(SRC, ten);
    if (!fs.existsSync(d)) throw new Error('thiếu file ' + ten + ' trong ' + SRC);
    tungFile[ten] = bam(noiDungDeBam(ten, fs.readFileSync(d, 'utf8')), 8);
  }
  const tong = bam(Object.keys(tungFile).sort().map((t) => t + ':' + tungFile[t]).join('|'), 12);
  return { tungFile, tong };
}

/** Đọc dấu ĐANG ĐÓNG trong mã (có thể cũ hơn hiện trạng — đó chính là thứ cần phát hiện). */
function docDauDangDong() {
  const tungFile = {};
  for (const ten of Object.keys(TEN_HANG).sort()) {
    const d = path.join(SRC, ten);
    if (!fs.existsSync(d)) { tungFile[ten] = null; continue; }
    const m = fs.readFileSync(d, 'utf8').match(RX_DAU(TEN_HANG[ten]));
    tungFile[ten] = m ? (m[0].match(/'([0-9a-f]*)'/) || [])[1] : null;
  }
  const mt = fs.readFileSync(path.join(SRC, FILE_TONG), 'utf8').match(RX_DAU(HANG_TONG));
  return { tungFile, tong: mt ? (mt[0].match(/'([0-9a-f]*)'/) || [])[1] : null };
}

/** So dấu đang đóng với dấu đúng. Trả danh sách chỗ lệch; rỗng nghĩa là dấu còn tươi. */
function kiem() {
  const dung = tinh();
  const dong = docDauDangDong();
  const lech = [];
  for (const ten of Object.keys(TEN_HANG).sort()) {
    if (dong.tungFile[ten] == null) lech.push(ten + ': CHƯA có dấu vân tay');
    else if (dong.tungFile[ten] !== dung.tungFile[ten]) {
      lech.push(ten + ': dấu đã cũ (đóng ' + dong.tungFile[ten] + ', đúng phải là ' + dung.tungFile[ten] + ')');
    }
  }
  if (dong.tong == null) lech.push(HANG_TONG + ': CHƯA có');
  else if (dong.tong !== dung.tong) lech.push(HANG_TONG + ': cũ (đóng ' + dong.tong + ', đúng ' + dung.tong + ')');
  return { lech, dung, dong };
}

/**
 * Đóng dấu vào 11 file. Làm HAI LƯỢT vì dấu tổng là băm của cụm dấu từng file: lượt một đóng dấu
 * từng file, lượt hai mới tính được tổng đúng. Dấu từng file không đổi ở lượt hai vì chính dòng
 * dấu bị loại khỏi phần đem băm.
 */
function ghi() {
  const doi = [];
  const v1 = tinh();
  for (const ten of Object.keys(TEN_HANG).sort()) {
    const d = path.join(SRC, ten);
    let s = fs.readFileSync(d, 'utf8');
    const dongMoi = DONG_DAU(TEN_HANG[ten], v1.tungFile[ten], GHI_CHU);
    const cu = s.match(RX_DAU(TEN_HANG[ten]));
    if (cu) {
      if (cu[0] === dongMoi) continue;
      s = s.replace(RX_DAU(TEN_HANG[ten]), dongMoi);
    } else {
      // Chỉ nối ĐÚNG một dòng — thêm dòng chú thích riêng thì chính dòng đó cũng bị đem băm.
      const xd = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
      s = s.replace(/\s*$/, '') + xd + xd + dongMoi + xd;
    }
    fs.writeFileSync(d, s, 'utf8');
    doi.push(ten);
  }
  // Lượt hai: tổng.
  const v2 = tinh();
  const dTong = path.join(SRC, FILE_TONG);
  let s = fs.readFileSync(dTong, 'utf8');
  const dongTong = DONG_DAU(HANG_TONG, v2.tong, GHI_CHU_TONG);
  if (RX_DAU(HANG_TONG).test(s)) {
    if (!s.includes(dongTong)) { s = s.replace(RX_DAU(HANG_TONG), dongTong); fs.writeFileSync(dTong, s, 'utf8'); doi.push(HANG_TONG); }
  } else {
    const xd = s.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
    s = s.replace(/\s*$/, '') + xd + xd + dongTong + xd;
    fs.writeFileSync(dTong, s, 'utf8');
    doi.push(HANG_TONG);
  }
  return { doi, van: tinh() };
}

// ==================================================================== CHẠY

function main() {
  const tv = process.argv.slice(2);
  if (tv.indexOf('--ghi') >= 0) {
    const kq = ghi();
    console.log(kq.doi.length ? ('Đã đóng dấu lại: ' + kq.doi.join(', ')) : 'Không có gì phải đóng lại.');
    console.log('BAN_DUNG = ' + kq.van.tong);
    const l = kiem().lech;
    if (l.length) { console.log('VẪN LỆCH:'); l.forEach((x) => console.log('  · ' + x)); process.exit(1); }
    process.exit(0);
  }

  const kq = kiem();
  console.log('Dấu vân tay đúng cho hiện trạng src/ :  ' + kq.dung.tong);
  console.log('Dấu đang đóng trong mã              :  ' + (kq.dong.tong || '(chưa có)'));
  if (kq.lech.length) {
    console.log('\nLỆCH ' + kq.lech.length + ' chỗ — mã .gs đã sửa mà chưa đóng dấu lại:');
    kq.lech.forEach((x) => console.log('  · ' + x));
    console.log('\nChạy  npm run dau-van-tay -- --ghi  rồi dán lại các file đó lên Apps Script.');
    process.exit(1);
  }
  console.log('\nDấu còn tươi. Từng file:');
  for (const t of Object.keys(kq.dung.tungFile)) console.log('  ' + t.padEnd(22) + kq.dung.tungFile[t]);
  process.exit(0);
}

module.exports = { tinh, kiem, ghi, docDauDangDong, TEN_HANG, HANG_TONG, FILE_TONG };

if (require.main === module) main();
