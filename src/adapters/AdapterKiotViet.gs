/**
 * AdapterKiotViet.gs — LỚP 1, Giai đoạn 4. CHƯA TRIỂN KHAI.
 * Chỉ khai báo giao diện để chứng minh lớp 2 và 3 không cần sửa khi thêm nguồn.
 *
 * Yêu cầu khi triển khai: trả về đúng lược đồ OrderLine như AdapterFileXuat,
 * với maSpSan / maPhanLoaiSan là mã do sàn cấp nếu KiotViet giữ được (rủi ro R-K1),
 * và phamViTien = 'DONG' nếu nguồn cho phí theo từng dòng.
 */
var AdapterKiotViet = (function () {
  function doc(duLieuTho, nguon, cfg) {
    throw new Error('AdapterKiotViet chưa triển khai (Giai đoạn 4 — chờ kết quả ba phép thử mục 9.3 tài liệu context)');
  }
  return { doc: doc, NGUON_DU_LIEU: 'KIOTVIET' };
})();
