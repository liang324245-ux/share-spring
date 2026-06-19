const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const friendId = event.friendId;
  let remark = (event.remark || '').trim();
  if (remark.length > 20) remark = remark.slice(0, 20);  // 备注最多20字

  if (!friendId) {
    return { success: false, msg: '缺少 friendId' };
  }

  // 找我和对方的关系（connected 或 deleted 都允许改备注）
  const relRes = await db.collection('friendships').where(
    _.and([
      _.or([{ status: 'connected' }, { status: 'deleted' }]),
      _.or([
        { user_a: openid, user_b: friendId },
        { user_a: friendId, user_b: openid }
      ])
    ])
  ).get();

  if (!relRes.data || relRes.data.length === 0) {
    return { success: false, msg: '关系不存在' };
  }

  const rel = relRes.data[0];

  // 判断我是 a 还是 b，更新对应的备注字段
  const updateData = {};
  if (rel.user_a === openid) {
    updateData.remark_a_for_b = remark;   // 我(a)给对方(b)的备注
  } else {
    updateData.remark_b_for_a = remark;   // 我(b)给对方(a)的备注
  }

  await db.collection('friendships').doc(rel._id).update({ data: updateData });

  return { success: true, remark: remark };
};