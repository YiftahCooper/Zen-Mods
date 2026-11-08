@echo off
setlocal
cd /d "%~dp0"
echo Context Menu Editor: disposable Zen tests
echo This is an AUTOMATED test suite. It closes each browser after checking it.
echo For hands-on testing, use Open Disposable Test Browser.cmd instead.
echo Each check uses a new profile under this mod's .backup-scratch folder.
echo The test launcher closes only the Zen process it starts.
python tools\run-native-tests.py
set "cmeTestExit=%errorlevel%"
echo.
echo Test launcher exit code: %cmeTestExit%
pause
exit /b %cmeTestExit%
