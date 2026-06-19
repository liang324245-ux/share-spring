const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  // 3天前的时间点
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  // 找出：已删除 + 彻底清除式(keep_memory=false) + 离开超过3天 的关系
  const res = await db.collection('friendships').where(
    _.and([
      { status: 'deleted' },
      { keep_memory: false },
      { left_at: _.lt(threeDaysAgo) }
    ])
  ).get();

  const rels = res.data || [];
  let processed = 0;

  for (let i = 0; i < rels.length; i++) {
    await db.collection('friendships').doc(rels[i]._id).update({
      data: { status: 'expired' }
    });
    processed++;
  }

  console.log('cleanExpired 处理了', processed, '条超3天的B2关系');
  return { success: true, processed: processed };
};