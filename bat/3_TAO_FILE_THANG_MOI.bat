@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Tao so thang moi

rem ============================================================
rem  3_TAO_FILE_THANG_MOI.bat - dau thang bam mot lan (YC-34, D-45).
rem
rem  Hoi dung bay truong, moi truong mot dong:
rem      [1/7] Thang truoc     [2/7] Nam truoc     [3/7] Link file thang truoc
rem      [4/7] Thang moi       [5/7] Nam moi       [6/7] Link file thang moi
rem      [7/7] Che do
rem            1 = tao/chuyen so sang thang moi tren Google, du 8 phep tu kiem moi ghi link
rem            2 = chi khai bao link thang moi, khong dong vao du lieu
rem  Sai truong nao thi bao dong do va hoi lai tu dau, toi da ba luot.
rem
rem  File .bat nay CHI tim cau hinh, bo ma va Node.js. Viec hoi, kiem tung
rem  truong, goi Web App va ghi link nam trong node\nut-3-thang-moi.js:
rem  cau tieng Viet co dau khong viet duoc trong file .bat.
rem
rem  CA FILE PHAI LA ASCII THUAN VA XUONG DONG CRLF - README.md muc 6.4.
rem  KHONG bat enabledelayedexpansion: file nay khong can, ma bat len thi dau cham
rem  than trong duong dan cai dat hay trong cau tra loi bi cmd nuot mat.
rem
rem  Tham so an, chi dung khi chay thu:
rem      /tra-loi "..."   cac cau tra loi noi nhau bang dau gach dung, dung thu
rem                       tu nguoi go - ke ca cau tra loi cho  Dung chua  cuoi cung
rem      /tu-dong         khong dung lai cho bam phim
rem ============================================================

set "TM_BASE=%~dp0"
set "TM_TRA_LOI="
set "TM_TU_DONG="

:doc_tham_so
if "%~1"=="" goto het_tham_so
if /i "%~1"=="/tra-loi" goto ts_tra_loi
if /i "%~1"=="/tu-dong" goto ts_tu_dong
shift
goto doc_tham_so
:ts_tra_loi
set "TM_TRA_LOI=%~2"
shift
shift
goto doc_tham_so
:ts_tu_dong
set "TM_TU_DONG=1"
shift
goto doc_tham_so
:het_tham_so

echo ============================================================
echo   TAO SO THANG MOI
echo ============================================================
echo.

rem ---- 1. Tim thu muc cau hinh -------------------------------------------
rem  Dung %TM_BASE% chu KHONG dung %~dp0: lenh shift o vong doc tham so ben tren
rem  da lam %0 khong con tro toi file .bat nay nua.
set "CFGDIR="
if exist "%TM_BASE%CAU_HINH_VAN_HANH.json" set "CFGDIR=%TM_BASE%."
if not defined CFGDIR for /d %%D in ("%TM_BASE%*") do if exist "%%~fD\CAU_HINH_VAN_HANH.json" set "CFGDIR=%%~fD"
if not defined CFGDIR (
  echo LOI: Khong tim thay file CAU_HINH_VAN_HANH.json.
  echo.
  echo   Cach sua: bam dup  1_CAI_DAT_LAN_DAU.bat  mot lan roi chay lai file nay.
  echo   Chua co gi bi thay doi.
  echo.
  if not defined TM_TU_DONG pause
  exit /b 1
)

rem ---- 2. Tim bo ma cua tool ---------------------------------------------
set "TOOL_GOC="
for /d %%D in ("%TM_BASE%*") do if exist "%%~fD\keodon-apps-script\node\chay-thu.js" set "TOOL_GOC=%%~fD\keodon-apps-script"
if not defined TOOL_GOC if exist "%TM_BASE%..\02_CODE\keodon-apps-script\node\chay-thu.js" set "TOOL_GOC=%TM_BASE%..\02_CODE\keodon-apps-script"
if not defined TOOL_GOC (
  echo MAY CHUA CAI DAT. Bam dup  1_CAI_DAT_LAN_DAU.bat  truoc.
  echo.
  echo   Goi giao cho may user khong kem san ma nguon: ma ve may khi bam
  echo   nut cai dat. Chay xong nut cai dat mot lan roi quay lai bam file nay.
  echo   Chua co gi bi thay doi.
  echo.
  if not defined TM_TU_DONG pause
  exit /b 1
)
rem  May co bo ma nhung la ban CU, chua co nut 3 moi: phai cap nhat truoc.
set "TOOL="
if exist "%TOOL_GOC%\node\nut-3-thang-moi.js" set "TOOL=%TOOL_GOC%"
if not defined TOOL (
  echo MA CUA TOOL TREN MAY NAY LA BAN CU, CHUA CO NUT 3 MOI.
  echo.
  echo   Cach sua: bam dup  2_CAP_NHAT.bat  mot lan, doi no bao cap nhat xong,
  echo   roi bam lai file nay. Chua co gi bi thay doi.
  echo.
  if not defined TM_TU_DONG pause
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
  echo   Chua co gi bi thay doi.
  echo.
  if not defined TM_TU_DONG pause
  exit /b 1
)

rem ---- 4. Chay -----------------------------------------------------------
rem  Cau tra loi an di qua bien moi truong TM_TRA_LOI, khong qua dong lenh:
rem  link Google hay co dau va, ma dau va tren dong lenh la cmd cat lenh.
"%NODE%" "%TOOL%\node\nut-3-thang-moi.js" --van-hanh "%TM_BASE%."
set "MA=%ERRORLEVEL%"

echo.
if "%MA%"=="0" (
  echo ------------------------------------------------------------
  echo   XONG. Doc dong  DA GHI link thang  o tren: tu ngay do nut 4
  echo   ghi don vao file thang moi.
  echo ------------------------------------------------------------
) else if "%MA%"=="1" (
  echo ------------------------------------------------------------
  echo   CHUA LAM GI. CAU_HINH_VAN_HANH.json khong doi.
  echo   Doc cac dong o tren de biet vi sao, roi bam lai file nay.
  echo ------------------------------------------------------------
) else if "%MA%"=="3" (
  echo ------------------------------------------------------------
  echo   KHONG TAO DUOC THANG MOI - Google tu choi hoac tu kiem lech.
  echo   link thang KHONG doi. Doc cau  KHONG TAO DUOC  o tren, trong do
  echo   co viec phai lam.
  echo ------------------------------------------------------------
) else if "%MA%"=="4" (
  echo ------------------------------------------------------------
  echo   KHONG GOI XONG WEB APP - mang, quyen truy cap, hoac lech ban.
  echo   link thang KHONG doi. Lam theo cau bao loi o tren roi bam lai.
  echo ------------------------------------------------------------
) else if "%MA%"=="5" (
  echo ------------------------------------------------------------
  echo   GOOGLE DA TAO XONG THANG MOI NHUNG MAY CHUA GHI DUOC LINK.
  echo   Bam lai file nay, chon CHE DO 2 voi dung link thang moi.
  echo   DUNG chon lai che do 1.
  echo ------------------------------------------------------------
) else (
  echo ------------------------------------------------------------
  echo   LOI KHONG DOAN TRUOC - ma %MA%. Chup man hinh gui nguoi phu trach.
  echo ------------------------------------------------------------
)
echo.
if not defined TM_TU_DONG pause
exit /b %MA%
