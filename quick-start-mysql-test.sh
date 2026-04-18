#!/bin/bash

# MySQL测试快速开始脚本
# 用法: ./quick-start-mysql-test.sh

echo "╔══════════════════════════════════════════╗"
echo "║  ZSXQScan MySQL测试 - 快速开始           ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# 检查Node.js是否安装
if ! command -v node &> /dev/null; then
    echo "❌ 未检测到Node.js，请先安装Node.js 18+"
    exit 1
fi

echo "✅ Node.js版本: $(node --version)"
echo ""

# 检查依赖是否安装
if [ ! -d "node_modules/mysql2" ]; then
    echo "📦 正在安装依赖..."
    npm install
    echo ""
fi

# 步骤1: 验证数据库连接
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 1/3: 验证MySQL数据库连接"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "是否运行数据库连接验证？(y/n) " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
    node verify-mysql-connection.js
    if [ $? -ne 0 ]; then
        echo ""
        echo "❌ 数据库连接失败，请检查配置后重试"
        exit 1
    fi
else
    echo "⏭️  跳过数据库验证"
fi
echo ""

# 步骤2: 配置测试星球
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "步骤 2/3: 配置测试星球"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "请选择测试类型："
echo "  1) 单元测试（单个星球）"
echo "  2) 完整流程测试（多个星球）"
echo ""
read -p "请输入选择 (1/2): " test_type

if [ "$test_type" = "1" ]; then
    echo ""
    read -p "请输入星球ID (例如: 48418518458448): " planet_id
    
    if [ -z "$planet_id" ]; then
        echo "❌ 星球ID不能为空"
        exit 1
    fi
    
    # 更新测试文件中的配置
    sed -i.bak "s/const TEST_GROUP_ID = '';/const TEST_GROUP_ID = '$planet_id';/" tests/testTask-mysql.js
    rm -f tests/testTask-mysql.js.bak
    
    echo ""
    echo "✅ 已配置星球ID: $planet_id"
    echo ""
    
    # 检查Cookie
    if ! grep -q "ZSXQ_COOKIE=" .env 2>/dev/null || grep -q "ZSXQ_COOKIE=$" .env 2>/dev/null; then
        echo "⚠️  检测到ZSXQ_COOKIE未配置或为空"
        echo ""
        read -p "是否现在设置Cookie？(y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "请输入Cookie字符串: " cookie
            if grep -q "ZSXQ_COOKIE=" .env 2>/dev/null; then
                sed -i.bak "s/ZSXQ_COOKIE=.*/ZSXQ_COOKIE=$cookie/" .env
            else
                echo "ZSXQ_COOKIE=$cookie" >> .env
            fi
            rm -f .env.bak
            echo "✅ Cookie已保存"
        else
            echo "⚠️  请手动在.env文件中配置ZSXQ_COOKIE"
        fi
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "步骤 3/3: 运行单元测试"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "是否开始测试？(y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node tests/testTask-mysql.js
    fi
    
elif [ "$test_type" = "2" ]; then
    echo ""
    echo "请输入要测试的星球ID列表（用逗号分隔）："
    echo "例如: 48418518458448,28885884288111"
    read -p "> " planet_ids
    
    if [ -z "$planet_ids" ]; then
        echo "❌ 星球ID不能为空"
        exit 1
    fi
    
    # 转换为数组格式
    IFS=',' read -ra IDS <<< "$planet_ids"
    
    # 更新测试文件中的配置
    array_str=$(printf ", '%s'" "${IDS[@]}")
    array_str="[${array_str:2}]"
    
    # 创建临时配置文件
    cat > tests/testTaskFlow-mysql.config.tmp << EOF
const TEST_GROUP_IDS = $array_str;
EOF
    
    echo ""
    echo "✅ 已配置 ${#IDS[@]} 个星球"
    echo ""
    
    # 检查Cookie
    if ! grep -q "ZSXQ_COOKIE=" .env 2>/dev/null || grep -q "ZSXQ_COOKIE=$" .env 2>/dev/null; then
        echo "⚠️  检测到ZSXQ_COOKIE未配置或为空"
        echo ""
        read -p "是否现在设置Cookie？(y/n) " -n 1 -r
        echo ""
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            read -p "请输入Cookie字符串: " cookie
            if grep -q "ZSXQ_COOKIE=" .env 2>/dev/null; then
                sed -i.bak "s/ZSXQ_COOKIE=.*/ZSXQ_COOKIE=$cookie/" .env
            else
                echo "ZSXQ_COOKIE=$cookie" >> .env
            fi
            rm -f .env.bak
            echo "✅ Cookie已保存"
        else
            echo "⚠️  请手动在.env文件中配置ZSXQ_COOKIE"
        fi
    fi
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "步骤 3/3: 运行完整流程测试"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    read -p "是否开始测试？(y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        node tests/testTaskFlow-mysql.js
    fi
    
else
    echo "❌ 无效的选择"
    exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎉 测试完成！"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📖 查看更多文档:"
echo "   - MYSQL_TEST_GUIDE.md"
echo "   - tests/README-MySQL-Test.md"
echo ""
