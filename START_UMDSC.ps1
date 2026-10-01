# UMDSC Dance Class System Quick Launcher
Set-Location -Path $PSScriptRoot

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       UMDSC DANCE CLASS SYSTEM - QUICK LAUNCHER        " -ForegroundColor Yellow
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Starting local development server..." -ForegroundColor Green
Write-Host "Browser will open at: http://localhost:5173" -ForegroundColor White
Write-Host ""
Write-Host "Quick Links:" -ForegroundColor Magenta
Write-Host "  - Home / Calendar: http://localhost:5173"
Write-Host "  - Music Studio:    http://localhost:5173/studio"
Write-Host "  - Admin Events:    http://localhost:5173/admin/events"
Write-Host "  - Admin Media:     http://localhost:5173/admin/media"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server anytime." -ForegroundColor DarkGray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

npm run start
