# 메일 발신용 DNS 레코드가 제대로 들어갔는지 본다. 읽기 전용.
#
#   .\scripts\check-mail-dns.ps1
#   .\scripts\check-mail-dns.ps1 -Domain example.com
#
# 호스트 이름을 외울 필요 없이 후보를 전부 훑는다.
# 구글 DNS(8.8.8.8)에 직접 물어보므로 내 PC 캐시에 속지 않는다.

param(
  [string]$Domain = "typenews.kr"
)

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# 값을 화면에 찍고, 뭔가 찾았으면 $true를 돌려준다.
# (문자열을 return하면 파이프라인에 섞여 호출부에서 다루기 어렵다)
function Probe {
  param([string]$Name, [string]$Type)

  try {
    $records = Resolve-DnsName $Name -Type $Type -Server 8.8.8.8 -ErrorAction Stop
  } catch {
    return $false
  }

  $found = $false
  foreach ($r in $records) {
    if ($r.Type -eq 'TXT') {
      $found = $true
      Write-Host ("    " + ($r.Strings -join ''))
    } elseif ($r.Type -eq 'CNAME') {
      $found = $true
      Write-Host ("    -> " + $r.NameHost) -ForegroundColor DarkCyan
    }
  }
  return $found
}

Write-Host ""
Write-Host "=== 루트 TXT ===" -ForegroundColor Cyan
Write-Host "  $Domain"
$root = Probe $Domain "TXT"
if (-not $root) { Write-Host "    없음" -ForegroundColor Yellow }
Write-Host "  ^ brevo-code 와 hosting-site 가 둘 다 보여야 한다" -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== DMARC ===" -ForegroundColor Cyan
Write-Host "  _dmarc.$Domain"
$dmarc = Probe "_dmarc.$Domain" "TXT"
if (-not $dmarc) { Write-Host "    없음" -ForegroundColor Yellow }
Write-Host "  ^ p=none 으로 시작하는지 확인. p=reject 는 아직 이르다" -ForegroundColor DarkGray

Write-Host ""
Write-Host "=== DKIM ===" -ForegroundColor Cyan
$candidates = @(
  "brevo1._domainkey", "brevo2._domainkey",
  "brevo._domainkey", "mail._domainkey"
)
$dkimCount = 0
foreach ($h in $candidates) {
  $name = "$h.$Domain"
  # CNAME 방식이면 체인을 따라가 마지막 TXT(실제 키)까지 함께 보여준다.
  Write-Host "  $name"
  if (Probe $name "TXT") { $dkimCount += 1 }
  else { Write-Host "    없음" -ForegroundColor DarkGray }
}

Write-Host ""
if ($dkimCount -eq 0) {
  Write-Host "  DKIM 레코드를 찾지 못했다." -ForegroundColor Yellow
  Write-Host "  Brevo 화면의 호스트가 위 후보에 없으면 직접 조회할 것:" -ForegroundColor DarkGray
  Write-Host "    Resolve-DnsName 호스트이름.$Domain -Type CNAME -Server 8.8.8.8" -ForegroundColor DarkGray
} else {
  Write-Host "  값이 여러 줄인 것은 정상이다. CNAME 체인을 따라간 것이라," -ForegroundColor DarkGray
  Write-Host "  마지막에 k=rsa;p=... 실제 키가 나오면 끝까지 연결된 것이다." -ForegroundColor DarkGray
  Write-Host "  값 끝에 .$Domain 이 덧붙어 있으면 CNAME 값의 점을 빠뜨린 것이다." -ForegroundColor DarkGray
}

Write-Host ""
Write-Host "brevo-code / DKIM 1 / DKIM 2 / DMARC 네 개가 보이면 Brevo에서 Verify를 누른다."
Write-Host ""
