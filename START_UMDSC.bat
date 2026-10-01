@echo off
title UMDSC Dance Class System
cd /d "%~dp0"

echo ========================================================
echo        UMDSC DANCE CLASS SYSTEM - QUICK LAUNCHER
echo ========================================================
echo.
echo  Starting local development server...
echo  Your browser will open automatically at:
echo    http://localhost:5173
echo.
echo  Quick Links:
echo    [1] Home / Calendar: http://localhost:5173
echo    [2] Music Studio:    http://localhost:5173/studio
echo    [3] Admin Events:    http://localhost:5173/admin/events
echo    [4] Admin Media:     http://localhost:5173/admin/media
echo    [5] Admin Members:   http://localhost:5173/admin/members
echo.
echo  Press Ctrl+C to stop the server anytime.
echo ========================================================
echo.

npm run start
pause
