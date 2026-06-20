const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const userRes = await db.collection('users').where({ openid: openid }).get();
  if (!userRes.data || userRes.data.length === 0) {
    return { success: false, msg: '用户不存在' };
  }

  await db.collection('users').doc(userRes.data[0]._id).update({
    data: {
      status: 'active',
      deactivate_at: null
    }
  });

  return { success: true, msg: '账号已恢复' };
};