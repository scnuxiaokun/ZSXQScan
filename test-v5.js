/**
 * 全接口测试 v5 - 使用 Authorization Bearer token 认证
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
  console.log(`Cookie len=${cookie.length}, preview=${cookie.substring(0,40)}...`);

  // ===== Health =====
  console.log('\n=== 1. Health ===');
  console.log({code:0,env:'mysql',time:new Date().toISOString()});

  // ===== DB =====
  console.log('\n=== 2. DB ===');
  const cfg=await config.get(); const tsk=await tasks.limit(10).get();
  console.log(`config:${cfg.data?.length} tasks:${tsk.data?.length}`);

  // ===== Monitor (pub-api) =====
  console.log('\n=== 3. Monitor (pub-api) ===');
  let urlsDoc=await config.doc('monitorUrls').get(); let urls=urlsDoc.data?.value;
  if(typeof urls==='string')try{urls=JSON.parse(urls);}catch(e){}
  
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
      console.log(`✅ ${g.name} latest=${lt} dup=${dup} ${tid?'newId='+tid:''}`);
    }catch(e){console.log(`${gid} ERR ${e.message.substring(0,60)}`);}
  }

  // ===== Task (api.zsxq.com + Bearer token) =====
  console.log('\n=== 4. Task Pull (api.zsxq.com) ===');
  const pending=await tasks.where({status:'pending'}).get();
  console.log(`pending: ${pending.data?.length}条`);
  pending.data?.forEach(t=>console.log(`  id=${t.id} pid=${t.planetId} name=${t.planetName}`));

  const seen=new Set();
  for(const t of (pending.data||[])){
    const key=t.planetId;
    if(!key||seen.has(key))continue;
    seen.add(key);

    console.log(`\n→ planetId=${key}`);
    
    try{
      // 用底层 request，显式传 cookie
      const apiResult = await zsxqApi.request('GET', `/v2/groups/${key}/topics`, {
        params:{count:1},
        cookie: process.env.ZSXQ_COOKIE,  // 显式传cookie（不是undefined！）
        skipRateLimit:true,
        groupId:key,
      });

      console.log(`  keys=[${Object.keys(apiResult).join(', ')}]`);
      
      // 正确路径: resp_data.topics
      const topics = apiResult?.resp_data?.topics || [];
      console.log(`  topics=${topics.length}`);

      if(topics.length>0){
        const topic=topics[0];
        const title=topic.title||topic.name||'(无标题)';
        const text=topic.solution?.text||topic.text||topic.question?.text||'';
        
        console.log(`  ✅ "${title?.substring(0,35)}" textLen=${text.length} type=${topic.type}`);
        
        // 写入数据库
        const pool=require('./db-mysql').initPool();
        const conn=await pool.getConnection();
        await conn.query(
          "UPDATE tasks SET status='completed', article=?, articleTitle=?, articleLength=?, topicId=?, updatedAt=? WHERE id=?",
          [JSON.stringify(topic),title,text.length,String(topic.topic_id||topic.id),new Date(),t.id]
        );
        conn.release();
        console.log(`  → completed ✅`);
      }else{
        console.log(`  ❌ 空数据 raw=${JSON.stringify(apiResult).substring(0,250)}`);
      }
    }catch(e){
      console.log(`  ❌ ${e.message.substring(0,120)}`);
    }
  }

  // 汇总
  console.log('\n'+'='.repeat(50));
  const all=await tasks.get();
  console.log(`tasks表共${all.data?.length}条:`);
  (all.data||[]).forEach(t=>{
    console.log(`  [${t.status}] ${t.planetId||'-'} | ${(t.planetName||'-').padEnd(12)} | ${t.articleTitle?.substring(0,25)||'-'}`);
  });
  console.log('🏁 完成！');
})().catch(e=>console.error('FATAL:',e));
