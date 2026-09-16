#!/bin/sh
# 3_TAO_FILE_THANG_MOI.command — nút bấm bản macOS. Ruột nằm ở keodon-mac.sh (một chỗ cho cả bốn nút).
# Bấm đúp trong Finder là chạy. Lần đầu macOS hỏi quyền: Cài đặt hệ thống →
# Quyền riêng tư & Bảo mật → "Vẫn mở".
GOC=$(cd "$(dirname "$0")" && pwd)
. "$GOC/keodon-mac.sh"
nut_3 "$GOC" "$@"
