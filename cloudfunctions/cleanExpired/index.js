const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // ===== 1. 处理 B2 删除关系：deleted + 不保留 + 超3天 → expired =====
  const relRes = await db.collection('friendships').where(
    _.and([
      { status: 'deleted' },
      { keep_memory: false },
      { left_at: _.lt(threeDaysAgo) }
    ])
  ).get();

  const rels = relRes.data || [];
  let expiredRels = 0;
  for (let i = 0; i < rels.length; i++) {
    await db.collection('friendships').doc(rels[i]._id).update({
      data: { status: 'expired' }
    });
    expiredRels++;
  }

  // ===== 2. 处理注销账号：deactivating + 超约7天 → deactivated =====
  const userRes = await db.collection('users').where(
    _.and([
      { status: 'deactivating' },
      { deactivate_at: _.lt(sevenDaysAgo) }
    ])
  ).get();

  const users = userRes.data || [];
  let deactivatedUsers = 0;
  for (let j = 0; j < users.length; j++) {
    await db.collection('users').doc(users[j]._id).update({
      data: { status: 'deactivated' }
    });
    deactivatedUsers++;
  }

  console.log('cleanExpired: 过期关系', expiredRels, '注销账号', deactivatedUsers);
  return { success: true, expiredRels: expiredRels, deactivatedUsers: deactivatedUsers };
};