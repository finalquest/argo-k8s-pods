#!/bin/bash

# === COLORES Y LOGGING ===
RESET="\033[0m"
HEADER="\033[1;95m"
SUCCESS="\033[1;96m"
WARN="\033[1;93m"
ERROR="\033[1;91m"
DEBUG="\033[1;90m"

header() { echo -e "\n${HEADER}$1${RESET}"; }
success() { echo -e "${SUCCESS}✅ $1${RESET}"; }
warn() { echo -e "${WARN}⚠️ $1${RESET}"; }
error() { echo -e "${ERROR}❌ $1${RESET}"; }
debug() { echo -e "${DEBUG}🐛 $1${RESET}"; }

export RESET HEADER SUCCESS WARN ERROR DEBUG
export -f header success warn error debug

