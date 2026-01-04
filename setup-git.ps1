# Git Setup Script for Golf Society Pro
# Run this script after installing Git for Windows

Write-Host "Setting up Git repository..." -ForegroundColor Green

# 1. Initialize git if not already initialized
if (-not (Test-Path .git)) {
    Write-Host "Initializing git repository..." -ForegroundColor Yellow
    git init
} else {
    Write-Host "Git repository already initialized." -ForegroundColor Yellow
}

# 2. Check current branch and rename to main if needed
$currentBranch = git branch --show-current 2>$null
if ($currentBranch -and $currentBranch -ne "main") {
    Write-Host "Renaming branch from $currentBranch to main..." -ForegroundColor Yellow
    git branch -M main
} elseif (-not $currentBranch) {
    Write-Host "Creating main branch..." -ForegroundColor Yellow
    git checkout -b main
} else {
    Write-Host "Already on main branch." -ForegroundColor Yellow
}

# 3. Add all files (gitignore will exclude node_modules, etc.)
Write-Host "Staging all files..." -ForegroundColor Yellow
git add .

# 4. Create commit
Write-Host "Creating commit..." -ForegroundColor Yellow
git commit -m "Initial MVP: societies, events, members with local persistence"

# 5. Remove existing origin if it exists, then add new remote
Write-Host "Setting up remote repository..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin https://github.com/mziyabo-glitch/The-Golf-Society-Hub.git

# 6. Push to remote
Write-Host "Pushing to remote repository..." -ForegroundColor Yellow
Write-Host "Note: You may need to authenticate with GitHub." -ForegroundColor Cyan
git push -u origin main

Write-Host "`nGit setup complete!" -ForegroundColor Green
Write-Host "Repository: https://github.com/mziyabo-glitch/The-Golf-Society-Hub.git" -ForegroundColor Cyan

