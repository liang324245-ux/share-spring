const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const photoId = event.photoId;
  if (!photoId) {
    return { success: false, msg: '缺少 photoId' };
  }

  // 1. 查出照片
  const photoRes = await db.collection('photos').doc(photoId).get().catch(function () {
    return null;
  });
  if (!photoRes || !photoRes.data) {
    return { success: false, msg: '照片不存在' };
  }
  const photo = photoRes.data;

  // 2. 安全校验：只有"接收者"能给照片点赞
  if (photo.receiver !== openid) {
    return { success: false, msg: '只有接收者能点赞' };
  }

  // 3. 看我是否已经赞过这张照片
  const existRes = await db.collection('likes').where({
    photo_id: photoId,
    liker: openid
  }).get();

  if (existRes.data.length > 0) {
    // 已赞 → 取消（删掉所有匹配记录，保险起见）
    for (let i = 0; i < existRes.data.length; i++) {
      await db.collection('likes').doc(existRes.data[i]._id).remove();
    }
    return { success: true, liked: false, msg: '已取消' };
  } else {
    // 未赞 → 新增
    await db.collection('likes').add({
      data: {
        photo_id: photoId,
        liker: openid,
        created_at: db.serverDate()
      }
    });
    return { success: true, liked: true, msg: '已点赞' };
  }
};