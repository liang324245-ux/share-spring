const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 清理每半句内部的空格和标点
function clean(str) {
  return (str || '').replace(/[\s，,、|\/]/g, '');
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const raw = event.secretFull || '';

  // 按逗号（中文，/ 英文,）切开上下句
  const parts = raw.split(/[，,]+/).filter(function (s) { return s.trim(); });
  if (parts.length < 2) {
    return { success: false, msg: '请输入完整暗号，上下句用逗号分隔' };
  }

  const upper = clean(parts[0]);   // 上句
  const lower = clean(parts[1]);   // 下句
  if (!upper || !lower) {
    return { success: false, msg: '暗号格式不对' };
  }

  await db.collection('friendships').add({
    data: {
      user_a: openid,
      user_b: '',
      secret_upper: upper,
      secret_lower: lower,
      initiator_part: event.part || 'up',   // 发起者填的是上句('up')还是下句('low')
      status: 'pending',
      created_at: db.serverDate()
    }
  });

  return { success: true, msg: '邀请已生成，等待朋友确认' };
};