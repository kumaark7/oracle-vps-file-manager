@echo off
title Phone Mirror Menu
:menu
cls
echo ============================
echo       PHONE MIRROR MENU
echo ============================
echo.
echo 1. USB Mirror
echo 2. Wireless Mirror
echo 3. Pair Wireless Mirror
echo 4. USB Mirror Rotate Right
echo 5. Wireless Mirror Rotate Right
echo 6. Saved Wireless Devices
echo 7. Exit
echo.
set /p choice=Enter choice: 

if "%choice%"=="1" goto usb
if "%choice%"=="2" goto wireless
if "%choice%"=="3" goto pair
if "%choice%"=="4" goto usb_right
if "%choice%"=="5" goto wireless_right
if "%choice%"=="6" goto saved_wireless
if "%choice%"=="7" goto end

echo.
echo Invalid choice.
pause
goto menu

:usb
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone-mirror.ps1"
pause
goto menu

:wireless
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone-mirror.ps1" -Wireless
pause
goto menu

:pair
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone-mirror.ps1" -PairWireless
pause
goto menu

:usb_right
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone-mirror.ps1" -Rotate Right
pause
goto menu

:wireless_right
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-phone-mirror.ps1" -Wireless -Rotate Right
pause
goto menu

:saved_wireless
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Saved Wireless Devices.ps1"
pause
goto menu

:end
exit
