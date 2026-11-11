@echo off
cd /d "%~dp0"
if not exist node_modules\@garmin\fitsdk\package.json goto install
if not exist node_modules\leaflet\package.json goto install
goto run

:install
(
  where pnpm.cmd >nul 2>nul
  if not errorlevel 1 (
    call pnpm.cmd install --frozen-lockfile
  ) else (
    call npm.cmd install
  )
  if errorlevel 1 (
    echo Dependency installation failed. Install Node.js 24 and pnpm or npm.
    pause
    exit /b 1
  )
)
:run
node --env-file-if-exists=.env server.mjs
pause
