# Start Ollama with GPU-first settings for the Stack Kings web app (Windows).
# Usage (from repo root): .\scripts\start-ollama-gpu.ps1
#
# Requires: NVIDIA GPU drivers + Ollama installed (https://ollama.com)
# gemma4:e4b needs ~10 GB VRAM for full GPU offload — check with: ollama ps

$ErrorActionPreference = "Stop"

$env:OLLAMA_ORIGINS = "http://localhost:3000"
# Server-side cap on GPU layers (pairs with app request option num_gpu=999)
$env:OLLAMA_NUM_GPU_LAYERS = "9999"
$env:OLLAMA_FLASH_ATTENTION = "1"
$env:OLLAMA_KEEP_ALIVE = "10m"

Write-Host "Starting Ollama (GPU-first) ..."
Write-Host "  OLLAMA_ORIGINS=$($env:OLLAMA_ORIGINS)"
Write-Host "  OLLAMA_NUM_GPU_LAYERS=$($env:OLLAMA_NUM_GPU_LAYERS)"
Write-Host "  OLLAMA_FLASH_ATTENTION=$($env:OLLAMA_FLASH_ATTENTION)"
Write-Host ""
Write-Host "After serve starts, verify GPU offload: ollama ps"
Write-Host "  (expect high GPU%% when VRAM fits the model; gemma4:e4b ~9.6 GB)"
Write-Host ""

ollama serve
