@echo off
setlocal
chcp 65001 >nul
set "SILOLINK_CODEX="
for %%C in (codex.exe) do set "SILOLINK_CODEX=%%~$PATH:C"
if not defined SILOLINK_CODEX if exist "%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe" set "SILOLINK_CODEX=%LOCALAPPDATA%\Programs\OpenAI\Codex\bin\codex.exe"
if not defined SILOLINK_CODEX goto missing
echo SiloLink 체험판을 Codex의 설치 목록에 추가합니다.
"%SILOLINK_CODEX%" plugin marketplace add "%~dp0." --json
if errorlevel 1 goto failed
echo.
echo 등록했습니다. Codex를 완전히 종료한 뒤 다시 열어 주세요.
echo 설정 - 플러그인 - 디렉터리 찾아보기에서 SiloLink 체험을 선택하고 설치하세요.
echo 이 폴더는 설치 목록의 원본입니다. 사용 중에는 삭제하거나 옮기지 마세요.
pause
exit /b 0
:missing
echo Codex 실행 파일을 찾지 못했습니다. Codex 데스크톱 앱 설치를 먼저 확인해 주세요.
pause
exit /b 1
:failed
echo.
echo 등록하지 못했습니다. 위 오류를 확인하고 Codex를 최신 버전으로 업데이트한 뒤 다시 시도해 주세요.
pause
exit /b 1
