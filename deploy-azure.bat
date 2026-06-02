@echo off
title AnalytixHub Chatbot - Azure 1-Click Deployer
cls
echo =================================================================
echo        ANALYTIXHUB CHATBOT - AZURE APP SERVICE DEPLOYER
echo =================================================================
echo.
echo This script will automate:
echo  1. Authenticating with Microsoft Azure.
echo  2. Provisioning App Service Plans, Storage Shares and Web Apps.
echo  3. Automating Persistent storage mappings (/home/site/wwwroot/data).
echo  4. Packaging and pushing your latest local code live!
echo.
echo =================================================================
echo.

:: 1. Ask for Web App name
set /p WEBAPP_NAME="Enter a unique name for your Azure Web App (e.g., analytixhub-bot): "
if "%WEBAPP_NAME%"=="" (
    echo [ERROR] Web App name cannot be blank. Exiting...
    pause
    exit /b
)

echo.
echo [1/5] Initiating Azure Authentication...
call az login
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Azure Login failed. Please install Azure CLI first.
    pause
    exit /b
)

echo.
echo [2/5] Creating Azure Resource Group (ah-chatbot-rg in eastus)...
call az group create --name ah-chatbot-rg --location eastus
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Resource Group creation failed.
    pause
    exit /b
)

echo.
echo [3/5] Deploying Infrastructure-as-Code via Bicep...
echo This will take 1-2 minutes. Please stand by...
call az deployment group create --resource-group ah-chatbot-rg --template-file deploy-appservice.bicep --parameters webAppName=%WEBAPP_NAME%
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Infrastructure deployment failed.
    pause
    exit /b
)

echo.
echo [4/5] Packaging local application files (excluding node_modules)...
if exist project.zip del project.zip
powershell -Command "Compress-Archive -Path 'public', 'src', 'data', 'server.js', 'package.json' -DestinationPath 'project.zip' -Force"
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to compile package zip file.
    pause
    exit /b
)

echo.
echo [5/5] Deploying package zip directly to Azure App Service container...
call az webapp deployment source config-zip --resource-group ah-chatbot-rg --name %WEBAPP_NAME% --src project.zip
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Code deployment failed.
    pause
    exit /b
)

echo.
echo =================================================================
echo 🎉 CONGRATULATIONS! DEPLOYMENT COMPLETED SUCCESSFULLY!
echo =================================================================
echo.
echo Your chatbot is now live on Azure!
echo Admin Portal:  https://%WEBAPP_NAME%.azurewebsites.net/admin/admin.html
echo Widget Tester: https://%WEBAPP_NAME%.azurewebsites.net/widget/widget.html
echo.
echo [CLEANUP] Deleting temporary package zip...
if exist project.zip del project.zip
echo Done!
echo =================================================================
pause
