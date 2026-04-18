/**
 * 全接口本地测试 v3 - 使用 zsxqApi.js 的真实请求方法
 */
process.env.DB_HOST = 'sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT = '22871';
process.env.DB_USER = 'zsxq_scan_dbuser';
process.env.DB_PASSWORD = 'zsxq@123';
process.env.DB_NAME = 'temu-tools-prod-3g8yeywsda972fae';

const { init } = require('./db-mysql');
const db = init();
const config = db.collection('config');
const tasks = db.collection('tasks');
const zsxqApi = require('./functions/zsxqApi');

async function test(name, fn, timeoutMs = 15000) {
  console.log(`\n${'='.repeat(55)}`);
  console.log(`  ${name}`);
  console.log(`${'='.repeat(55)}`);
  try {
    const p = fn();
    const timer = new Promise((_, rej) => setTimeout(() => rej(new Error(`⏰ 超时(${timeoutMs}ms)`)), timeoutMs));
    const result = await Promise.race([p, timer]);
    const str = JSON.stringify(result);
    console.log(str.length > 800 ? str.substring(0,800)+'\n...截断' : str);
    return result;
  } catch(e) {
    console.log(`❌ ${e.message}`);
    return null;
  }
}

(async () => {

// ==================== 1. Health ====================
await test('1. GET /api/health', () => ({
  code:0, message:'ok', env:'mysql', timestamp:new Date().toISOString()
}));

// ==================== 2. Debug DB ====================
await test('2. GET /api/debug/db', async () => {
  const cfg = await config.get();
  const tsk = await tasks.limit(8).get();
  return {
    configCount: cfg.data?.length||0,
    config: cfg.data?.map(d=>({id:d.id,val:String(d.value).substring(0,40)})),
    taskCount: tsk.data?.length||0,
    tasks: tsk.data?.map(t=>({id:t.id,pid:t.planetId,s:t.status,t:t.topicCreateTime}))
  };
});

// ==================== 3. Login checkStatus ====================
await test('3. POST /api/login (checkStatus)', async () => {
  const doc = await config.doc('zsxq_cookie').get();
  let c = doc.data?.value||'';
  if(typeof c==='string'){try{c=JSON.parse(c);c=c.value||c;}catch(e){}}
  if(typeof c==='object')c=c.value||null;
  return {hasEnvCookie:false, hasStoredCookie:!!c, valid:typeof c==='string'&&c.includes('_c_'), len:c?.length};
});

// ==================== 4. Monitor (pub-api 无需认证) ====================
await test('4. POST /api/monitor', async () => {
  let urlsDoc = await config.doc('monitorUrls').get();
  let urls = urlsDoc.data?.value;
  if(typeof urls==='string')try{urls=JSON.parse(urls);}catch(e){}
  if(!Array.isArray(urls))return{code:0,msg:'无监控列表',data:[]};

  const results=[];
  for(const url of urls){
    const m=url.match(/\/group\/(\d+)/);
    const gid=m?m[1]:null;if(!gid)continue;

    try{
      // 用 pub-api（公开接口无需认证）
      const d=await zsxqApi.getGroupPublicInfo(gid);
      const g=d?.resp_data?.group;
      const lt=g?.latest_topic_create_time;
      
      if(!g){results.push({gid,err:'无数据'});continue;}

      // 去重
      const ex=await tasks.where({planetId:gid,topicCreateTime:String(lt)}).limit(1).get();
      const dup=!!(ex.data&&ex.data.length>0);

      let taskId=null;
      if(!dup&&lt){
        const r=await tasks.add({data:{
          planetId:gid,planetName:g.name,planetUrl:url,status:'pending',
          topicCreateTime:String(lt),article:'',createdAt:new Date(),updatedAt:new Date()
        }});
        taskId=r.id;
      }

      results.push({
        groupId:gid,name:g.name,hasUpdate:!dup,
        members:g.statistics?.members?.count,
        topics:g.statistics?.topics?.topics_count,
        latestTime:lt,skipped:dup,taskId
      });

    }catch(e){results.push({gid,err:e.message.substring(0,80)});}
  }
  return{code:0,msg:'完成',data:results};
},20000);

// ==================== 5. Task Pull (api.zsxq.com 需要cookie+签名) ====================
await test('5. POST /api/task (拉取文章)', async () => {
  const pending=await tasks.where({status:'pending'}).get();
  if(!pending.data?.length)return{code:0,msg:'无待处理任务',n:0};

  console.log(`  发现 ${pending.data.length} 条 pending 任务:`);
  pending.data.forEach(t=>console.log(`    id=${t.id} pid=${t.planetId} name="${t.planetName}" topicTime=${t.topicCreateTime||'-'}`));

  // 读 cookie
  const cookieDoc=await config.doc('zsxq_cookie').get();
  let cookie=cookieDoc.data?.value||'';
  if(typeof cookie==='string'){try{cookie=JSON.parse(cookie);cookie=cookie.value||cookie;}catch(e){}}
  
  console.log(`  Cookie 类型:${typeof cookie} 长度:${String(cookie).length}`);

  const results=[];
  const seen=new Set();

  for(const t of pending.data){
    const key=t.planetId;
    if(!key){console.log(`  [${t.id}] 跳过: 无 planetId`);continue;}
    if(seen.has(key)){console.log(`  [${t.id}] 跳过: ${key} 已处理`);continue;}
    seen.add(key);

    console.log(`\n  ── 处理 planetId=${key} (taskId=${t.id}) ──`);
    
    try{
      // ★ 使用 zsxqApi.getTopics() — 自动处理签名、headers、cookie
      console.log(`  调用 zsxqApi.getTopics(${key}, {count:1}) ...`);
      const apiResult = await zsxqApi.getTopics(key, { count: 1 });
      
      // 打印原始 API 响应
      console.log(`  原始响应类型: ${typeof apiResult}`);
      console.log(`  原始响应 keys: [${Object.keys(apiResult).join(', ')}]`);
      
      // 检查特殊返回值
      if(apiResult._rateLimited){
        console.log(`  ⚠️ 被频率限制: ${apiResult._rateReason}`);
        results.push({key,taskId:t.id,status:'limited',reason:apiResult._rateReason});
        continue;
      }
      if(apiResult._needAuth){
        console.log(`  ⚠️ 需要登录态 statusCode=${apiResult.statusCode}`);
        results.push({key,taskId:t.id,status:'needAuth'});
        continue;
      }

      // 正常数据
      const topics=apiResult?.data;
      console.log(`  data 是数组? ${Array.isArray(topics)} 长度=${topics?.length||0}`);

      if(Array.isArray(topics)&&topics.length>0){
        const topic=topics[0];
        console.log(`  ✅ topic id=${topic.id} type=${topic.type} name="${topic.name}" createTime=${topic.createTime}`);
        
        // 更新任务为 completed
        const pool=require('./db-mysql').initPool();
        const conn=await pool.getConnection();
        try{
          await conn.query(
            "UPDATE tasks SET status='completed', article=?, articleTitle=?, articleLength=?, updatedAt=? WHERE id=?",
            [JSON.stringify(topic),topic.name||'',(topic.text||'').length,new Date(),t.id]
          );
          console.log(`  ✅ 任务更新为 completed`);
        }finally{conn.release();}

        results.push({key,taskId:t.id,status:'success',title:topic.name?.substring(0,40),topicId:topic.id,textLen:(topic.text||'').length});
      }else{
        console.log(`  ❌ data 数组为空或不存在`);
        console.log(`  完整响应预览: ${JSON.stringify(apiResult).substring(0,500)}`);
        results.push({key,taskId:t.id,status:'failed',err:'无帖子数据',rawPreview:JSON.stringify(apiResult).substring(0,300)});
      }

    }catch(e){
      console.log(`  ❌ 异常: ${e.stack?.substring(0,300)||e.message}`);
      results.push({key,taskId:t.id,status:'failed',err:e.message});
    }
  }

  console.log(`\n  Task 结果汇总:`);
  results.forEach(r=>{
    const icon=r.status==='success'?'✅':r.status==='limited'?'🔒':'❌';
    console.log(`  ${icon} ${r.key} | ${r.title||r.err||r.reason}`);
  });

  return{code:0,msg:'完成',n:results.length,data:results};
},45000);

// ==================== 6. 最终汇总 ====================
console.log(`\n${'='.repeat(55)}`);
console.log('  最终 tasks 表状态');
console.log(`${'='.repeat(55)}`);
const all=await tasks.get();
console.log(`共 ${all.data?.length} 条:`);
(all.data||[]).forEach(t=>console.log(
  `  [${t.status}] ${t.planetId||'-'} | ${t.planetName?.padEnd(12)||''.padEnd(12)} | ${t.topicCreateTime?.padEnd(28)||''.padEnd(28)} | ${(t.articleTitle||'-').substring(0,25)}`
));

console.log('\n🏁 全部接口测试完成！');
})().catch(e=>console.error('FATAL:',e));
