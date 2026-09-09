@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
cd /d "%~dp0"
title Cap nhat tool - lay ban ma moi tu GitHub

rem ============================================================
rem  2_CAP_NHAT.bat - bam mot cai la tai ban ma moi nhat ve may.
rem
rem  File nay nam NGOAI cung, canh ba nut kia, de nhan vien nhin thay ngay.
rem  Nhung moi thu no doc va ghi van nam trong thu muc  Cau hinh  (cau hinh,
rem  ban lui  _ban_cu_... , node-portable). Ten thu muc do co dau tieng Viet
rem  ma file .bat phai la ASCII thuan, nen KHONG go thang duoc: phai DO bang
rem  cach quet thu muc con tim CAU_HINH_VAN_HANH.json, y het  4_CHAY_TOOL.bat.
rem
rem  Nut nay CHI thay ba thu trong bo ma keodon-apps-script:
rem      src\   node\   package.json
rem  Nut nay KHONG BAO GIO dung toi:
rem      CAU_HINH_VAN_HANH.json  (chua chuoi bi mat)
rem      1_THA_FILE_XUAT  va cac thu muc  da xu ly  ben trong  (du lieu khach)
rem
rem  Tham so an, chi dung khi chay thu:
rem      /nguon "duong dan file .zip"   doc tu file thay vi tai tu mang
rem      /tu-dong                       khong dung lai cho bam phim
rem ============================================================

set "CN_TEP=%~f0"
rem Cat duong dan thu muc TRUOC vong doc tham so: sau lenh `shift` thi %~dp0 KHONG con tro
rem toi chinh file .bat nay nua. Bay nay da ghi trong DONG_GOI_GIAO_NHAN_VIEN.md muc 5.
set "CN_GOC=%~dp0"
set "CN_NGUON="
set "CN_TU_DONG="

:doc_tham_so
if "%~1"=="" goto het_tham_so
if /i "%~1"=="/nguon" goto ts_nguon
if /i "%~1"=="/tu-dong" goto ts_tu_dong
shift
goto doc_tham_so
:ts_nguon
set "CN_NGUON=%~2"
shift
shift
goto doc_tham_so
:ts_tu_dong
set "CN_TU_DONG=1"
shift
goto doc_tham_so
:het_tham_so

rem ---- Do thu muc  Cau hinh  (khong go thang duoc vi ten co dau) ----------
rem PHAI DAT SAU vong doc tham so. Truoc day khoi nay nam TREN :doc_tham_so, nen luc no chay
rem thi CN_TU_DONG chua duoc dat va lenh `pause` khong the nao tat duoc: may nhan vien TREO CHO
rem BAM PHIM, ma nut 1 goi file nay bang `call ... /tu-dong` nen no dung im khong bao gi. Doc ma
rem khong thay duoc, chay that bang cmd.exe moi lo ra.
rem
rem Chap nhan ca hai bo cuc: file nay nam CANH thu muc cau hinh (bo cuc moi),
rem hoac nam NGAY TRONG thu muc cau hinh (bo cuc cu, hoac ai do chep nguoc lai).
set "CN_BASE="
if exist "%CN_GOC%CAU_HINH_VAN_HANH.json" set "CN_BASE=%CN_GOC%"
if not defined CN_BASE for /d %%D in ("%CN_GOC%*") do if exist "%%~fD\CAU_HINH_VAN_HANH.json" set "CN_BASE=%%~fD\"
if not defined CN_BASE (
  echo LOI: Khong tim thay file CAU_HINH_VAN_HANH.json.
  echo.
  echo   File do phai nam trong thu muc  Cau hinh  , ngay canh bon file .bat nay.
  echo   Cach sua: bam dup  1_CAI_DAT_LAN_DAU.bat  mot lan. No tu tao file
  echo             cau hinh tu ban mau roi chi ro phai dien nhung gi.
  echo.
  if not defined CN_TU_DONG pause
  exit /b 1
)

echo ============================================================
echo   CAP NHAT TOOL - lay ban ma moi nhat ve may
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command "$m='#PS'+'_BAT_DAU'; $d=Get-Content -LiteralPath $env:CN_TEP; $n=($d | Select-String -SimpleMatch $m | Select-Object -Last 1).LineNumber; & ([scriptblock]::Create(($d | Select-Object -Skip $n) -join [char]10)); exit [int]$global:CN_MA"
set "MA=%ERRORLEVEL%"
if "%MA%"=="9009" goto khong_co_powershell

echo.
if not defined CN_TU_DONG pause
exit /b %MA%

:khong_co_powershell
echo LOI: May nay khong goi duoc PowerShell.
echo      Nut cap nhat can PowerShell, ban Windows nao cung co san.
echo      Bao nguoi phu trach ky thuat. Trong luc cho, van bam dup
echo      4_CHAY_TOOL.bat de lam viec binh thuong nhu moi ngay.
echo.
if not defined CN_TU_DONG pause
exit /b 1

rem ==================================================================
rem  Tu day tro xuong la ma PowerShell. cmd.exe khong bao gio doc toi
rem  vi da exit /b o tren. Dong ngay duoi la moc de PowerShell cat file.
rem  Ca file phai la ASCII thuan va xuong dong CRLF, xem NOTES_DEV muc 4.1,
rem  nen moi cau tieng Viet trong file nay deu viet khong dau.
rem ==================================================================
#PS_BAT_DAU

$ErrorActionPreference = 'Stop'
$ProgressPreference    = 'SilentlyContinue'
$global:CN_MA = 9

function Bao($t)  { Write-Host $t }
function Gach()   { Write-Host '------------------------------------------------------------' }

$base   = $env:CN_BASE
$nguon  = $env:CN_NGUON
# Bo ma nam o mot trong hai cho: trong chinh thu muc `Cau hinh` (ban giao cho may
# nhan vien), hoac o 02_CODE cua thu muc du an. Lay cho nao co that.
$toolTrong = [IO.Path]::GetFullPath((Join-Path $base 'keodon-apps-script'))
$toolNgoai = [IO.Path]::GetFullPath((Join-Path $base '..\..\02_CODE\keodon-apps-script'))
# Ba ca, xet theo dung thu tu nay:
#   1. Da co ma trong `Cau hinh`          -> may nhan vien, da cai roi
#   2. Da co ma o 02_CODE                 -> dang chay trong thu muc du an
#   3. Chua co ma o dau ca (CAI LAN DAU)  -> co thu muc cha cua 02_CODE thi la may
#      du an, khong co thi la may nhan vien va ma se ve nam trong `Cau hinh`.
$tool = $null
if (Test-Path -LiteralPath (Join-Path $toolTrong 'package.json')) { $tool = $toolTrong }
if (-not $tool -and (Test-Path -LiteralPath (Join-Path $toolNgoai 'package.json'))) { $tool = $toolNgoai }
if (-not $tool) {
  if (Test-Path -LiteralPath (Split-Path $toolNgoai -Parent)) { $tool = $toolNgoai } else { $tool = $toolTrong }
}
# Thu muc chua bon file .bat = thu muc chua CHINH FILE NAY, khong phai "tren $base mot cap".
# Hai cach chi trung nhau o bo cuc moi. O bo cuc cu (nut nam NGAY TRONG `Cau hinh` - truong hop ma
# chu thich dau file noi ro la van chap nhan) thi "tren $base mot cap" tro ra ngoai `Cau hinh`, va
# muc 6b se chep ba nut len nham mot cap. Lay thu muc cua chinh file nay thi dung ca hai bo cuc.
$thuMucNut = [IO.Path]::GetDirectoryName($env:CN_TEP)
$cfgTep = Join-Path $base 'CAU_HINH_VAN_HANH.json'
$mocTep = Join-Path $base '_lan_kiem_cap_nhat.txt'
$tam    = $null
$bak    = $null

function GhiMoc() {
  try { Set-Content -LiteralPath $mocTep -Value ((Get-Date).ToString('yyyy-MM-dd HH:mm')) -Encoding ASCII } catch { }
}

# '2.3.0' -> danh sach 4 so. Khong doc duoc thi tra ve $null.
function SoPhienBan($s) {
  $t = ([string]$s).Trim()
  if ($t -eq '') { return $null }
  $t = ($t -split '[-+]')[0]
  $p = $t -split '\.'
  if ($p.Count -lt 2) { return $null }
  $n = New-Object 'System.Collections.Generic.List[int]'
  foreach ($x in $p) {
    if ($x -match '^\d+$') { $n.Add([int]$x) } else { return $null }
  }
  while ($n.Count -lt 4) { $n.Add(0) }
  return $n
}

# Chuoi dai dien cho danh sach thu vien trong package.json.
# Chi doi chuoi nay moi phai chay npm install. Doi moi so version thi khong,
# vi lan cap nhat nao so version cung doi, chay npm install moi lan la thua.
function KhoaThuVien($tep) {
  $o = (Get-Content -LiteralPath $tep -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
  $a = ''
  $b = ''
  if ($o.dependencies)    { $a = ($o.dependencies    | ConvertTo-Json -Compress -Depth 6) }
  if ($o.devDependencies) { $b = ($o.devDependencies | ConvertTo-Json -Compress -Depth 6) }
  return ($a + '|' + $b)
}

function SoSanh($a, $b) {
  for ($i = 0; $i -lt 4; $i++) {
    if ($a[$i] -gt $b[$i]) { return 1 }
    if ($a[$i] -lt $b[$i]) { return -1 }
  }
  return 0
}

# Thay ca thu muc: doi ten thu muc cu ra mot ben, chep ban moi vao,
# chep xong moi xoa ban cu. Hong giua chung thi tra lai nguyen trang.
# THEM khoa con thieu tu ban mau vao file cau hinh THAT, giu nguyen moi gia tri
# dang co. Day la rang buoc nang nhat cua nut nay: file cau hinh giu link Web App
# va chuoi bi mat rieng cua tung may, ghi de len no la mat sach.
# Tra ve danh sach ten khoa da them (rong = khong phai dong gi vao file).
function GopKhoaThieu($mauTep, $thatTep) {
  $them = New-Object 'System.Collections.Generic.List[string]'
  if (-not (Test-Path -LiteralPath $thatTep)) { return $them }
  $mau  = (Get-Content -LiteralPath $mauTep  -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
  $that = (Get-Content -LiteralPath $thatTep -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json

  function DiSau($m, $t, $duong) {
    foreach ($k in $m.PSObject.Properties.Name) {
      $co = $t.PSObject.Properties.Name -contains $k
      $ten = $(if ($duong -eq '') { $k } else { $duong + '.' + $k })
      if (-not $co) {
        Add-Member -InputObject $t -MemberType NoteProperty -Name $k -Value $m.$k
        $script:themDS.Add($ten)
      } elseif ($m.$k -is [PSCustomObject] -and $t.$k -is [PSCustomObject]) {
        DiSau $m.$k $t.$k $ten
      }
    }
  }
  $script:themDS = $them
  DiSau $mau $that ''
  if ($them.Count -gt 0) {
    # Ghi lai bang UTF8 khong BOM: Node doc file nay.
    $chu = ($that | ConvertTo-Json -Depth 20)
    [IO.File]::WriteAllText($thatTep, $chu, (New-Object Text.UTF8Encoding($false)))
  }
  return $them
}

function ThayThuMuc($tuDau, $vaoDau) {
  $tenDich = Split-Path $vaoDau -Leaf
  $cu = $vaoDau + '.__cu'
  if (Test-Path -LiteralPath $cu) { Remove-Item -LiteralPath $cu -Recurse -Force }
  if (Test-Path -LiteralPath $vaoDau) { Rename-Item -LiteralPath $vaoDau -NewName ($tenDich + '.__cu') }
  try {
    Copy-Item -LiteralPath $tuDau -Destination $vaoDau -Recurse -Force
    if (Test-Path -LiteralPath $cu) { Remove-Item -LiteralPath $cu -Recurse -Force }
  } catch {
    if (Test-Path -LiteralPath $vaoDau) { Remove-Item -LiteralPath $vaoDau -Recurse -Force }
    if (Test-Path -LiteralPath $cu) { Rename-Item -LiteralPath $cu -NewName $tenDich }
    throw
  }
}

try {

  # ---- 1. Doc cau hinh -----------------------------------------------
  if (-not (Test-Path -LiteralPath $cfgTep)) {
    Bao 'LOI: Khong thay file CAU_HINH_VAN_HANH.json.'
    Bao ''
    Bao '  File do phai nam trong thu muc  Cau hinh  , ngay canh bon file .bat.'
    Bao '  Neu ban vua chep file di cho khac thi chep tra ve cho cu roi bam lai.'
    $global:CN_MA = 1; return
  }
  try {
    $cfg = (Get-Content -LiteralPath $cfgTep -Raw -Encoding UTF8).TrimStart([char]0xFEFF) | ConvertFrom-Json
  } catch {
    Bao 'LOI: File CAU_HINH_VAN_HANH.json dang sai dinh dang nen khong doc duoc.'
    Bao ''
    Bao '  Mo file bang Notepad, xem lai dau ngoac kep va dau phay.'
    Bao '  Dung xoa file nay: no chua cai dat rieng cua may ban.'
    Bao '  Khong tu sua duoc thi bao nguoi phu trach ky thuat.'
    $global:CN_MA = 1; return
  }

  $cn = $cfg.cap_nhat
  $chu = ''; $repo = ''; $nhanh = 'main'
  if ($cn) {
    if ($cn.chu_tai_khoan) { $chu   = ([string]$cn.chu_tai_khoan).Trim() }
    if ($cn.ten_repo)      { $repo  = ([string]$cn.ten_repo).Trim() }
    if ($cn.nhanh)         { $nhanh = ([string]$cn.nhanh).Trim() }
  }
  if ($nhanh -eq '') { $nhanh = 'main' }

  if ((-not $nguon) -and (($chu -eq '') -or ($repo -eq ''))) {
    Bao 'LOI: Chua khai bao kho ma tren GitHub nen chua biet tai ban moi o dau.'
    Bao ''
    Bao '  Lam mot lan cho may nay la xong:'
    Bao '   1. Mo file  CAU_HINH_VAN_HANH.json  bang Notepad.'
    Bao '   2. Tim muc   "cap_nhat".'
    Bao '   3. Dien ten tai khoan GitHub vao  chu_tai_khoan, ten kho ma vao  ten_repo.'
    Bao '      Vi du:   "chu_tai_khoan": "anhtu",   "ten_repo": "keodon-shopee"'
    Bao '   4. Luu file, dong Notepad, bam dup lai 2_CAP_NHAT.bat.'
    Bao ''
    Bao '  Hai ten nay do nguoi phu trach ky thuat cho biet.'
    Bao '  Cach lay hai ten do: xem file  HUONG_DAN_DUA_LEN_GITHUB.md.'
    Bao '  Chua co gi tren may bi thay doi.'
    $global:CN_MA = 1; return
  }

  # ---- 2. Ban ma dang chay tren may ----------------------------------
  #  Goi dong goi giao nhan vien KHONG chua src/ va node/: ma ve may qua dung mot
  #  duong la nut nay. Nen "tren may chua co ma" la chuyen BINH THUONG cua lan cai
  #  dau, khong phai loi. Truoc day cho la loi, nen 1_CAI_DAT_LAN_DAU.bat goi sang
  #  day thi nga ngay tai cho nay.
  $pkgCuTep = Join-Path $tool 'package.json'
  $lanDau   = -not (Test-Path -LiteralPath $pkgCuTep)
  $vCu      = $null
  $vCuS     = ''
  if ($lanDau) {
    Bao 'Tren may chua co ma   :  day la lan cai dau, se tai ve va cai moi.'
    Bao ('Ma se nam o           :  ' + $tool)
  } else {
    $vCuS = (Get-Content -LiteralPath $pkgCuTep -Raw -Encoding UTF8).TrimStart([char]0xFEFF)
    $vCuS = ([string](($vCuS | ConvertFrom-Json).version)).Trim()
    $vCu  = SoPhienBan $vCuS
    if (-not $vCu) {
      Bao 'LOI: Khong doc duoc so phien ban cua ban dang cai tren may.'
      Bao ''
      Bao ('  Xem dong  "version"  trong file:  ' + $pkgCuTep)
      Bao '  No phai co dang  "version": "2.3.0". Bao nguoi phu trach ky thuat.'
      $global:CN_MA = 1; return
    }
    Bao ('Ban dang cai tren may :  ' + $vCuS)
  }

  # ---- 3. Lay ban moi -------------------------------------------------
  $tam = Join-Path ([IO.Path]::GetTempPath()) ('capnhat_' + [Guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Path $tam | Out-Null
  $zip = Join-Path $tam 'ban-moi.zip'

  if ($nguon) {
    Bao ('Doc tu file thu       :  ' + $nguon)
    if (-not (Test-Path -LiteralPath $nguon)) {
      Bao ''
      Bao 'LOI: Khong thay file nen o duong dan dua sau /nguon.'
      Bao '  Tham so /nguon chi dung de chay thu. Bam dup binh thuong thi khong can no.'
      $global:CN_MA = 6; return
    }
    Copy-Item -LiteralPath $nguon -Destination $zip -Force
  } else {
    $url = 'https://github.com/' + $chu + '/' + $repo + '/archive/refs/heads/' + $nhanh + '.zip'
    Bao ('Dang tai ve tu        :  ' + $url)
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }
    try {
      Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 90 -UseBasicParsing
    } catch {
      $maHttp = 0
      try { $maHttp = [int]$_.Exception.Response.StatusCode.value__ } catch { $maHttp = 0 }
      Bao ''
      if ($maHttp -eq 404) {
        Bao 'LOI: GitHub tra loi 404, tuc la khong co kho ma nao ten nhu vay.'
        Bao ''
        Bao '  Kiem tra ba viec:'
        Bao ('   1. Hai ten trong CAU_HINH_VAN_HANH.json co go dung khong:  ' + $chu + ' / ' + $repo)
        Bao '      GitHub phan biet chu hoa chu thuong.'
        Bao '   2. Kho ma da de che do Public chua. De Private thi may nhan vien khong tai duoc.'
        Bao ('   3. Nhanh dang tim la  ' + $nhanh + '. Vai kho cu dat ten nhanh la  master.')
        Bao '      Sua dong  "nhanh"  trong muc  "cap_nhat"  neu can.'
        Bao ''
        Bao '  Chua co gi tren may bi thay doi. Van chay 4_CHAY_TOOL.bat binh thuong.'
        $global:CN_MA = 5; return
      }
      Bao 'LOI: Khong tai duoc ban moi ve.'
      Bao ''
      Bao '  Thuong la mot trong ba ly do:'
      Bao '   1. May dang mat mang. Mo trinh duyet vao mot trang bat ky de kiem lai.'
      Bao '   2. Mang cong ty chan github.com. Nho nguoi quan tri mang mo duong.'
      Bao '   3. GitHub dang ban. Doi vai phut roi bam lai.'
      Bao ''
      Bao '  Chua co gi tren may bi thay doi. Van chay 4_CHAY_TOOL.bat binh thuong.'
      Bao ('  Chi tiet ky thuat:  ' + $_.Exception.Message)
      $global:CN_MA = 4; return
    }
  }

  # ---- 4. Giai nen va so phien ban ------------------------------------
  $giai = Join-Path $tam 'giai'
  try {
    Expand-Archive -LiteralPath $zip -DestinationPath $giai -Force
  } catch {
    Bao ''
    Bao 'LOI: File tai ve bi hong nen khong mo ra duoc.'
    Bao ''
    Bao '  Thuong la mang dut giua chung. Bam dup 2_CAP_NHAT.bat lan nua.'
    Bao '  Ba lan van hong thi bao nguoi phu trach ky thuat.'
    Bao '  Chua co gi tren may bi thay doi.'
    $global:CN_MA = 6; return
  }

  $goc = $null
  if (Test-Path -LiteralPath (Join-Path $giai 'package.json')) { $goc = $giai }
  if (-not $goc) {
    foreach ($d in (Get-ChildItem -LiteralPath $giai -Directory)) {
      if (Test-Path -LiteralPath (Join-Path $d.FullName 'package.json')) { $goc = $d.FullName; break }
    }
  }
  if (-not $goc) {
    foreach ($d in (Get-ChildItem -LiteralPath $giai -Directory)) {
      foreach ($e in (Get-ChildItem -LiteralPath $d.FullName -Directory)) {
        if (Test-Path -LiteralPath (Join-Path $e.FullName 'package.json')) { $goc = $e.FullName; break }
      }
      if ($goc) { break }
    }
  }
  $duCauTruc = $false
  if ($goc) {
    # Bon thu, khong phai ba. Thieu `bat` thi ba nut bam tren may nhan vien khong bao gio
    # duoc cap nhat, ma lai KHONG AI BIET - dung kieu hong am tham ma du an nay cam.
    $duCauTruc = (Test-Path -LiteralPath (Join-Path $goc 'src')) -and (Test-Path -LiteralPath (Join-Path $goc 'node')) -and (Test-Path -LiteralPath (Join-Path $goc 'bat'))
  }
  if (-not $duCauTruc) {
    Bao ''
    Bao 'LOI: Ban tai ve khong dung cau truc.'
    Bao ''
    Bao '  Trong kho ma tren GitHub, ngay o muc goc phai co du BON thu:'
    Bao '     thu muc  src     thu muc  node     thu muc  bat     file  package.json'
    Bao '  Nguoi day ma len co the da bo nham chung vao mot thu muc con.'
    Bao '  Dua file HUONG_DAN_DUA_LEN_GITHUB.md cho nguoi phu trach ky thuat xem.'
    Bao '  Chua co gi tren may bi thay doi.'
    $global:CN_MA = 6; return
  }

  $pkgMoiTep = Join-Path $goc 'package.json'
  $vMoiS = (Get-Content -LiteralPath $pkgMoiTep -Raw -Encoding UTF8).TrimStart([char]0xFEFF)
  $vMoiS = ([string](($vMoiS | ConvertFrom-Json).version)).Trim()
  $vMoi  = SoPhienBan $vMoiS
  if (-not $vMoi) {
    Bao ''
    Bao 'LOI: Khong doc duoc so phien ban cua ban tren GitHub.'
    Bao ''
    Bao '  Dong  "version"  trong package.json cua kho ma phai co dang  "2.4.0".'
    Bao '  Bao nguoi phu trach ky thuat sua roi day len lai.'
    Bao '  Chua co gi tren may bi thay doi.'
    $global:CN_MA = 6; return
  }
  Bao ('Ban dang co tren GitHub:  ' + $vMoiS)
  Bao ''

  if ((-not $lanDau) -and ((SoSanh $vMoi $vCu) -le 0)) {
    GhiMoc
    Gach
    Bao '  DANG LA BAN MOI NHAT. Khong phai lam gi ca.'
    Bao '  Khong co file nao tren may bi thay doi.'
    Gach
    $global:CN_MA = 3; return
  }

  # ---- 5. Sao luu ban dang chay ---------------------------------------
  #  Lan cai dau thi khong co gi de sao luu, va thu muc bo ma con chua ton tai.
  $bakTen = '(khong co, day la lan cai dau)'
  if ($lanDau) {
    if (-not (Test-Path -LiteralPath $tool)) { New-Item -ItemType Directory -Path $tool -Force | Out-Null }
  } else {
  $moc = (Get-Date).ToString('yyyyMMdd_HHmm')
  $bak = Join-Path $base ('_ban_cu_' + $moc)
  $k = 1
  while (Test-Path -LiteralPath $bak) {
    $k = $k + 1
    $bak = Join-Path $base ('_ban_cu_' + $moc + '_' + $k)
  }
  try {
    New-Item -ItemType Directory -Path $bak | Out-Null
    foreach ($t in @('src', 'node')) {
      $p = Join-Path $tool $t
      if (Test-Path -LiteralPath $p) { Copy-Item -LiteralPath $p -Destination (Join-Path $bak $t) -Recurse -Force }
    }
    Copy-Item -LiteralPath $pkgCuTep -Destination (Join-Path $bak 'package.json') -Force
  } catch {
    Bao 'LOI: Khong sao luu duoc ban dang chay nen dung lai cho an toan.'
    Bao ''
    Bao '  Thuong la mot trong hai ly do:'
    Bao '   1. Dang co chuong trinh giu file cua tool. Dong het cua so den dang'
    Bao '      chay tool va dong Excel lai, roi bam dup 2_CAP_NHAT.bat lan nua.'
    Bao '   2. O dia day, hoac thu muc  Cau hinh  khong cho ghi.'
    Bao ''
    Bao '  Chua co gi tren may bi thay doi.'
    Bao ('  Chi tiet ky thuat:  ' + $_.Exception.Message)
    $global:CN_MA = 7; return
  }
  $bakTen = Split-Path $bak -Leaf
  Bao ('Da sao luu ban cu vao :  ' + $bakTen)

  try {
    Get-ChildItem -LiteralPath $base -Directory -Filter '_ban_cu_*' |
      Sort-Object Name -Descending |
      Select-Object -Skip 3 |
      ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force -ErrorAction SilentlyContinue }
  } catch { }
  }

  # ---- 6. Chep de. CHI ba thu duoi day, khong hon. ---------------------
  #  Danh sach trang nay la rang buoc quan trong nhat cua ca file.
  #  Khong bao gio dung toi CAU_HINH_VAN_HANH.json va thu muc 1_THA_FILE_XUAT.
  $thuVienCu  = ''
  if (-not $lanDau) { $thuVienCu = KhoaThuVien $pkgCuTep }
  $thuVienMoi = KhoaThuVien $pkgMoiTep
  try {
    ThayThuMuc (Join-Path $goc 'src')  (Join-Path $tool 'src')
    ThayThuMuc (Join-Path $goc 'node') (Join-Path $tool 'node')
    Copy-Item -LiteralPath $pkgMoiTep -Destination $pkgCuTep -Force
  } catch {
    Bao ''
    Bao 'LOI: Khong ghi duoc ma moi vao thu muc bo ma.'
    Bao ''
    Bao '  Thuong la dang co cua so den chay tool, hoac may quet virus giu file.'
    Bao '  Dong het cua so den roi bam dup 2_CAP_NHAT.bat lai.'
    if (-not $lanDau) { Bao ('  Ban cu van con nguyen trong:  ' + $bakTen) }
    Bao ('  Chi tiet ky thuat:  ' + $_.Exception.Message)
    $global:CN_MA = 7; return
  }
  Bao 'Da chep ma moi        :  src, node, package.json'

  # ---- 6b. Ba file .bat kia, va khoa cau hinh moi ----------------------
  #  KHONG chep de chinh minh: Windows khoa file .bat dang chay, ghi de giua
  #  chung la hong phien chay. Khi chinh nut nay can sua thi xin ban dong goi moi.
  $thuMucBat = Join-Path $goc 'bat'
  $BA_NUT = @('1_CAI_DAT_LAN_DAU.bat', '3_TAO_FILE_THANG_MOI.bat', '4_CHAY_TOOL.bat')
  $TEN_TOI = Split-Path $env:CN_TEP -Leaf
  if (Test-Path -LiteralPath $thuMucBat) {
    $daChep = @()
    foreach ($t in $BA_NUT) {
      $tu = Join-Path $thuMucBat $t
      if (Test-Path -LiteralPath $tu) {
        try { Copy-Item -LiteralPath $tu -Destination (Join-Path $thuMucNut $t) -Force; $daChep += $t }
        catch { Bao ('CHU Y: khong ghi duoc  ' + $t + '  (' + $_.Exception.Message + ')') }
      }
    }
    if ($daChep.Count -gt 0) { Bao ('Da chep nut bam        :  ' + ($daChep -join ', ')) }

    # Ban tren kho khac ban dang chay thi CHI NHAC, khong tu ghi de.
    $toiTrenKho = Join-Path $thuMucBat $TEN_TOI
    if (Test-Path -LiteralPath $toiTrenKho) {
      $h1 = (Get-FileHash -LiteralPath $toiTrenKho -Algorithm SHA256).Hash
      $h2 = (Get-FileHash -LiteralPath $env:CN_TEP -Algorithm SHA256).Hash
      if ($h1 -ne $h2) {
        Bao ''
        Bao ('CHU Y: Nut cap nhat co ban moi. Xin ban dong goi moi tu nguoi phu trach.')
      }
    }

    # Khoa cau hinh moi: THEM khoa con thieu, GIU NGUYEN moi gia tri dang co.
    $mauMoi = Join-Path $thuMucBat 'CAU_HINH_VAN_HANH.mau.json'
    if (Test-Path -LiteralPath $mauMoi) {
      try {
        Copy-Item -LiteralPath $mauMoi -Destination (Join-Path $base 'CAU_HINH_VAN_HANH.mau.json') -Force
        $them = GopKhoaThieu $mauMoi $cfgTep
        if ($them.Count -gt 0) { Bao ('Da them khoa cau hinh :  ' + ($them -join ', ')) }
      } catch {
        Bao ('CHU Y: khong gop duoc khoa cau hinh moi (' + $_.Exception.Message + ').')
        Bao '       File cau hinh cua may van nguyen ven, khong bi dung toi.'
      }
    }
  } else {
    # Khong toi duoc day: buoc 4 da chan kho thieu `bat`. Giu lai cho chac.
    Bao 'CHU Y: khong thay thu muc  bat/  trong ban tai ve nen ba nut bam khong duoc cap nhat.'
    Bao '       Ma cua tool van da cap nhat xong binh thuong.'
  }

  # ---- 7. Cai lai thu vien neu package.json doi ------------------------
  if ($lanDau -or ($thuVienCu -ne $thuVienMoi)) {
    Bao ''
    Bao 'Danh sach thu vien co doi. Dang cai lai thu vien, doi mot lat...'
    $npm = $null
    $npmCam = Join-Path $base 'node-portable\npm.cmd'
    if (Test-Path -LiteralPath $npmCam) { $npm = $npmCam }
    if (-not $npm) {
      $c = Get-Command npm -ErrorAction SilentlyContinue
      if ($c) { $npm = $c.Source }
    }
    if (-not $npm) {
      Bao 'CHU Y: Ma da cap nhat xong nhung khong tim thay npm de cai thu vien.'
      Bao '       Bam dup 1_CAI_DAT_LAN_DAU.bat mot lan, roi chay 4_CHAY_TOOL.bat.'
      $global:CN_MA = 8
    } else {
      $maNpm = 1
      Push-Location $tool
      try {
        & $npm install --no-audit --no-fund
        $maNpm = $LASTEXITCODE
      } finally { Pop-Location }
      if ($maNpm -ne 0) {
        Bao ''
        Bao 'CHU Y: Ma da cap nhat xong nhung cai thu vien khong thanh cong.'
        Bao '       Thuong la do mang. Khi co mang, bam dup 1_CAI_DAT_LAN_DAU.bat mot lan.'
        if (-not $lanDau) { Bao ('       Muon quay ve ban cu thi lay tu thu muc  ' + $bakTen) }
        $global:CN_MA = 8
      } else {
        Bao 'Cai thu vien          :  xong'
      }
    }
  }

  GhiMoc
  Bao ''
  Gach
  if ($lanDau) {
    Bao ('  DA CAI XONG LAN DAU.  Ban  ' + $vMoiS)
  } else {
    Bao ('  DA CAP NHAT XONG.  ' + $vCuS + '  ->  ' + $vMoiS)
  }
  Bao '  Cau hinh va thu muc 1_THA_FILE_XUAT khong bi dung toi.'
  if (-not $lanDau) { Bao ('  Ban cu nam trong  ' + $bakTen + '  (may giu 3 ban gan nhat).') }
  Bao '  Gio bam dup 4_CHAY_TOOL.bat, lam viec nhu moi ngay.'
  Gach
  if ($global:CN_MA -ne 8) { $global:CN_MA = 0 }

} catch {
  Bao ''
  Bao 'LOI KHONG DOAN TRUOC. Chua chac ban ma da cap nhat xong hay chua.'
  Bao ''
  Bao ('  Chi tiet ky thuat:  ' + $_.Exception.Message)
  Bao '  Chup man hinh cua so nay gui nguoi phu trach ky thuat.'
  Bao '  Muon quay ve ban cu: mo thu muc  _ban_cu_...  moi nhat trong  Cau hinh  ,'
  Bao '  chep de  src, node, package.json  cua no vao thu muc  keodon-apps-script.'
  $global:CN_MA = 9
} finally {
  if ($tam) {
    if (Test-Path -LiteralPath $tam) {
      try { Remove-Item -LiteralPath $tam -Recurse -Force } catch { }
    }
  }
}
