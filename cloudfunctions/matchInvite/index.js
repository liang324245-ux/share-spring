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

  const half = clean(event.secretFull || '');   // 接收者填的那一句
  if (!half) {
    return { success: false, msg: '暗号不能为空' };
  }

  console.log('接收者openid:', openid);
  console.log('接收者输入(清理后):', half);

  // 查所有 pending、非自己发起的邀请
  const allPending = await db.collection('friendships').where({
    status: 'pending',
    user_a: _.neq(openid)
  }).get();

  console.log('待匹配邀请数:', allPending.data.length);

  // 找：接收者填的句子 == 发起者"没填的那半句"
  // 发起者填上句(up) → 接收者应填下句 → half == secret_lower
  // 发起者填下句(low) → 接收者应填上句 → half == secret_upper
  let matched = null;
  for (let i = 0; i < allPending.data.length; i++) {
    const inv = allPending.data[i];
    if (inv.initiator_part === 'up' && inv.secret_lower === half) {
      matched = inv; break;
    }
    if (inv.initiator_part === 'low' && inv.secret_upper === half) {
      matched = inv; break;
    }
  }

  if (!matched) {
    return { success: false, msg: '暗号不匹配，请确认后重试' };
  }

  await db.collection('friendships').doc(matched._id).update({
    data: {
      user_b: openid,
      status: 'connected',
      connected_at: db.serverDate()
    }
  });

  return { success: true, msg: '添加成功！' };
};
