@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Keo don Shopee len Google Sheet

rem ============================================================
rem  4_CHAY_TOOL.bat - nut bam hang ngay.
rem  Doc file xuat Shopee trong 1_THA_FILE_XUAT\<ten gian hang>\
rem  roi ghi thang len Google Sheet cua THANG THEO NGAY CHAY.
rem  Khong hoi gi. Chay xong, file xuat tu chuyen vao thu muc con
rem  "da xu ly" cua chinh gian hang do.
rem
rem  CA FILE PHAI LA ASCII THUAN VA XUONG DONG CRLF - xem
rem  NOTES_DEV.md muc 4.1. Vi vay moi cau tieng Viet o day deu
rem  viet khong dau, va ten thu muc co dau thi PHAI DO chu khong
rem  go thang duoc.
rem ============================================================

set "TU_DONG="
if /i "%~1"=="/tu-dong" set "TU_DONG=1"

echo ============================================================
echo   KEO DON SHOPEE LEN GOOGLE SHEET
echo ============================================================
echo.

rem ---- 1. Tim thu muc cau hinh -------------------------------------------
set "CFGDIR="
if exist "%~dp0CAU_HINH_VAN_HANH.json" set "CFGDIR=%~dp0."
if not defined CFGDIR for /d %%D in ("%~dp0*") do if exist "%%~fD\CAU_HINH_VAN_HANH.json" set "CFGDIR=%%~fD"
if not defined CFGDIR (
  echo LOI: Khong tim thay file CAU_HINH_VAN_HANH.json.
  echo.
  echo   File do phai nam trong thu muc  Cau hinh  , ngay canh bon file .bat nay.
  echo   Cach sua: bam dup  1_CAI_DAT_LAN_DAU.bat  mot lan. No tu tao file
  echo             cau hinh tu ban mau roi chi ro phai dien nhung gi.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)

rem ---- 2. Tim bo ma cua tool ---------------------------------------------
set "TOOL="
for /d %%D in ("%~dp0*") do if exist "%%~fD\keodon-apps-script\node\chay-thu.js" set "TOOL=%%~fD\keodon-apps-script"
if not defined TOOL if exist "%~dp0..\02_CODE\keodon-apps-script\node\chay-thu.js" set "TOOL=%~dp0..\02_CODE\keodon-apps-script"
if not defined TOOL (
  echo MAY CHUA CAI DAT. Bam dup  1_CAI_DAT_LAN_DAU.bat  truoc.
  echo.
  echo   Goi giao cho may nhan vien khong kem san ma nguon: ma ve may khi bam
  echo   nut cai dat, va nut do keo tu kho ma tren GitHub xuong.
  echo   Chay xong nut cai dat mot lan roi quay lai bam file nay.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)

rem ---- 3. Tim Node.js ----------------------------------------------------
set "NODE="
if exist "%CFGDIR%\node-portable\node.exe" set "NODE=%CFGDIR%\node-portable\node.exe"
if not defined NODE ( where node >nul 2>&1 && set "NODE=node" )
if not defined NODE (
  echo LOI: May chua co Node.js nen tool khong chay duoc.
  echo.
  echo   Cach sua: bam dup  1_CAI_DAT_LAN_DAU.bat  va lam theo huong dan trong do.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)

if not exist "%TOOL%\node_modules\exceljs" (
  echo LOI: Thieu thu vien cua tool nen chua doc duoc file .xlsx.
  echo.
  echo   Cach sua: bam dup  1_CAI_DAT_LAN_DAU.bat  mot lan roi chay lai file nay.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)

rem ---- 4. Chay -----------------------------------------------------------
"%NODE%" "%TOOL%\node\chay-thu.js" --van-hanh "%~dp0."
set "MA=%ERRORLEVEL%"

echo.
if "%MA%"=="0" (
  echo ------------------------------------------------------------
  echo   XONG. Mo Google Sheet cua thang de kiem tra.
  echo   File xuat vua doc da tu chuyen vao thu muc con  da xu ly
  echo   cua dung gian hang do. Khong phai don tay.
  echo ------------------------------------------------------------
) else if "%MA%"=="2" (
  echo ------------------------------------------------------------
  echo   KHONG CO GI DE LAM - doc phan  KHONG CO FILE MOI  o tren.
  echo   Day khong phai loi: tool chua ghi gi ca.
  echo ------------------------------------------------------------
) else (
  echo ------------------------------------------------------------
  echo   CHAY KHONG XONG. Doc dong bat dau bang  LOI:  o tren,
  echo   trong do luon co cau chi viec phai lam.
  echo   File xuat van nam nguyen trong thu muc tha - bam lai duoc.
  echo ------------------------------------------------------------
)
echo.
if not defined TU_DONG pause
exit /b %MA%
