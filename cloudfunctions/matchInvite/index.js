const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

function clean(str) {
  return (str || '').replace(/[\s，,、|\/]/g, '');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const half = clean(event.secretFull || '');   // 接收者填的那一句（半句）
  if (!half) {
    return { success: false, msg: '暗号不能为空' };
  }

  // 查所有 pending、非自己发起的邀请
  const allPending = await db.collection('friendships').where({
    status: 'pending',
    user_a: _.neq(openid)
  }).get();

  // 找所有"完整暗号匹配"的邀请（接收者半句 == 发起者没填的那半句）
  // 发起者填上句(up) → 接收者应填下句 → half == secret_lower
  // 发起者填下句(low) → 接收者应填上句 → half == secret_upper
  const matchedList = [];
  for (let i = 0; i < allPending.data.length; i++) {
    const inv = allPending.data[i];
    if (inv.initiator_part === 'up' && inv.secret_lower === half) {
      matchedList.push(inv);
    } else if (inv.initiator_part === 'low' && inv.secret_upper === half) {
      matchedList.push(inv);
    }
  }

  if (matchedList.length === 0) {
    return { success: false, msg: '暗号不匹配，请确认后重试' };
  }

  // ===== 情况1：完整暗号唯一 → 直接连接（老逻辑） =====
  if (matchedList.length === 1) {
    const matched = matchedList[0];

    // 防重复：避免接收者已经是该发起者好友
    await db.collection('friendships').doc(matched._id).update({
      data: {
        user_b: openid,
        status: 'connected',
        connected_at: db.serverDate()
      }
    });
    return { success: true, mode: 'connected', msg: '添加成功！' };
  }

  // ===== 情况2：完整暗号撞车（多个发起者） → 进入多对多互认 =====
  // 用完整暗号做唯一标识（上句+下句拼一起）
  const fullSecret = matchedList[0].secret_upper + '|' + matchedList[0].secret_lower;

  // 防重复：同一接收者对同一完整暗号，只建一条 pending 申请
  const existApp = await db.collection('applications').where({
    applicant: openid,
    full_secret: fullSecret,
    status: 'pending'
  }).get();

  if (existApp.data && existApp.data.length > 0) {
    return { success: true, mode: 'pending', msg: '已在等待确认中' };
  }

  await db.collection('applications').add({
    data: {
      applicant: openid,
      full_secret: fullSecret,
      secret_upper: matchedList[0].secret_upper,
      secret_lower: matchedList[0].secret_lower,
      status: 'pending',
      created_at: db.serverDate()
    }
  });

  return { success: true, mode: 'pending', msg: '暗号撞车啦，等待对方确认是不是你' };
};