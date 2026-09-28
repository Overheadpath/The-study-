@echo off
rem Beanie AI launcher: double-click this file.
rem The first time it downloads its own Python and video tools into the .python folder here.
setlocal
title Beanie AI
cd /d "%~dp0"

set "PYDIR=%~dp0.python"
set "PY=%PYDIR%\python.exe"
set "PYVER=3.12.10"
set "BEANIE_BAT=%~f0"
set "BEANIE_DIR=%~dp0"
if not exist "%PYDIR%" mkdir "%PYDIR%"

if defined BEANIE_PYTHON set "PY=%BEANIE_PYTHON%"
if exist "%PY%" goto have_python

echo.
echo   Setting up Beanie AI for the first time...
echo   This downloads about 60 MB and takes a minute or two. It only happens once.
echo.
echo   [1/3] Getting Python (what Beanie AI is written in)...
curl.exe -L -# -f -o "%PYDIR%\python.zip" "https://www.python.org/ftp/python/%PYVER%/python-%PYVER%-embed-amd64.zip"
if errorlevel 1 goto fail_download
tar.exe -xf "%PYDIR%\python.zip" -C "%PYDIR%"
if errorlevel 1 goto fail_download
del "%PYDIR%\python.zip"
rem Let this Python find installed packages (import site) and Beanie AI itself (..)
> "%PYDIR%\python312._pth" (
  echo python312.zip
  echo .
  echo ..
  echo import site
)
echo   [2/3] Getting the Python package installer...
curl.exe -L -s -f -o "%PYDIR%\get-pip.py" "https://bootstrap.pypa.io/get-pip.py"
if errorlevel 1 goto fail_download
"%PY%" "%PYDIR%\get-pip.py" --no-warn-script-location -q
if errorlevel 1 goto fail_download
del "%PYDIR%\get-pip.py"

:have_python
rem Install what Beanie AI needs, again whenever requirements.txt changes.
fc /b "requirements.txt" "%PYDIR%\installed.txt" >nul 2>nul
if not errorlevel 1 goto shortcut
echo   [3/3] Getting the video tools (ffmpeg)...
"%PY%" -m pip install --disable-pip-version-check --no-warn-script-location -q -r requirements.txt
if errorlevel 1 goto fail_download
copy /y "requirements.txt" "%PYDIR%\installed.txt" >nul

:shortcut
if defined BEANIE_NO_SHORTCUT goto run
if exist "%PYDIR%\asked-shortcut.txt" goto run
echo asked> "%PYDIR%\asked-shortcut.txt"
echo.
choice /c YN /n /m "  Put a Beanie AI shortcut on your Desktop? [Y/N] "
if errorlevel 2 goto run
powershell -NoProfile -ExecutionPolicy Bypass -Command "$s = (New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\Beanie AI.lnk'); $s.TargetPath = $env:BEANIE_BAT; $s.WorkingDirectory = $env:BEANIE_DIR; $s.IconLocation = $env:BEANIE_DIR + 'beanie.ico'; $s.Save()"
if not errorlevel 1 echo   Done! Next time just double-click "Beanie AI" on your Desktop.

:run
"%PY%" -m beanie_ai %*
if errorlevel 1 goto fail_run
exit /b 0

:fail_download
echo.
echo   Something went wrong while downloading. Check your internet connection and try again.
echo   If it keeps happening, delete the ".python" folder next to this file and try again.
echo.
pause
exit /b 1

:fail_run
echo.
echo   Beanie AI stopped because of a problem (see the message above).
echo.
pause
exit /b 1
