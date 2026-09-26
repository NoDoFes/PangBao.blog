@echo off
chcp 65001 >nul
title 胖宝网 · 本地服务器

cd /d "%~dp0"

echo ================================
echo   胖宝网 本地服务器启动中...
echo ================================
echo.

REM 优先用 py，没有就用 python
where py >nul 2>nul
if %errorlevel%==0 (
    set PY=py
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        set PY=python
    ) else (
        echo [错误] 没有找到 Python，请先安装 Python。
        echo 下载地址: https://www.python.org/downloads/
        pause
        exit /b
    )
)

REM 延迟 1 秒后自动打开浏览器
start "" cmd /c "timeout /t 1 >nul & start http://localhost:8000/"

echo 服务器地址: http://localhost:8000/
echo 关闭此窗口即可停止服务器。
echo.

%PY% -m http.server 8000
pause