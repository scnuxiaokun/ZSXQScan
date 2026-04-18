/**
 * 快速测试 - 只测 DB + pub-api (Monitor)，不测需要签名的 Task
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

(async () => {
  console.log('=== 1. Health ===');
  console.log(JSON.stringify({ code:0, env:'mysql', time:new Date().toISOString() }));

  console.log('\n=== 2. Debug DB ===');
  const cfg = await config.get();
  const tsk = await tasks.limit(5).get();
  console.log(`config: ${cfg.data?.length}条`);
  cfg.data?.forEach(d=>console.log(`  ${d.id}: ${String(d.value).substring(0,50)}`));
  console.log(`tasks: ${tsk.data?.length}条`);
  tsk.data?.forEach(t=>console.log(`  [${t.status}] ${t.planetId} | ${t.planetName}`));

  console.log('\n=== 3. Login ===');
  const doc = await config.doc('zsxq_cookie').get();
  let c=doc.data?.value||'';
  if(typeof c==='string')try{c=JSON.parse(c);c=c.value||c;}catch(e){}
  if(typeof c==='object')c=c.value||null;
  console.log({hasStoredCookie:!!c, valid:typeof c==='string'&&c.includes('_c_'), len:c?.length});

  console.log('\n=== 4. Monitor (pub-api) ===');
  let urlsDoc = await config.doc('monitorUrls').get();
  let urls = urlsDoc.data?.value;
  if(typeof urls==='string')try{urls=JSON.parse(urls);}catch(e){}
  
  for(const url of (urls||[])){
    const m=url.match(/\/group\/(\d+)/);
    const gid=m?m[1]:null;
    if(!gid)continue;
    try{
      const d = await zsxqApi.getGroupPublicInfo(gid);
      const g=d?.resp_data?.group;
      const lt=g?.latest_topic_create_time;
      // 去重
      const ex=await tasks.where({planetId:gid,topicCreateTime:String(lt)}).limit(1).get();
      const dup=!!(ex.data&&ex.data.length>0);
      let taskId=null;
      if(!dup && lt){
        const r=await tasks.add({data:{planetId:gid,planetName:g.name,planetUrl:url,status:'pending',topicCreateTime:String(lt),article:'',createdAt:new Date(),updatedAt:new Date()}});
        taskId=r.id;
      }
      console.log(`${gid} "${g.name}" update=!dup members=${g.statistics?.members?.count} latest=${lt} skipped=${dup} taskId=${taskId}`);
    }catch(e){console.log(`${gid} ERR: ${e.message.substring(0,80)}`);}
  }

  console.log('\n=== 5. Task (api.zsxq.com 需签名) ===');
  const pending=await tasks.where({status:'pending'}).get();
  console.log(`pending: ${pending.data?.length}条`);
  
  let cookie=doc.data?.value||'';
  if(typeof cookie==='string')try{cookie=JSON.parse(cookie);cookie=cookie.value||cookie;}catch(e){}
  
  for(const t of (pending.data||[])){
    console.log(`\n处理 planetId=${t.planetId} id=${t.id}`);
    try{
      console.log(`  调用 getTopics(${t.planetId})...`);
      const apiResult = await zsxqApi.getTopics(t.planetId, {count:1});
      
      console.log(`  响应keys: [${Object.keys(apiResult).join(', ')}]`);
      if(apiResult._rateLimited){console.log(`  🔒 限流: ${apiResult._rateReason}`);continue;}
      if(apiResult._needAuth){console.log(`  🔒 需登录`);continue;}
      
      const topics=apiResult?.data;
      console.log(`  data类型=${typeof topics} 是数组?${Array.isArray(topics)} len=${topics?.length}`);
      
      if(Array.isArray(topics)&&topics.length>0){
        const topic=topics[0];
        console.log(`  ✅ topic="${topic.name}" type=${topic.type} textLen=${(topic.text||'').length}`);
        
        const pool=require('./db-mysql').initPool();
        const conn=await pool.getConnection();
        await conn.query("UPDATE tasks SET status='completed', article=?, articleTitle=?, articleLength=?, updatedAt=? WHERE id=?", 
          [JSON.stringify(topic),topic.name||'',(topic.text||'').length,new Date(),t.id]);
        conn.release();
        console.log(`  ✅ 已更新为completed`);
      }else{
        console.log(`  ❌ 无数据, 完整响应: ${JSON.stringify(apiResult).substring(0,400)}`);
      }
    }catch(e){
      console.log(`  ❌ ${e.stack?.substring(0,200)||e.message}`);
    }
  }

  console.log('\n=== 最终 tasks 表 ===');
  const all=await tasks.get();
  console.log(`共 ${all.data?.length}条:`);
  (all.data||[]).forEach(t=>{
    console.log(`  [${t.status}] ${t.planetId} | ${t.planetName||'-'} | ${t.topicCreateTime||'-'} | ${(t.articleTitle||'-').substring(0,25)}`);
  });
  console.log('\n✅ 完成');
})().catch(e=>console.error('FATAL:',e));
