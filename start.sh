#!/bin/bash

# Script de inicialização para DESENVOLVIMENTO LOCAL.
# NÃO use em produção/container: o pkill abaixo mata TODOS os processos Node da
# máquina (e, dentro de um container, o próprio PID 1). Em produção o start é
# o `CMD ["node","index.js"]` do Dockerfile.

echo "🧹 Parando processos Node existentes..."
pkill -9 node 2>/dev/null
pkill -9 nodemon 2>/dev/null
sleep 1

echo "✅ Pronto!"
echo "🚀 Iniciando servidor webhook da IA Imperial Bonés..."
echo ""

node index.js
