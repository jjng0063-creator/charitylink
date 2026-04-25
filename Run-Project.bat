@echo off
TITLE CharityLink Dev Environment
echo Starting CharityLink IDE and Server...

:: Open Visual Studio Code in the current directory
echo [1/3] Opening IDE (VS Code)...
cmd /c code .

:: Wait momentarily to give the server a head start
timeout /t 2 /nobreak > NUL

:: Open default web browser
echo [2/3] Opening Browser...
start http://localhost:3000

:: Start the Vite server
echo [3/3] Starting Vite Dev Server...
npm run dev
