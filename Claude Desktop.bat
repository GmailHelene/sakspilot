@echo off
REM Claude Desktop (Microsoft Store app) launcher
REM Sakspilot Launcher kan ikke aapne UWP-apps direkte - denne wrapperen
REM bruker explorer.exe + shell:AppsFolder for aa starte den.
start "" "explorer.exe" "shell:AppsFolder\Claude_pzs8sxrjxfjjc!Claude"
