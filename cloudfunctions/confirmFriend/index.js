const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;   // 接收者

  const inviterId = event.inviterId;   // 接收者确认的发起者 openid
  const inviteId = event.inviteId;     // 对应的邀请记录 _id
  if (!inviterId || !inviteId) {
    return { success: false, msg: '参数缺失' };
  }

  // 校验：这个邀请还在 pending
  const invRes = await db.collection('friendships').doc(inviteId).get().catch(function () { return null; });
  if (!invRes || !invRes.data || invRes.data.status !== 'pending') {
    return { success: false, msg: '该邀请已失效' };
  }

  // 1. 连接：把这条邀请变 connected，user_b = 接收者
  await db.collection('friendships').doc(inviteId).update({
    data: {
      user_b: openid,
      status: 'connected',
      connected_at: db.serverDate()
    }
  });

  // 2. 锁定：把接收者的 application 标记 matched（从所有池子消失）
  const myApps = await db.collection('applications').where({
    applicant: openid,
    status: 'pending'
  }).get();
  for (let i = 0; i < (myApps.data || []).length; i++) {
    await db.collection('applications').doc(myApps.data[i]._id).update({
      data: { status: 'matched' }
    });
  }

  // 3. 清理：删掉所有"选了我"的 pick 记录（其他发起者的选择作废）
  const myPicks = await db.collection('picks').where({
    b_openid: openid
  }).get();
  for (let j = 0; j < (myPicks.data || []).length; j++) {
    await db.collection('picks').doc(myPicks.data[j]._id).remove();
  }

  return { success: true, msg: '已连接' };
};