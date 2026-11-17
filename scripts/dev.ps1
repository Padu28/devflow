$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$BackendDir = Join-Path $Root "backend"
$FrontendDir = Join-Path $Root "frontend"
$VenvPython = Join-Path $BackendDir ".venv\Scripts\python.exe"

if (-not (Test-Path $VenvPython)) {
  Write-Host "Creating Python virtual environment..."
  python -m venv (Join-Path $BackendDir ".venv")
  & $VenvPython -m pip install -r (Join-Path $BackendDir "requirements-dev.txt")
}

if (-not (Test-Path (Join-Path $FrontendDir "node_modules"))) {
  Write-Host "Installing frontend dependencies..."
  Push-Location $FrontendDir
  npm install
  Pop-Location
}

Write-Host "Running database migrations & demo seed..."
Push-Location $BackendDir
& $VenvPython -m alembic upgrade head
& $VenvPython -m app.scripts.seed
Pop-Location

Write-Host "Launching Backend (:8000) and Frontend (:5173)..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$BackendDir'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$FrontendDir'; npm run dev"

Start-Sleep -Seconds 3
Start-Process "http://localhost:5173"

