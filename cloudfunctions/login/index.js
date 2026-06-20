const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const userRecord = await db.collection('users').where({ openid }).get();

  if (userRecord.data.length === 0) {
    // 全新用户建档
    await db.collection('users').add({
      data: {
        openid: openid,
        nickname: '',
        avatar: '',
        status: 'active',
        created_at: db.serverDate()
      }
    });
    return { openid, isNew: true };
  }

  const user = userRecord.data[0];
  const status = user.status || 'active';

  // ===== 彻底注销后重新登录：清零，当全新账号 =====
  if (status === 'deactivated') {
    // 1. 断开自己参与的所有"还连接着"的好友关系（对朋友保留式：保留照片、永久灰显）
    const relRes = await db.collection('friendships').where(
      _.and([
        { status: 'connected' },
        _.or([{ user_a: openid }, { user_b: openid }])
      ])
    ).get();
    const rels = relRes.data || [];
    for (let i = 0; i < rels.length; i++) {
      await db.collection('friendships').doc(rels[i]._id).update({
        data: {
          status: 'deleted',
          deleted_by: openid,
          keep_memory: true,        // 保留式，朋友那边留照片
          left_at: db.serverDate()
        }
      });
    }

    // 2. 清空自己的资料，status 复位 active（变回空白新账号）
    await db.collection('users').doc(user._id).update({
      data: {
        nickname: '',
        avatar: '',
        status: 'active',
        deactivate_at: null
      }
    });

    // 当全新用户处理（前端走引导页重新填资料）
    return { openid, isNew: true, reborn: true };
  }

  // ===== 正常 / 注销冷静期：返回 userInfo（含 status） =====
  return { openid, isNew: false, userInfo: user };
};