@echo off
chcp 65001 >nul
REM MySQL测试快速开始脚本 (Windows版)
REM 用法: quick-start-mysql-test.bat

echo ╔══════════════════════════════════════════╗
echo ║  ZSXQScan MySQL测试 - 快速开始           ║
echo ╚══════════════════════════════════════════╝
echo.

REM 检查Node.js是否安装
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ 未检测到Node.js，请先安装Node.js 18+
    pause
    exit /b 1
)

echo ✅ Node.js已安装
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo    版本: %NODE_VERSION%
echo.

REM 检查依赖是否安装
if not exist "node_modules\mysql2" (
    echo 📦 正在安装依赖...
    call npm install
    echo.
)

REM 步骤1: 验证数据库连接
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 1/3: 验证MySQL数据库连接
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
set /p RUN_VERIFY="是否运行数据库连接验证？(y/n): "
if /i "%RUN_VERIFY%"=="y" (
    node verify-mysql-connection.js
    if %errorlevel% neq 0 (
        echo.
        echo ❌ 数据库连接失败，请检查配置后重试
        pause
        exit /b 1
    )
) else (
    echo ⏭️  跳过数据库验证
)
echo.

REM 步骤2: 配置测试星球
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 步骤 2/3: 配置测试星球
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 请选择测试类型：
echo   1^) 单元测试（单个星球）
echo   2^) 完整流程测试（多个星球）
echo.
set /p TEST_TYPE="请输入选择 (1/2): "

if "%TEST_TYPE%"=="1" (
    echo.
    set /p PLANET_ID="请输入星球ID (例如: 48418518458448): "
    
    if "%PLANET_ID%"=="" (
        echo ❌ 星球ID不能为空
        pause
        exit /b 1
    )
    
    echo.
    echo ✅ 已配置星球ID: %PLANET_ID%
    echo.
    echo ⚠️  请手动编辑 tests/testTask-mysql.js 文件
    echo    将 const TEST_GROUP_ID = '' 改为
    echo    const TEST_GROUP_ID = '%PLANET_ID%'
    echo.
    
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo 步骤 3/3: 运行单元测试
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    set /p RUN_TEST="是否开始测试？(y/n): "
    if /i "%RUN_TEST%"=="y" (
        node tests/testTask-mysql.js
    )
    
) else if "%TEST_TYPE%"=="2" (
    echo.
    echo 请输入要测试的星球ID列表（用逗号分隔）：
    echo 例如: 48418518458448,28885884288111
    set /p PLANET_IDS="^> "
    
    if "%PLANET_IDS%"=="" (
        echo ❌ 星球ID不能为空
        pause
        exit /b 1
    )
    
    echo.
    echo ✅ 已配置星球ID列表
    echo.
    echo ⚠️  请手动编辑 tests/testTaskFlow-mysql.js 文件
    echo    修改 const TEST_GROUP_IDS = [...] 配置
    echo.
    
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo 步骤 3/3: 运行完整流程测试
    echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    echo.
    set /p RUN_TEST="是否开始测试？(y/n): "
    if /i "%RUN_TEST%"=="y" (
        node tests/testTaskFlow-mysql.js
    )
    
) else (
    echo ❌ 无效的选择
    pause
    exit /b 1
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🎉 测试完成！
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 📖 查看更多文档:
echo    - MYSQL_TEST_GUIDE.md
echo    - tests/README-MySQL-Test.md
echo.
pause
