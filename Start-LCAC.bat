@echo off
REM ============================================================
REM   Start LCAC  -  opens Claude Code inside the LCAC website
REM   project so it always has full context (to-do list, events,
REM   CLAUDE.md, everything).
REM
REM   Mom: just double-click the "Start LCAC" icon on the desktop.
REM   (That icon is a shortcut to this file.)
REM ============================================================

title LCAC - Claude
cd /d "%~dp0"

where claude >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Claude Code isn't installed yet, or Windows can't find it.
  echo   Nothing is broken - just text Ben to finish the setup.
  echo.
  pause
  exit /b
)

echo.
echo   Opening your LCAC website project with Claude...
echo   Wait for it to say hello, then just talk in plain English.
echo.

claude
