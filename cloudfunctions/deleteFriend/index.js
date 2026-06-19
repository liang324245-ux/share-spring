const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const friendId = event.friendId;       // 要删除的对方 openid
  const mode = event.mode === 'clear' ? 'clear' : 'keep';  // keep=保留 / clear=彻底清除
  if (!friendId) {
    return { success: false, msg: '缺少 friendId' };
  }

  // 找到我和对方之间的关系（connected 正常删除，或 deleted 时 B1 自己清理）
  const relRes = await db.collection('friendships').where(
    _.and([
      _.or([{ status: 'connected' }, { status: 'deleted' }]),
      _.or([
        { user_a: openid, user_b: friendId },
        { user_a: friendId, user_b: openid }
      ])
    ])
  ).get();

  if (!relRes.data || relRes.data.length === 0) {
    return { success: false, msg: '关系不存在' };
  }

  const rel = relRes.data[0];

  // 软删除：改 status、记录是谁删的、删除时间、保留还是清除
  await db.collection('friendships').doc(rel._id).update({
    data: {
      status: 'deleted',
      deleted_by: openid,
      keep_memory: (mode === 'keep'),
      left_at: db.serverDate()
    }
  });

  // 若选"彻底清除"，把两人之间的照片记录删掉（双向）
  let removedPhotos = 0;
  if (mode === 'clear') {
    const photoRes = await db.collection('photos').where(
      _.or([
        { uploader: openid, receiver: friendId },
        { uploader: friendId, receiver: openid }
      ])
    ).get();

    const photos = photoRes.data || [];
    for (let i = 0; i < photos.length; i++) {
      const pid = photos[i]._id;
      const cRes = await db.collection('comments').where({ photo_id: pid }).get();
      for (let j = 0; j < (cRes.data || []).length; j++) {
        await db.collection('comments').doc(cRes.data[j]._id).remove();
      }
      const lRes = await db.collection('likes').where({ photo_id: pid }).get();
      for (let k = 0; k < (lRes.data || []).length; k++) {
        await db.collection('likes').doc(lRes.data[k]._id).remove();
      }
      await db.collection('photos').doc(pid).remove();
      removedPhotos++;
    }
  }

  return { success: true, msg: '已删除', mode: mode, removedPhotos: removedPhotos };
};