@echo off
title AnalytixHub AI Chatbot Launcher
echo ====================================================
echo    ANALYTIXHUB ENTERPRISE AI CHATBOT SYSTEM
echo ====================================================
echo.
echo [1/2] Launching your web browser to the Control Panel...
start http://localhost:3000/admin
echo.
echo [2/2] Starting the AI Chatbot backend server...
echo (Please keep this window open while using the chatbot)
echo.
npm start
if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] Failed to start server. Please ensure Node.js is installed.
    pause
)
