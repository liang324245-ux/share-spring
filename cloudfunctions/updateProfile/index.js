const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 要更新的字段（昵称或头像）
  const updateData = {};
  if (event.nickname !== undefined) updateData.nickname = event.nickname;
  if (event.avatar !== undefined) updateData.avatar = event.avatar;

  if (Object.keys(updateData).length === 0) {
    return { success: false, msg: '没有要更新的内容' };
  }

  // 用管理员权限更新当前用户的记录
  await db.collection('users').where({ openid }).update({
    data: updateData
  });

  return { success: true };
};