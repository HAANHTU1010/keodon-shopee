#!/bin/sh
# 1_CAI_DAT_LAN_DAU.command — nút bấm bản macOS. Ruột nằm ở keodon-mac.sh (một chỗ cho cả bốn nút),
# trong bản giao thì nó nằm trong thư mục "Cấu hình" để lớp ngoài cùng chỉ có 4 nút + 2 thư mục,
# đúng như bản Windows. Bấm đúp trong Finder là chạy; lần đầu macOS hỏi thì chuột phải → Mở.
GOC=$(cd "$(dirname "$0")" && pwd)
RUOT=""
[ -f "$GOC/keodon-mac.sh" ] && RUOT="$GOC/keodon-mac.sh"
if [ -z "$RUOT" ]; then
  for d in "$GOC"/*/; do
    [ -f "$d/keodon-mac.sh" ] && { RUOT="$d/keodon-mac.sh"; break; }
  done
fi
if [ -z "$RUOT" ]; then
  echo "LỖI: thiếu file keodon-mac.sh của tool."
  echo ""
  echo "  Gói bị thiếu file. Giải nén lại gói Tool_nhap_lieu_mac.zip vào một thư mục mới,"
  echo "  đừng chép lẻ từng nút ra chỗ khác."
  echo ""
  exit 1
fi
. "$RUOT"
nut_cai_dat "$GOC" "cai-dat" "$@"
