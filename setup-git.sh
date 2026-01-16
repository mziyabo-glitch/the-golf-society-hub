#!/bin/bash
# Git Setup Script for Golf Society Pro

echo "Setting up Git repository..."

# 1. Initialize git if not already initialized
if [ ! -d .git ]; then
    echo "Initializing git repository..."
    git init
else
    echo "Git repository already initialized."
fi

# 2. Check current branch and rename to main if needed
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
if [ -z "$CURRENT_BRANCH" ]; then
    echo "Creating main branch..."
    git checkout -b main
elif [ "$CURRENT_BRANCH" != "main" ]; then
    echo "Renaming branch from $CURRENT_BRANCH to main..."
    git branch -M main
else
    echo "Already on main branch."
fi

# 3. Add all files (gitignore will exclude node_modules, etc.)
echo "Staging all files..."
git add .

# 4. Create commit
echo "Creating commit..."
git commit -m "Initial MVP: societies, events, members with local persistence"

# 5. Remove existing origin if it exists, then add new remote
echo "Setting up remote repository..."
git remote remove origin 2>/dev/null
git remote add origin https://github.com/mziyabo-glitch/The-Golf-Society-Hub.git

# 6. Push to remote
echo "Pushing to remote repository..."
echo "Note: You may need to authenticate with GitHub."
git push -u origin main

echo ""
echo "Git setup complete!"
echo "Repository: https://github.com/mziyabo-glitch/The-Golf-Society-Hub.git"

