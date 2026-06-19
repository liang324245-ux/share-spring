const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();

exports.main = async (event, context) => {
  // 1. 获取调用者的 openid（云函数能直接拿到，前端拿不到）
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 2. 查数据库，看这个 openid 是不是已经有用户记录
  const userRecord = await db.collection('users').where({ openid }).get();

  if (userRecord.data.length === 0) {
    // 3a. 没找到 → 新用户，建一条记录（办会员卡）
    await db.collection('users').add({
      data: {
        openid: openid,
        nickname: '',          // 昵称，之后用户自己填
        avatar: '',            // 头像，之后用户自己传
        created_at: db.serverDate()  // 创建时间，用云端时间
      }
    });
    return { openid, isNew: true };   // 告诉前端：这是新用户
  } else {
    // 3b. 找到了 → 老用户，直接返回
    return { openid, isNew: false, userInfo: userRecord.data[0] };
  }
};