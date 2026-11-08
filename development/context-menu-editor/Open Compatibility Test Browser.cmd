@echo off
setlocal
cd /d "%~dp0"
echo Context Menu Editor: compatibility test browser
echo A NEW disposable Zen profile will open with the eight local mod candidates.
echo Configure opens automatically. The other tab contains a local sample website.
echo You can change any of these test mods' settings inside this disposable browser.
echo Close the TEST browser when finished. Your usual profile is separate.
python -B tools\native-sine-probe.py --launch --interactive --with-local-mods --with-define-word --content-page tests\native\sample-page.html --content-http --script tests\native\interactive-setup.js
set "cmeTestExit=%errorlevel%"
echo.
echo Test browser exit code: %cmeTestExit%
if not "%cmeTestExit%"=="0" pause
exit /b %cmeTestExit%
