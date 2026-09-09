@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Cai dat lan dau

rem ============================================================
rem  1_CAI_DAT_LAN_DAU.bat - chi chay dung MOT LAN tren may moi.
rem
rem  Goi giao nhan vien KHONG chua ma nguon. Ma ve may qua DUNG MOT DUONG
rem  la  2_CAP_NHAT.bat  keo tu GitHub. Nho vay khong bao gio co canh may
rem  nay ban cu may kia ban moi ma khong ai biet.
rem
rem  Sau viec, dung ngay o buoc nao hong:
rem    1. Tim Node.js
rem    2. Kiem khai bao kho ma GitHub trong cau hinh  - trong thi DUNG
rem    3. Goi  2_CAP_NHAT.bat  de keo ma ve lan dau
rem    4. Kiem link Web App va chuoi bi mat           - trong thi NHAC, khong chan
rem    5. Goi thu  ping  len Web App
rem    6. Ket luan mot dong
rem
rem  CA FILE PHAI LA ASCII THUAN VA XUONG DONG CRLF - NOTES_DEV muc 4.1.
rem  Ten thu muc  Cau hinh  va  da xu ly  co dau tieng Viet nen phai DO
rem  chu khong go thang duoc.
rem ============================================================

set "GOC=%~dp0"
set "TU_DONG="
if /i "%~1"=="/tu-dong" set "TU_DONG=1"

echo ============================================================
echo   CAI DAT LAN DAU - chay dung mot lan tren may moi
echo ============================================================
echo.

rem ---- 0. Thu muc cau hinh -----------------------------------------------
set "CFGDIR="
if exist "%GOC%CAU_HINH_VAN_HANH.json" set "CFGDIR=%GOC%."
if not defined CFGDIR for /d %%D in ("%GOC%*") do if exist "%%~fD\CAU_HINH_VAN_HANH.json" set "CFGDIR=%%~fD"
if not defined CFGDIR for /d %%D in ("%GOC%*") do if exist "%%~fD\CAU_HINH_VAN_HANH.mau.json" set "CFGDIR=%%~fD"
if not defined CFGDIR (
  echo LOI: Khong thay thu muc cau hinh.
  echo.
  echo   Canh bon file .bat nay phai co mot thu muc ten  Cau hinh  , ben trong
  echo   co file  CAU_HINH_VAN_HANH.json.
  echo   Ban vua giai nen thieu thu muc do. Giai nen lai ca goi roi chay lai.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)
set "CFG=%CFGDIR%\CAU_HINH_VAN_HANH.json"
set "MAU=%CFGDIR%\CAU_HINH_VAN_HANH.mau.json"

rem  KHONG BAO GIO ghi de file cau hinh da co: no giu chuoi bi mat cua may nay.
if not exist "%CFG%" (
  if not exist "%MAU%" (
    echo LOI: Thieu ca file cau hinh lan ban mau. Giai nen lai ca goi.
    if not defined TU_DONG pause
    exit /b 1
  )
  copy /y "%MAU%" "%CFG%" >nul
  echo   Vua tao  CAU_HINH_VAN_HANH.json  tu ban mau.
)

rem ---- 1. Node.js --------------------------------------------------------
set "NODE="
if exist "%CFGDIR%\node-portable\node.exe" set "NODE=%CFGDIR%\node-portable\node.exe"
if not defined NODE ( where node >nul 2>&1 && set "NODE=node" )
if not defined NODE (
  echo [1/6] Node.js: CHUA CO
  echo.
  echo  Tool can Node.js. Chon MOT trong hai cach:
  echo.
  echo  Cach 1 ^(khong can quyen quan tri, khuyen dung^):
  echo     - Tai ban "Windows Binary ^(.zip^)" tai https://nodejs.org/en/download
  echo     - Giai nen, doi ten thu muc thanh  node-portable
  echo     - Chep thu muc do vao ben trong thu muc  Cau hinh
  echo     - Chay lai file nay
  echo.
  echo  Cach 2: cai Node.js binh thuong tu https://nodejs.org roi chay lai file nay.
  echo.
  if not defined TU_DONG pause
  exit /b 1
)
for /f "delims=" %%v in ('"%NODE%" -v 2^>nul') do set "NODEV=%%v"
echo [1/6] Node.js: OK ^(%NODEV%^)

rem ---- 2. Khai bao kho ma GitHub -----------------------------------------
rem  Day la viec cua NGUOI PHU TRACH KY THUAT, khong phai cua nhan vien.
rem  Thieu no thi khong keo ma ve duoc, nen dung han o day.
"%NODE%" -e "var fs=require('fs');var s=fs.readFileSync(process.argv[1],'utf8').replace(/^\uFEFF/,'');var c=JSON.parse(s);var u=c.cap_nhat||{};var a=String(u.chu_tai_khoan||'').trim();var b=String(u.ten_repo||'').trim();if(a&&b){console.log('      Kho ma: '+a+'/'+b);process.exit(0);}var t=[];if(!a)t.push('chu_tai_khoan');if(!b)t.push('ten_repo');console.log('      Con trong: '+t.join(', '));process.exit(2);" "%CFG%"
set "MACFG=%ERRORLEVEL%"
if "%MACFG%"=="0" goto cfg_ok
if "%MACFG%"=="2" (
  echo [2/6] Khai bao kho ma GitHub: CHUA CO
  echo.
  echo   Day la viec lam MOT LAN cho may nay, do nguoi phu trach ky thuat lam,
  echo   khong phai viec cua nhan vien.
  echo.
  echo   1. Mo file nay bang Notepad:
  echo        %CFG%
  echo   2. Tim muc  "cap_nhat"  roi dien hai dong:
  echo        "chu_tai_khoan" : ten tai khoan GitHub
  echo        "ten_repo"      : ten kho ma
  echo   3. Luu file, dong Notepad, bam dup lai file nay.
  echo.
  echo   Cach lay hai ten do: doc  Cau hinh\HUONG_DAN_DUA_LEN_GITHUB.md
  echo.
  if not defined TU_DONG pause
  exit /b 1
)
echo [2/6] Khai bao kho ma GitHub: KHONG DOC DUOC FILE CAU HINH
echo.
echo   File cau hinh dang sai dinh dang JSON:
echo     %CFG%
echo   Mo bang Notepad, xem lai dau ngoac kep va dau phay.
echo.
if not defined TU_DONG pause
exit /b 1

:cfg_ok
echo [2/6] Khai bao kho ma GitHub: OK

rem ---- 3. Keo ma ve lan dau ----------------------------------------------
echo [3/6] Keo ma ve tu GitHub bang  2_CAP_NHAT.bat  ...
echo.
if not exist "%GOC%2_CAP_NHAT.bat" (
  echo       LOI: khong thay file  2_CAP_NHAT.bat  canh file nay.
  echo       Giai nen lai ca goi roi chay lai.
  if not defined TU_DONG pause
  exit /b 1
)
call "%GOC%2_CAP_NHAT.bat" /tu-dong
set "MACN=%ERRORLEVEL%"
echo.
if "%MACN%"=="0" goto ma_ok
if "%MACN%"=="3" goto ma_ok
if "%MACN%"=="8" (
  echo [3/6] Ma da ve may nhung thu vien chua cai xong. Doc dong  CHU Y  o tren.
  goto ma_ok
)
echo [3/6] Keo ma ve: KHONG XONG
echo.
echo   Ly do nam trong phan  CAP NHAT TOOL  o tren, doc nguyen van doan do.
echo   Chua co gi tren may bi hong. Sua xong bam dup lai file nay.
echo.
if not defined TU_DONG pause
exit /b 1

:ma_ok
set "TOOL="
if exist "%CFGDIR%\keodon-apps-script\node\chay-thu.js" set "TOOL=%CFGDIR%\keodon-apps-script"
if not defined TOOL if exist "%GOC%..\02_CODE\keodon-apps-script\node\chay-thu.js" set "TOOL=%GOC%..\02_CODE\keodon-apps-script"
if not defined TOOL (
  echo [3/6] Keo ma ve: bao xong nhung khong thay bo ma dau ca.
  echo       Bao nguoi phu trach ky thuat.
  if not defined TU_DONG pause
  exit /b 1
)
echo [3/6] Keo ma ve: OK

rem  Dung san thu muc tha file. Ten  da xu ly  co dau nen de Node doc tu
rem  cau hinh ma tao, khong go thang trong file .bat nay duoc.
"%NODE%" -e "var fs=require('fs');var s=fs.readFileSync(process.argv[1],'utf8').replace(/^\uFEFF/,'');var c=JSON.parse(s);var p=require('path');var goc=p.dirname(p.dirname(process.argv[1]));var tha=p.resolve(goc,c.thu_muc_tha_file||'1_THA_FILE_XUAT');var dx=c.ten_thu_muc_da_xu_ly||'da xu ly';var m=c.thu_muc_gian_hang||{};var ds=Object.keys(m);if(ds.length===0){console.log('      CHU Y: cau hinh chua khai thu_muc_gian_hang.');process.exit(0);}ds.forEach(function(k){fs.mkdirSync(p.join(tha,m[k],dx),{recursive:true});});console.log('      Du '+ds.length+' thu muc gian hang: '+ds.map(function(k){return m[k];}).join(', '));" "%CFG%"

rem ---- 4. Link Web App va chuoi bi mat ------------------------------------
rem  Thieu thi NHAC chu khong chan: may van coi nhu da cai xong, chi la chua
rem  chay len Google duoc.
"%NODE%" -e "var fs=require('fs');var s=fs.readFileSync(process.argv[1],'utf8').replace(/^\uFEFF/,'');var c=JSON.parse(s);var g=c.google_sheet||{};var t=[];if(!String(g.web_app_url||'').trim())t.push('web_app_url');if(!String(g.chuoi_bi_mat||'').trim())t.push('chuoi_bi_mat');if(t.length===0)process.exit(0);console.log('      Con trong: '+t.join(', '));process.exit(2);" "%CFG%"
set "MAGS=%ERRORLEVEL%"
if "%MAGS%"=="0" (
  echo [4/6] Link Web App va chuoi bi mat: OK
) else (
  echo [4/6] Link Web App va chuoi bi mat: CHUA DIEN
)

rem ---- 5. Goi thu ping len Web App ---------------------------------------
set "MAPING=9"
if "%MAGS%"=="0" (
  echo [5/6] Goi thu len Web App tren Google...
  "%NODE%" -e "var W=require(process.argv[1]).WebAppGoogleSheet;var fs=require('fs');var s=fs.readFileSync(process.argv[2],'utf8').replace(/^\uFEFF/,'');var c=JSON.parse(s);var g=c.google_sheet||{};g.bat=true;var w;try{w=new W(g);}catch(e){console.error('      CHUA DIEN DU CAU HINH: '+e.message);process.exit(2);}w.ping().then(function(r){console.log('      Web App tra loi OK.');console.log('      Ban dang Deploy tren Google : '+r.phienBan);console.log('      Thang may chu Google dang o : '+r.thangHienTai);process.exit(0);},function(e){console.error('      GOI KHONG DUOC: '+e.message);process.exit(1);});" "%TOOL%\node\gsheet-web-app.js" "%CFG%"
  set "MAPING=!ERRORLEVEL!"
) else (
  echo [5/6] Goi thu len Web App: BO QUA vi chua dien du cau hinh
)

rem ---- 6. Ket luan -------------------------------------------------------
echo.
echo ============================================================
if "%MAPING%"=="0" (
  echo   [6/6] SAN SANG.
  echo.
  echo   Tu gio moi ngay chi lam mot viec:
  echo     tha file xuat Shopee vao  1_THA_FILE_XUAT\^<ten gian hang^>\
  echo     roi bam dup  4_CHAY_TOOL.bat
  echo ============================================================
  echo.
  if not defined TU_DONG pause
  exit /b 0
)
if not "%MAGS%"=="0" (
  echo   [6/6] CHUA SAN SANG - con thieu dung mot viec, lam mot lan:
  echo.
  echo     1. Mo file cau hinh bang Notepad:
  echo          %CFG%
  echo     2. Dien hai dong trong muc  "google_sheet":
  echo          "web_app_url"  : link /exec cua Apps Script
  echo          "chuoi_bi_mat" : chuoi bi mat cua du an
  echo        Hai thu nay do nguoi phu trach ky thuat cho biet.
  echo        Cach lay: doc  Cau hinh\BAT_GOOGLE_SHEET.md
  echo     3. Luu file, dong Notepad, bam dup lai file nay.
  echo.
  echo   CHUOI BI MAT LA BI MAT: dung chup man hinh gui di, dung gui qua
  echo   chat, dung dong bo thu muc nay len dam may.
  echo ============================================================
  echo.
  if not defined TU_DONG pause
  exit /b 2
)
echo   [6/6] CHUA SAN SANG - goi len Google khong duoc.
echo.
echo   Doc dong  GOI KHONG DUOC  o tren. Ba nguyen nhan hay gap:
echo     1. May dang mat mang.
echo     2. Link /exec go sai, hoac ban Deploy chua de quyen "Anyone".
echo     3. Chuoi bi mat khac chuoi da cai bang caiDat^(^) tren Apps Script.
echo   Ma va thu vien da nam san tren may. Sua xong bam dup lai file nay.
echo ============================================================
echo.
if not defined TU_DONG pause
exit /b 3
