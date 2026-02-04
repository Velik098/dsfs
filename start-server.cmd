@echo off
setlocal
cd /d "%~dp0"
echo.
echo Moneyway: запуск сервера...
echo Если окно закроется с ошибкой — пришлите текст из этого окна.
echo.
node server.js
echo.
echo Сервер остановлен. Нажмите любую клавишу.
pause >nul

