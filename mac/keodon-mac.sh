#!/bin/sh
# ============================================================================
# keodon-mac.sh — RUỘT CHUNG của bốn nút bấm bản macOS (Đợt 5).
#
# VÌ SAO CÓ FILE NÀY. Bản Windows là bốn file `.bat` (xem `bat/`), mỗi file tự
# tìm cấu hình, tìm mã, tìm Node rồi gọi đúng một script Node và dịch mã thoát
# ra câu tiếng Việt. Bản Mac làm y hệt, nhưng viết một lần ở đây rồi bốn file
# `.command` chỉ gọi vào — để hai bản không trôi xa nhau.
#
# NGUYÊN TẮC GIỮ NGUYÊN TỪ BẢN WINDOWS:
#   · MÃ THOÁT PHẢI GIỐNG HỆT: nút 4 (0 xong · 1 lỗi · 2 không có file mới),
#     nút 3 (0 · 1 chưa làm gì · 3 Google từ chối · 4 không gọi xong Web App ·
#     5 Google tạo xong mà máy chưa ghi link · 6 chưa phải thất bại).
#     Người vận hành đọc CÙNG một câu ở cả hai bản.
#   · KHÔNG BAO GIỜ tự sửa `CAU_HINH_VAN_HANH.json` của máy.
#   · Lỗi thì in CÂU CHỈ VIỆC PHẢI LÀM, không in dấu vết kỹ thuật.
#
# POSIX sh, không dùng bash-ism: chạy được cả `sh` của macOS lẫn Git Bash trên
# Windows — nhờ đó bộ test `node/test-mac.js` chạy được ngay trên máy dev.
# ============================================================================

TEN_CAU_HINH="CAU_HINH_VAN_HANH.json"

# --- in ---------------------------------------------------------------------
vach() { echo "------------------------------------------------------------"; }
tieu_de() {
  echo "============================================================"
  echo "  $1"
  echo "============================================================"
  echo ""
}

# Dừng màn hình cho người bấm đọc (bấm đúp trong Finder là cửa sổ tự đóng).
# `--tu-dong` (hoặc KEODON_TU_DONG=1) thì không dừng — bộ test và lịch chạy dùng.
doi_phim() {
  [ -n "$KEODON_TU_DONG" ] && return 0
  printf "Bấm Enter để đóng cửa sổ này . . . "
  read _x 2>/dev/null || true
  echo ""
}

# --- tìm chỗ ----------------------------------------------------------------
# Thư mục cấu hình: ngay cạnh nút, hoặc trong một thư mục con (bản giao đặt ở
# "Cấu hình"). Trả về đường dẫn, rỗng nếu không thấy.
tim_thu_muc_cau_hinh() {
  goc="$1"
  if [ -f "$goc/$TEN_CAU_HINH" ]; then echo "$goc"; return 0; fi
  for d in "$goc"/*/; do
    [ -f "$d$TEN_CAU_HINH" ] && { echo "${d%/}"; return 0; }
  done
  echo ""
}

# Bộ mã của tool: thư mục con `keodon-apps-script` cạnh nút (máy user), hoặc
# `../02_CODE/keodon-apps-script` (máy chủ dự án chạy thẳng trong kho).
tim_thu_muc_ma() {
  goc="$1"
  for d in "$goc"/*/; do
    [ -f "$d/keodon-apps-script/node/chay-thu.js" ] && { echo "${d%/}/keodon-apps-script"; return 0; }
  done
  [ -f "$goc/../02_CODE/keodon-apps-script/node/chay-thu.js" ] && { echo "$goc/../02_CODE/keodon-apps-script"; return 0; }
  echo ""
}

# Tìm Node. Gói Mac KÈM SẴN bản xách tay (`node-portable-mac-<kiến trúc>`) như bản Windows, nên
# người dùng không phải cài gì. Không có bản xách tay (máy Intel) thì dò Node của máy — Finder chạy
# .command với PATH tối thiểu nên phải dò thêm /usr/local/bin và /opt/homebrew/bin.
tim_node() {
  # 1. Node XÁCH TAY kèm trong gói (như bản Windows) — ưu tiên số một: cùng một bản trên mọi máy,
  #    user không phải cài gì. Thư mục theo kiến trúc máy: arm64 (Apple Silicon) hay x64 (Intel).
  kt=$(uname -m 2>/dev/null)
  [ "$kt" = "x86_64" ] && kt="x64"
  for d in "$1" "$1/Cấu hình" "$(dirname "$1")"; do
    n="$d/node-portable-mac-$kt/bin/node"
    if [ -x "$n" ]; then echo "$n"; return 0; fi
  done
  # 2. Node của máy (user tự cài, hoặc máy Intel không có bản xách tay kèm theo).
  if command -v node >/dev/null 2>&1; then command -v node; return 0; fi
  for n in /usr/local/bin/node /opt/homebrew/bin/node /usr/bin/node; do
    [ -x "$n" ] && { echo "$n"; return 0; }
  done
  echo ""
}

# Gỡ cờ "tải từ Internet" (com.apple.quarantine) cho CẢ thư mục gói, ngay lần chạy đầu.
# Không gỡ thì macOS chặn từng file một: `node` xách tay không chạy, ba nút còn lại cũng bị hỏi lại.
# Chạy được đến dòng này nghĩa là người dùng đã cho phép nút ĐẦU TIÊN (chuột phải → Mở) — gỡ nốt phần còn lại.
go_kiem_dich() {
  [ "$(uname -s 2>/dev/null)" = "Darwin" ] || return 0
  command -v xattr >/dev/null 2>&1 || return 0
  xattr -dr com.apple.quarantine "$1" >/dev/null 2>&1 || true
}

cau_thieu_node() {
  echo "LỖI: máy chưa có Node.js nên tool không chạy được."
  echo ""
  echo "  (Gói này có kèm sẵn Node cho máy Apple Silicon. Máy Intel đời cũ thì phải cài một lần.)"
  echo ""
  echo "  Cách sửa (làm một lần, khoảng 3 phút):"
  echo "    1. Mở https://nodejs.org → tải bản \"LTS\" cho macOS (file .pkg)."
  echo "    2. Bấm đúp file .pkg vừa tải, bấm Tiếp tục tới hết."
  echo "    3. Đóng cửa sổ này rồi bấm đúp lại  1_CAI_DAT_LAN_DAU.command"
  echo ""
}

cau_thieu_cau_hinh() {
  echo "LỖI: không tìm thấy file $TEN_CAU_HINH."
  echo ""
  echo "  File đó phải nằm trong thư mục  Cấu hình  , ngay cạnh bốn nút này."
  echo "  Cách sửa: bấm đúp  1_CAI_DAT_LAN_DAU.command  một lần. Nó tự tạo file"
  echo "            cấu hình từ bản mẫu rồi chỉ rõ phải điền những gì."
  echo ""
}

cau_chua_cai() {
  echo "MÁY CHƯA CÀI ĐẶT. Bấm đúp  1_CAI_DAT_LAN_DAU.command  trước."
  echo ""
  echo "  Gói giao cho máy user không kèm sẵn mã nguồn: mã về máy khi bấm"
  echo "  nút cài đặt, và nút đó kéo từ kho mã trên GitHub xuống."
  echo ""
}

# --- chuẩn bị chung cho nút 3 và nút 4 --------------------------------------
# Đặt CFGDIR, TOOL, NODE. Thiếu thứ nào thì in câu chỉ việc rồi thoát 1.
chuan_bi() {
  goc="$1"
  go_kiem_dich "$goc"
  CFGDIR=$(tim_thu_muc_cau_hinh "$goc")
  if [ -z "$CFGDIR" ]; then cau_thieu_cau_hinh; doi_phim; exit 1; fi
  TOOL=$(tim_thu_muc_ma "$goc")
  if [ -z "$TOOL" ]; then cau_chua_cai; doi_phim; exit 1; fi
  NODE=$(tim_node "$CFGDIR")
  if [ -z "$NODE" ]; then cau_thieu_node; doi_phim; exit 1; fi
  if [ ! -d "$TOOL/node_modules/exceljs" ]; then
    echo "LỖI: thiếu thư viện của tool nên chưa đọc được file .xlsx."
    echo ""
    echo "  Cách sửa: bấm đúp  1_CAI_DAT_LAN_DAU.command  một lần rồi chạy lại file này."
    echo ""
    doi_phim; exit 1
  fi
}

# --- nút 4: chạy tool hằng ngày ---------------------------------------------
nut_4() {
  goc="$1"
  tieu_de "KÉO ĐƠN SHOPEE VÀ TIKTOK LÊN GOOGLE SHEET"
  chuan_bi "$goc"
  "$NODE" "$TOOL/node/chay-thu.js" --van-hanh "$goc"
  ma=$?
  echo ""
  if [ "$ma" = "0" ]; then
    vach
    echo "  XONG. Mở Google Sheet của tháng để kiểm tra."
    echo "  File xuất vừa đọc đã tự chuyển vào thư mục con  đã xử lý"
    echo "  của đúng gian hàng đó. Không phải dọn tay."
    vach
  elif [ "$ma" = "2" ]; then
    vach
    echo "  KHÔNG CÓ GÌ ĐỂ LÀM — đọc phần  KHÔNG CÓ FILE MỚI  ở trên."
    echo "  Đây không phải lỗi: tool chưa ghi gì cả."
    vach
  else
    vach
    echo "  CHẠY KHÔNG XONG. Đọc dòng bắt đầu bằng  LỖI:  ở trên,"
    echo "  trong đó luôn có câu chỉ việc phải làm."
    echo "  File xuất vẫn nằm nguyên trong thư mục thả — bấm lại được."
    echo ""
    echo "  Nếu dòng lỗi có chữ  EPERM  hay  operation not permitted : macOS đang chặn tool đọc thư mục."
    echo "  Mở  Cài đặt hệ thống -> Quyền riêng tư & Bảo mật -> Tệp và Thư mục , bật cho  Terminal ,"
    echo "  rồi bấm lại nút này."
    vach
  fi
  echo ""
  doi_phim
  exit $ma
}

# --- nút 3: tạo sổ tháng mới ------------------------------------------------
nut_3() {
  goc="$1"; shift
  tieu_de "TẠO SỔ THÁNG MỚI"
  chuan_bi "$goc"
  "$NODE" "$TOOL/node/nut-3-thang-moi.js" --van-hanh "$goc" "$@"
  ma=$?
  echo ""
  vach
  case "$ma" in
    0) echo "  XONG. Đọc dòng  ĐÃ GHI link tháng  ở trên: từ ngày đó nút 4"
       echo "  ghi đơn vào file tháng mới." ;;
    1) echo "  CHƯA LÀM GÌ. $TEN_CAU_HINH không đổi."
       echo "  Đọc các dòng ở trên để biết vì sao, rồi bấm lại file này." ;;
    3) echo "  KHÔNG TẠO ĐƯỢC THÁNG MỚI — Google từ chối hoặc tự kiểm lệch."
       echo "  link tháng KHÔNG đổi. Đọc câu  KHÔNG TẠO ĐƯỢC  ở trên, trong đó"
       echo "  có việc phải làm." ;;
    4) echo "  KHÔNG GỌI XONG WEB APP — mạng, quyền truy cập, hoặc lệch bản."
       echo "  link tháng KHÔNG đổi. Làm theo câu báo lỗi ở trên rồi bấm lại." ;;
    5) echo "  GOOGLE ĐÃ TẠO XONG THÁNG MỚI NHƯNG MÁY CHƯA GHI ĐƯỢC LINK."
       echo "  Bấm lại file này, chọn CHẾ ĐỘ 2 với đúng link tháng mới."
       echo "  ĐỪNG chọn lại chế độ 1." ;;
    6) echo "  CHƯA PHẢI THẤT BẠI — Google có thể vẫn đang chạy."
       echo "  ĐỪNG bấm lại ngay: đợi 5 phút rồi bấm lại file này, chọn chế độ 1."
       echo "  link tháng KHÔNG đổi." ;;
    *) echo "  LỖI KHÔNG ĐOÁN TRƯỚC — mã $ma. Chụp màn hình gửi người phụ trách." ;;
  esac
  vach
  echo ""
  doi_phim
  exit $ma
}

# --- nút 1 và nút 2: gọi bộ cài bootstrap ------------------------------------
# `cai-dat-mac.js` đi kèm trong gói (không phải mã của tool) — xem chú thích
# đầu file đó. Chạy được ngay cả khi máy CHƯA có mã của tool.
nut_cai_dat() {
  goc="$1"; viec="$2"; shift 2
  [ "$viec" = "cai-dat" ] && tieu_de "CÀI ĐẶT LẦN ĐẦU" || tieu_de "CẬP NHẬT TOOL"
  go_kiem_dich "$goc"
  NODE=$(tim_node "$(tim_thu_muc_cau_hinh "$goc")")
  if [ -z "$NODE" ]; then cau_thieu_node; doi_phim; exit 1; fi
  # `cai-dat-mac.js` nằm cạnh file này (bản giao: trong thư mục "Cấu hình"; kho mã: trong `mac/`).
  BO_CAI=$(dirname "$RUOT")/cai-dat-mac.js
  if [ ! -f "$BO_CAI" ]; then
    echo "LỖI: thiếu bộ cài cai-dat-mac.js của tool."
    echo ""
    echo "  Giải nén lại gói Tool_nhap_lieu_mac.zip vào một thư mục mới rồi bấm lại nút này."
    echo ""
    doi_phim; exit 1
  fi
  "$NODE" "$BO_CAI" --viec "$viec" --goc "$goc" "$@"
  ma=$?
  echo ""
  doi_phim
  exit $ma
}
