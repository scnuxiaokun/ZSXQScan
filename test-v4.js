/**
 * 全接口本地测试 v4 - 修复 resp_data.topics 路径 + Cookie 环境变量
 */
process.env.DB_HOST='sh-cynosdbmysql-grp-5aqhxbwa.sql.tencentcdb.com';
process.env.DB_PORT='22871';
process.env.DB_USER='zsxq_scan_dbuser';
process.env.DB_PASSWORD='zsxq@123';
process.env.DB_NAME='temu-tools-prod-3g8yeywsda972fae';

const {init}=require('./db-mysql');
const db=init();
const config=db.collection('config');
const tasks=db.collection('tasks');
const zsxqApi=require('./functions/zsxqApi');

// 初始化时读取cookie到环境变量
async function loadCookie(){
  const pool=require('./db-mysql').initPool();
  const conn=await pool.getConnection();
  const[rows]=await conn.query("SELECT value FROM config WHERE id='zsxq_cookie'");
  conn.release();
  let cookie=rows[0]?.value||'';
  if(typeof cookie==='string')try{cookie=JSON.parse(cookie);cookie=cookie.value||cookie;}catch(e){}
  process.env.ZSXQ_COOKIE=cookie;
  return cookie;
}

(async()=>{
  // 加载Cookie
  const cookie=await loadCookie();
  console.log(`Cookie loaded: len=${cookie.length}`);

  // ===== 1. Health =====
  console.log('\n=== 1. Health ===');
  console.log({code:0,env:'mysql',time:new Date().toISOString()});

  // ===== 2. Debug DB =====
  console.log('\n=== 2. DB ===');
  const cfg=await config.get(); const tsk=await tasks.limit(8).get();
  console.log(`config:${cfg.data?.length} tasks:${tsk.data?.length}`);
  
  // ===== 3. Monitor (pub-api) =====
  console.log('\n=== 3. Monitor ===');
  let urlsDoc=await config.doc('monitorUrls').get();
  let urls=urlsDoc.data?.value;
  if(typeof urls==='string')try{urls=JSON.parse(urls);}catch(e){}
  const monResults=[];
  for(const url of (urls||[])){
    const m=url.match(/\/group\/(\d+)/); const gid=m?m[1]:null;if(!gid)continue;
    try{
      const d=await zsxqApi.getGroupPublicInfo(gid);
      const g=d?.resp_data?.group; const lt=g?.latest_topic_create_time;
      const ex=await tasks.where({planetId:gid,topicCreateTime:String(lt)}).limit(1).get();
      const dup=!!(ex.data&&ex.data.length>0);
      let tid=null;
      if(!dup&&lt){
        const r=await tasks.add({data:{planetId:gid,planetName:g.name,planetUrl:url,status:'pending',topicCreateTime:String(lt),article:'',createdAt:new Date(),updatedAt:new Date()}});
        tid=r.id;
      }
      monResults.push({groupId:gid,name:g.name,hasUpdate:!dup,latestTime:lt,dup,tid});
      console.log(`${g.name} update=!dup latest=${lt} dup=${dup}`);
    }catch(e){console.log(`${gid} ERR ${e.message.substring(0,60)}`);}
  }

  // ===== 4. Task (api.zsxq.com) =====
  console.log('\n=== 4. Task Pull ===');
  const pending=await tasks.where({status:'pending'}).get();
  console.log(`pending: ${pending.data?.length}条`);
  pending.data?.forEach(t=>console.log(`  id=${t.id} pid=${t.planetId} name=${t.planetName}`));
  
  const taskResults=[];
  const seen=new Set();

  for(const t of (pending.data||[])){
    const key=t.planetId;
    if(!key||seen.has(key))continue;
    seen.add(key);
    
    console.log(`\n→ planetId=${key} (id=${t.id})`);
    try{
      // 用底层 request 获取完整响应
      const apiResult = await zsxqApi.request('GET', `/v2/groups/${key}/topics`, {
        params:{count:1}, skipRateLimit:true
      });
      
      // ★ 正确的数据路径: resp_data.topics
      const topics = apiResult?.resp_data?.topics || apiResult?.data || [];
      
      console.log(`  keys=[${Object.keys(apiResult).join(',')}]`);
      console.log(`  topics数=${topics.length}`);
      
      if(topics.length>0){
        const topic=topics[0];
        // 提取字段（适配新格式）
        const title=topic.title||topic.name||'(无标题)';
        const text=topic.solution?.text||topic.text||topic.question?.text||'';  // solution类型取solution.text
        const createTime=topic.create_time||topic.createTime;
        const topicId=String(topic.topic_id||topic.id);
        
        console.log(`  ✅ title="${title?.substring(0,40)}" textLen=${text.length} time=${createTime} type=${topic.type}`);
        
        // 写回数据库
        const pool=require('./db-mysql').initPool();
        const conn=await pool.getConnection();
        await conn.query(
          "UPDATE tasks SET status='completed', article=?, articleTitle=?, articleLength=?, topicId=?, updatedAt=? WHERE id=?",
          [JSON.stringify(topic),title,text.length,topicId,new Date(),t.id]
        );
        conn.release();
        console.log(`  ✅ → completed`);
        
        taskResults.push({key,status:'success',title:title?.substring(0,30)});
      }else{
        console.log(`  ❌ topics为空, raw: ${JSON.stringify(apiResult).substring(0,300)}`);
        taskResults.push({key,status:'failed',err:'空数据'});
      }
    }catch(e){
      console.log(`  ❌ ${e.message.substring(0,100)}`);
      taskResults.push({key,status:'failed',err:e.message});
    }
  }

  // ===== 5. 最终汇总 =====
  console.log('\n'+ '='.repeat(55));
  console.log('  最终 tasks 表');
  console.log('='.repeat(55));
  const all=await tasks.get();
  console.log(`共${all.data?.length}条:`);
  (all.data||[]).forEach(t=>{
    console.log(`  [${t.status}] ${t.planetId||'-'} | ${(t.planetName||'-').padEnd(10)} | ${t.topicCreateTime||'-'} | ${(t.articleTitle||'-').substring(0,25)}`);
  });

  console.log('\n🏁 完成！');
})().catch(e=>console.error('FATAL:',e));
