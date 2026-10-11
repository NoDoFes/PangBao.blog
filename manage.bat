@echo off
chcp 65001 >nul
title 胖宝基地 · 内容管理

cd /d "%~dp0"

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

%PY% manage.py
pause