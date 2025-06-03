#!/bin/bash

# Try to source profile to get node version manager setup
if [ -f "$HOME/.bashrc" ]; then
  source "$HOME/.bashrc" > /dev/null 2>&1
elif [ -f "$HOME/.bash_profile" ]; then
  source "$HOME/.bash_profile" > /dev/null 2>&1
fi

# For NVM users
if [ -f "$HOME/.nvm/nvm.sh" ]; then
  source "$HOME/.nvm/nvm.sh" > /dev/null 2>&1
fi

# For Volta users (fallback if not in PATH already)
if [ -d "$HOME/.volta/bin" ]; then
  export PATH="$HOME/.volta/bin:$PATH"
fi

# Get script location and navigate to project root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$( cd "$SCRIPT_DIR/" && pwd )"
cd "$PROJECT_ROOT"

# Install the package globally
npm install @valstro/markdown-rules-mcp@latest -g --silent

# Run the package with the correct bin name
MARKDOWN_INCLUDE="./docs/**/*.md" markdown-rules-mcp
