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

  // 1. 查出这条照片
  const photoRes = await db.collection('photos').doc(photoId).get().catch(function () {
    return null;
  });
  if (!photoRes || !photoRes.data) {
    return { success: false, msg: '照片不存在' };
  }

  const photo = photoRes.data;

  // 2. 安全校验：只有"我是这张照片的接收者"才能标已读
  if (photo.receiver !== openid) {
    return { success: false, msg: '无权操作（不是发给你的照片）' };
  }

  // 3. 已经是已读 → 不重复写，直接返回成功
  if (photo.is_read_by_receiver === true) {
    return { success: true, msg: '已是已读', changed: false };
  }

  // 4. 标记为已读
  await db.collection('photos').doc(photoId).update({
    data: { is_read_by_receiver: true }
  });

  return { success: true, msg: '已标记已读', changed: true };
};