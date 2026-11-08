@echo off
setlocal
cd /d "%~dp0"
echo Context Menu Editor: hands-on test browser
echo A NEW disposable Zen profile will open, with this mod and Define Word.
echo Configure opens automatically. The other tab contains a sample page.
echo Close the TEST browser when finished. Your usual profile is separate.
python -B tools\native-sine-probe.py --launch --interactive --with-define-word --content-page tests\native\sample-page.html --script tests\native\interactive-setup.js
set "cmeTestExit=%errorlevel%"
echo.
echo Test browser exit code: %cmeTestExit%
if not "%cmeTestExit%"=="0" pause
exit /b %cmeTestExit%
