/**
 * NguonGiaLap.gs — nguồn file trong bộ nhớ, cùng giao diện với NguonDrive.
 * files: [{ san, maGianHang, tenFile, bang }] — bang là mảng 2 chiều, hoặc hàm ném lỗi để giả lập file hỏng.
 */
function NguonGiaLap(files) {
  this.files = (files || []).map(function (f) {
    return {
      san: f.san, maGianHang: f.maGianHang, tenFile: f.tenFile,
      docBang: function () { return typeof f.bang === 'function' ? f.bang() : f.bang; }
    };
  });
  this.daXuLy = [];
  this.loi = [];
}
NguonGiaLap.prototype.layFileMoi = function () {
  var ds = this.files;
  this.files = [];
  return ds;
};
NguonGiaLap.prototype.danhDauDaXuLy = function (f) { this.daXuLy.push(f.tenFile); };
NguonGiaLap.prototype.danhDauLoi = function (f) { this.loi.push(f.tenFile); };
