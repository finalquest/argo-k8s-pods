#!/bin/bash

# Script de prueba para simular la ejecución de un test de Appium.

BRANCH=$1
CLIENT=$2
FEATURE=$3

# Desactivar buffering para que los logs salgan línea por línea
export STDBUF_O=0

echo "--- INICIANDO TEST SIMULADO ---"
echo "- Branch: ${BRANCH}"
echo "- Cliente: ${CLIENT}"
echo "- Feature: ${FEATURE}"
echo "---------------------------------"

sleep 1
echo "[1/5] Clonando repositorio..."
sleep 1
echo "OK."

echo "[2/5] Descargando APK..."
sleep 2
echo "OK."

echo "[3/5] Instalando dependencias (yarn install)..."
sleep 3
echo "OK."

echo "[4/5] Ejecutando test de Appium..."
sleep 1
echo "  > Verificando pantalla de login... OK"
sleep 1
echo "  > Realizando transferencia... OK"
sleep 1
echo "  > Validando comprobante... OK"

echo "[5/5] Generando reporte..."
sleep 2
echo "OK."

echo ""
echo "--- TEST FINALIZADO CON ÉXITO ---"
