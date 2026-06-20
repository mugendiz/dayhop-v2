#!/bin/bash
# Installs all extensions listed in vscode-extensions.md
# Usage: ./install-extensions.sh

extensions=(
  # AI Coding Assistants
  anthropic.claude-code
  saoudrizwan.claude-dev
  continue.continue
  andrepimenta.claude-code-chat

  # Python Development
  ms-python.python
  ms-python.vscode-pylance
  ms-python.debugpy
  ms-python.vscode-python-envs

  # JavaScript / React
  dbaeumer.vscode-eslint
  rvest.vs-code-prettier-eslint
  xabikos.javascriptsnippets
  equimper.react-native-react-redux

  # Git & Version Control
  eamodio.gitlens

  # Markdown & Documentation
  shd101wyy.markdown-preview-enhanced
  bpruitt-goddard.mermaid-markdown-syntax-highlighting
  mermaidchart.vscode-mermaid-chart

  # Remote Development
  ms-vscode-remote.remote-wsl

  # Preview & Viewing
  ms-vscode.live-server
  jevakallio.vscode-live-frame
  tomoki1207.pdf
  repreng.csv

  # Themes & Icons
  akamud.vscode-theme-onedark
  pkief.material-icon-theme
  vscode-icons-team.vscode-icons

  # Utilities
  mrmlnc.vscode-duplicate
  uctakeoff.vscode-counter
)

for ext in "${extensions[@]}"; do
  code --install-extension "$ext"
done