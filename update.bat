@echo off
chcp 65001 >nul
cd /d "%~dp0"
py scripts\fetch_news.py
echo.
echo 완료되었습니다. index.html 을 새로고침하세요.
pause
