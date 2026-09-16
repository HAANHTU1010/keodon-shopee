#!/bin/sh
# 1_CAI_DAT_LAN_DAU.command — nút bấm bản macOS. Ruột nằm ở keodon-mac.sh (một chỗ cho cả bốn nút).
# Bấm đúp trong Finder là chạy. Lần đầu macOS hỏi quyền: chuột phải → Mở → "Mở".
GOC=$(cd "$(dirname "$0")" && pwd)
. "$GOC/keodon-mac.sh"
nut_cai_dat "$GOC" "cai-dat" "$@"
