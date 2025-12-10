@echo off
REM Combined Dispatch DB Startup Script (Batch version)
REM This calls the PowerShell script with the same functionality

powershell -ExecutionPolicy Bypass -File "%~dp0start.ps1"

