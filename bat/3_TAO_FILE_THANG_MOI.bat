@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Tao file tracking thang moi

rem ============================================================
rem  3_TAO_FILE_THANG_MOI.bat - dau thang bam mot lan.
rem  Hoi dung BA tham so ngay tren cua so den:
rem      Thang truoc: (vi du dien 9)
rem      Thang can tao: (vi du dien 10)
rem      Link thang moi:
rem  roi kiem tra tung tham so va ghi lai de buoc tao file chay.
rem
rem  CA FILE PHAI LA ASCII THUAN VA XUONG DONG CRLF - NOTES_DEV muc 4.1.
rem  Ba cau hoi tren PHAI hien dung chinh ta tieng Viet co dau, ma .bat thi
rem  khong chua duoc chu co dau, nen ba cau do nam duoi dang Base64 trong
rem  khoi PowerShell o cuoi file. Moi chuoi Base64 deu co chu thich khong
rem  dau ngay ben canh de nguoi sau doc duoc.
rem
rem  Tham so an, chi dung khi chay thu:
rem      /tra-loi "9|10|https://..."   tra loi san, khong hoi
rem      /tu-dong                      khong dung lai cho bam phim
rem ============================================================

set "TM_TEP=%~f0"
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
echo   TAO FILE TRACKING THANG MOI
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
  echo.
  if not defined TM_TU_DONG pause
  exit /b 1
)
set "TM_CFGDIR=%CFGDIR%"

rem ---- 2. Chay khoi PowerShell o cuoi file --------------------------------
powershell -NoProfile -ExecutionPolicy Bypass -Command "$m='#PS'+'_BAT_DAU'; $d=Get-Content -LiteralPath $env:TM_TEP; $n=($d | Select-String -SimpleMatch $m | Select-Object -Last 1).LineNumber; & ([scriptblock]::Create(($d | Select-Object -Skip $n) -join [char]10)); exit [int]$global:TM_MA"
set "MA=%ERRORLEVEL%"
if "%MA%"=="9009" goto khong_co_powershell

echo.
if not defined TM_TU_DONG pause
exit /b %MA%

:khong_co_powershell
echo LOI: May nay khong goi duoc PowerShell.
echo      Nut nay can PowerShell, ban Windows nao cung co san.
echo      Bao nguoi phu trach ky thuat. Trong luc cho, van bam dup
echo      4_CHAY_TOOL.bat de keo don binh thuong nhu moi ngay.
echo.
if not defined TM_TU_DONG pause
exit /b 1

rem ==================================================================
rem  Tu day tro xuong la ma PowerShell. cmd.exe khong bao gio doc toi
rem  vi da exit /b o tren. Dong ngay duoi la moc de PowerShell cat file.
rem ==================================================================
#PS_BAT_DAU

$ErrorActionPreference = 'Stop'
$global:TM_MA = 1

try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }

function Bao($t) { Write-Host $t }
function Gach()  { Write-Host '------------------------------------------------------------' }

# Chuoi tieng Viet CO DAU, cat trong Base64 vi file .bat bat buoc la ASCII thuan.
function V($b64) { [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($b64)) }

# 'Thang truoc: (vi du dien 9)'
$HOI_CU   = 'VGjDoW5nIHRyxrDhu5tjOiAodsOtIGThu6UgxJFp4buBbiA5KQ=='
# 'Thang can tao: (vi du dien 10)'
$HOI_MOI  = 'VGjDoW5nIGPhuqduIHThuqFvOiAodsOtIGThu6UgxJFp4buBbiAxMCk='
# 'Link thang moi: '
$HOI_LINK = 'TGluayB0aMOhbmcgbeG7m2k6IA=='

$base   = $env:TM_BASE
$cfgDir = $env:TM_CFGDIR
$traLoi = $env:TM_TRA_LOI

function Hoi($b64) {
  Write-Host (V $b64) -NoNewline
  return [Console]::ReadLine()
}

try {

  # ---- 1. Ba cau hoi ---------------------------------------------------
  if ($traLoi) {
    $p = $traLoi -split '\|'
    if ($p.Count -lt 3) { Bao 'LOI: /tra-loi phai co du ba phan, ngan cach bang dau gach dung.'; $global:TM_MA = 1; return }
    $sCu = $p[0]; $sMoi = $p[1]; $link = $p[2]
    Write-Host ((V $HOI_CU)   + $sCu)
    Write-Host ((V $HOI_MOI)  + $sMoi)
    Write-Host ((V $HOI_LINK) + $link)
  } else {
    $sCu  = Hoi $HOI_CU
    $sMoi = Hoi $HOI_MOI
    $link = Hoi $HOI_LINK
  }
  Write-Host ''

  # ---- 2. Kiem tung tham so -------------------------------------------
  $sCu  = ([string]$sCu).Trim()
  $sMoi = ([string]$sMoi).Trim()
  $link = ([string]$link).Trim()

  if ($sCu -notmatch '^\d{1,2}$' -or [int]$sCu -lt 1 -or [int]$sCu -gt 12) {
    Bao ('LOI: Thang truoc phai la so tu 1 den 12. Ban vua go: "' + $sCu + '"')
    Bao '     Bam dup lai file nay va go lai. Chua co gi bi thay doi.'
    $global:TM_MA = 1; return
  }
  if ($sMoi -notmatch '^\d{1,2}$' -or [int]$sMoi -lt 1 -or [int]$sMoi -gt 12) {
    Bao ('LOI: Thang can tao phai la so tu 1 den 12. Ban vua go: "' + $sMoi + '"')
    Bao '     Bam dup lai file nay va go lai. Chua co gi bi thay doi.'
    $global:TM_MA = 1; return
  }

  $mCu  = [int]$sCu
  $mMoi = [int]$sMoi
  $namNay  = (Get-Date).Year
  $namCu   = $namNay
  $namMoi  = $namNay

  # Thang can tao phai LIEN SAU thang truoc. 12 -> 1 thi tang nam.
  if ($mCu -eq 12) {
    if ($mMoi -ne 1) {
      Bao ('LOI: Thang truoc la 12 thi thang can tao phai la 1, khong phai ' + $mMoi + '.')
      Bao '     Tool khong tao nhay thang. Bam dup lai file nay va go lai.'
      $global:TM_MA = 1; return
    }
    $namMoi = $namNay + 1
  } elseif ($mMoi -ne ($mCu + 1)) {
    Bao ('LOI: Thang can tao phai lien sau thang truoc. ' + $mCu + ' thi phai la ' + ($mCu + 1) + ', ban go ' + $mMoi + '.')
    Bao '     Tool khong tao nhay thang, cung khong tao lui thang. Bam dup lai file nay va go lai.'
    $global:TM_MA = 1; return
  }

  # Link phai la link Google Sheet that, va lay duoc id file.
  $id = ''
  $m = [regex]::Match($link, '^https://docs\.google\.com/spreadsheets/d/([A-Za-z0-9_-]{20,})')
  if ($m.Success) { $id = $m.Groups[1].Value }
  if (-not $id) {
    Bao 'LOI: Link thang moi khong phai link Google Sheet.'
    Bao ''
    Bao ('  Ban vua dan: ' + $link)
    Bao '  Link dung co dang:  https://docs.google.com/spreadsheets/d/<chuoi chu va so>/edit'
    Bao '  Cach lay: mo file thang moi tren Google, bam thanh dia chi cua trinh duyet,'
    Bao '            Ctrl+C, roi dan vao day bang Ctrl+V.'
    Bao '  Chua co gi bi thay doi.'
    $global:TM_MA = 1; return
  }

  $thangMoi = ('{0}-{1:d2}' -f $namMoi, $mMoi)
  $thangCu  = ('{0}-{1:d2}' -f $namCu,  $mCu)

  Gach
  Bao '  DA HIEU DUNG NHU SAU'
  Bao ('    Thang truoc   : ' + $thangCu)
  Bao ('    Thang can tao : ' + $thangMoi)
  Bao ('    File thang moi: ' + $id)
  Gach
  Bao ''

  # ---- 3. Ghi lai de buoc tao file dung -------------------------------
  $tep = Join-Path $cfgDir ('thang-moi-' + $thangMoi + '.json')
  $obj = [ordered]@{
    thang_truoc    = $thangCu
    thang_can_tao  = $thangMoi
    link_thang_moi = $link
    id_thang_moi   = $id
    ghi_luc        = (Get-Date).ToString('yyyy-MM-dd HH:mm')
  }
  Set-Content -LiteralPath $tep -Value ($obj | ConvertTo-Json) -Encoding UTF8
  Bao ('Da ghi ba tham so vao: ' + (Split-Path $tep -Leaf))
  Bao ''

  # ---- 4. Buoc tao file tren Google -----------------------------------
  # Ban nay CHUA co hanh dong "taoThangMoi" tren Web App. src/ShellAppsScript.gs
  # moi nhan bon hanh dong: ping, doc, ghi, xuLy. Noi doi la nhan vien tuong
  # da tao xong roi di keo don vao mot file chua khoi tao.
  Gach
  Bao '  BUOC TAO FILE TREN GOOGLE CHUA BAT O BAN NAY.'
  Bao ''
  Bao '  Ba tham so cua ban da duoc kiem het va ghi lai o tren, khong phai go lai.'
  Bao '  Con thieu dung mot thu: hanh dong "taoThangMoi" tren Web App Apps Script.'
  Bao '  Ban dang Deploy moi nhan bon hanh dong: ping, doc, ghi, xuLy.'
  Bao ''
  Bao '  Viec phai lam bay gio:'
  Bao '   1. Dua file vua ghi o tren cho nguoi phu trach ky thuat.'
  Bao '   2. Trong luc cho, VAN keo don binh thuong bang 4_CHAY_TOOL.bat.'
  Bao '      Tool luon ghi vao file cua thang theo NGAY CHAY, khong ghi lui.'
  Bao ''
  Bao '  Chua co o nao tren Google bi ghi. Bam lai file nay bao nhieu lan cung duoc.'
  Gach
  $global:TM_MA = 3

} catch {
  Bao ''
  Bao 'LOI KHONG DOAN TRUOC.'
  Bao ''
  Bao ('  Chi tiet ky thuat:  ' + $_.Exception.Message)
  Bao '  Chup man hinh cua so nay gui nguoi phu trach ky thuat.'
  Bao '  Chua co o nao tren Google bi ghi.'
  $global:TM_MA = 9
}
