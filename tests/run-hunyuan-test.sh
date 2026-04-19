#!/bin/bash

# 混元洗稿功能完整测试脚本
# 使用方法: ./tests/run-hunyuan-test.sh YOUR_API_KEY

if [ -z "$1" ]; then
    echo "用法: $0 <HUNYUAN_API_KEY>"
    echo ""
    echo "示例:"
    echo "  $0 sk-xxxxxxxxxxxxx"
    echo ""
    echo "或者先设置环境变量:"
    echo "  export HUNYUAN_API_KEY=sk-xxxxxxxxxxxxx"
    echo "  $0"
    exit 1
fi

export HUNYUAN_API_KEY="$1"

echo "======================================"
echo "  混元大模型洗稿功能完整测试"
echo "======================================"
echo ""
echo "API Key: ${HUNYUAN_API_KEY:0:10}..."
echo ""

node tests/testHunyuanRewriter.js
