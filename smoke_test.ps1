
<#
  Smoke test completo para delivery_api
  Ejecutar desde delivery_api/ con: .\smoke_test.ps1
#>

$base   = "http://localhost:3002/api"
$fakeId = "00000000-0000-0000-0000-000000000099"  # UUID inexistente para tests DENY
$orderId = "d1000000-0000-0000-0000-000000000001" # Orden real en estado 'confirmado'

$results = [System.Collections.Generic.List[PSCustomObject]]::new()
$pass = 0; $fail = 0

function Check($label, $expect, $actual) {
    $ok = if ($expect -is [array]) { $expect -contains $actual } else { $expect -eq $actual }
    $symbol = if ($ok) { "PASS" } else { "FAIL" }
    $script:results.Add([PSCustomObject]@{ Test=$label; Expected=$expect; Got=$actual; Result=$symbol })
    if ($ok) { $script:pass++ } else { $script:fail++ }
}

function Req($method, $path, $token, $body=$null) {
    $url = "$base$path"
    $headers = @{}
    if ($token) { $headers["Authorization"] = "Bearer $token" }
    try {
        $params = @{ Uri=$url; Method=$method; Headers=$headers; ErrorAction='Stop'; UseBasicParsing=$true }
        if ($body) { $params.Body = ($body | ConvertTo-Json -Compress); $params.ContentType = "application/json" }
        $r = Invoke-WebRequest @params
        return [int]$r.StatusCode
    } catch {
        return [int]$_.Exception.Response.StatusCode.value__
    }
}

function Login($email, $pass) {
    try {
        $r = Invoke-RestMethod -Uri "$base/auth/login" -Method POST -ContentType "application/json" `
             -Body "{`"email`":`"$email`",`"password`":`"$pass`"}"
        return $r.accessToken
    } catch { return "" }
}

# ─── AUTH ───────────────────────────────────────────────────────────────────
Write-Host "`n=== AUTH ===" -ForegroundColor Cyan

$sa     = Login "luis@gmail.com"            "luis123"
$admin  = Login "admin.fogon@yayaeats.com"  "admin123"
$rider  = Login "rider1@yayaeats.com"       "rider123"
$client = Login "miguel.torrez@gmail.com"   "client123"

Check "T01 Login superadmin"  $true  ($sa     -ne "")
Check "T02 Login admin"       $true  ($admin  -ne "")
Check "T03 Login rider"       $true  ($rider  -ne "")
Check "T04 Login client"      $true  ($client -ne "")
Check "T05 Login bad creds"   401    (Req "POST" "/auth/login" $null @{email="x@x.com";password="wrong"})

# ─── STATUS ALLOW (orden real: confirmado → preparando → listo → en camino → entregado) ──
Write-Host "`n=== STATUS TRANSITIONS (ALLOW) ===" -ForegroundColor Cyan

Check "T06 admin PUT preparing (confirmado→en_preparacion)" @(200,201)  (Req "PUT" "/orders/$orderId/preparing" $admin)
Check "T07 admin PUT ready (en_preparacion→listo)"          @(200,201)  (Req "PUT" "/orders/$orderId/ready"    $admin)
Check "T08 rider PUT on-the-way (listo→en_camino)"          @(200,201)  (Req "PUT" "/orders/$orderId/on-the-way" $rider)
Check "T09 rider PUT done (en_camino→entregado)"            @(200,201)  (Req "PUT" "/orders/$orderId/done"     $rider)

# ─── STATUS DENY (Casbin 403 antes del DB lookup, UUID fake) ─────────────────
Write-Host "`n=== STATUS TRANSITIONS (DENY - debe 403) ===" -ForegroundColor Cyan

Check "T10 rider PUT preparing → DENY 403"      403  (Req "PUT" "/orders/$fakeId/preparing"  $rider)
Check "T11 admin PUT on-the-way → DENY 403"     403  (Req "PUT" "/orders/$fakeId/on-the-way" $admin)
Check "T12 admin PUT done → DENY 403"           403  (Req "PUT" "/orders/$fakeId/done"        $admin)
Check "T13 admin PUT status (sp-only) → DENY"   403  (Req "PUT" "/orders/$fakeId/status"      $admin)
Check "T14 client PUT status → DENY 403"        403  (Req "PUT" "/orders/$fakeId/status"      $client)
Check "T15 client PUT preparing → DENY 403"     403  (Req "PUT" "/orders/$fakeId/preparing"   $client)
Check "T16 unauthenticated PUT preparing → 401" 401  (Req "PUT" "/orders/$fakeId/preparing"   $null)

# ─── SUPERADMIN puede todo ───────────────────────────────────────────────────
Write-Host "`n=== SUPERADMIN ALLOW ===" -ForegroundColor Cyan

Check "T17 superadmin PUT status (generic, fake uuid→404)" @(404,400)  (Req "PUT" "/orders/$fakeId/status" $sa @{status="confirmado"})
Check "T18 superadmin PUT preparing (fake uuid→404)"       @(404,400)  (Req "PUT" "/orders/$fakeId/preparing" $sa)

# ─── DEPRECATED ENDPOINTS (deben returnar 404) ───────────────────────────────
Write-Host "`n=== DEPRECATED ENDPOINTS (debe 404) ===" -ForegroundColor Cyan

Check "T19 deprecated rider/orders/:id/ready"    404  (Req "PUT" "/rider/orders/$fakeId/ready" $rider)
Check "T20 deprecated payments/order/:id"        404  (Req "POST" "/payments/order/$fakeId"     $sa)
Check "T21 deprecated payments/group/:id"        404  (Req "POST" "/payments/group/$fakeId"     $sa)

# ─── PAYMENT WEBHOOK ─────────────────────────────────────────────────────────
Write-Host "`n=== PAYMENTS ===" -ForegroundColor Cyan

# /payments/confirm no lleva token (es webhook); espera 400 si faltan campos o 200 si pasa
$confirmStatus = Req "POST" "/payments/confirm" $null @{orderId=$fakeId}
Check "T22 POST /payments/confirm existe (no 404)"  $true  ($confirmStatus -ne 404)

# Finance endpoints (superadmin only)
Check "T23 superadmin GET /payments/admin/summary"     @(200,204)  (Req "GET" "/payments/admin/summary" $sa)
Check "T24 admin GET /payments/admin/summary → DENY"   403         (Req "GET" "/payments/admin/summary" $admin)
Check "T25 admin GET /payments/my/income"              @(200,204)  (Req "GET" "/payments/my/income"     $admin)
Check "T26 rider GET /payments/my/income → depends"    @(200,403)  (Req "GET" "/payments/my/income"     $rider)

# ─── RESUMEN ──────────────────────────────────────────────────────────────────
Write-Host "`n=== RESULTADOS ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize

$color = if ($fail -eq 0) { "Green" } else { "Red" }
Write-Host "`nTotal: $($pass+$fail)  PASS: $pass  FAIL: $fail" -ForegroundColor $color

if ($fail -gt 0) { exit 1 } else { exit 0 }
