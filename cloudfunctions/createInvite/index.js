const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

function clean(str) {
  return (str || '').replace(/[\s，,、|\/]/g, '');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const raw = event.secretFull || '';

  const parts = raw.split(/[，,]+/).filter(function (s) { return s.trim(); });
  if (parts.length < 2) {
    return { success: false, msg: '请输入完整暗号，上下句用逗号分隔' };
  }

  const upper = clean(parts[0]);
  const lower = clean(parts[1]);
  if (!upper || !lower) {
    return { success: false, msg: '暗号格式不对' };
  }

  await db.collection('friendships').add({
    data: {
      user_a: openid,
      user_b: '',
      secret_upper: upper,
      secret_lower: lower,
      full_secret: upper + '|' + lower,        // 完整暗号（撞车判断用）
      initiator_part: event.part || 'up',
      status: 'pending',
      created_at: db.serverDate()
    }
  });

  return { success: true, msg: '邀请已生成，等待朋友确认' };
};