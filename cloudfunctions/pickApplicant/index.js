const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;   // 发起者

  const applicantId = event.applicantId;   // 选中的接收者 openid
  const fullSecret = event.fullSecret;
  if (!applicantId || !fullSecret) {
    return { success: false, msg: '参数缺失' };
  }

  // 校验：我确实有这个完整暗号的 pending 邀请
  const myInvite = await db.collection('friendships').where({
    user_a: openid,
    full_secret: fullSecret,
    status: 'pending'
  }).get();
  if (!myInvite.data || myInvite.data.length === 0) {
    // 兼容老数据：没存 full_secret 的，用拼接再查一次
    return { success: false, msg: '邀请不存在或已处理' };
  }

  // 防重复：同一发起者对同一接收者，只建一条 pick
  const existPick = await db.collection('picks').where({
    a_openid: openid,
    b_openid: applicantId,
    full_secret: fullSecret
  }).get();

  if (existPick.data && existPick.data.length > 0) {
    return { success: true, msg: '已选择，等待对方确认' };
  }

  await db.collection('picks').add({
    data: {
      a_openid: openid,           // 发起者
      b_openid: applicantId,      // 被选中的接收者
      full_secret: fullSecret,
      invite_id: myInvite.data[0]._id,
      created_at: db.serverDate()
    }
  });

  return { success: true, msg: '已选择，等待对方确认' };
};