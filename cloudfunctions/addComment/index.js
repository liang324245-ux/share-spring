const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  const photoId = event.photoId;
  const content = (event.content || '').trim();

  if (!photoId) {
    return { success: false, msg: '缺少 photoId' };
  }
  if (!content) {
    return { success: false, msg: '评论内容不能为空' };
  }
  if (content.length > 200) {
    return { success: false, msg: '评论太长了' };
  }

  // 1. 查出这张照片，确认存在
  const photoRes = await db.collection('photos').doc(photoId).get().catch(function () {
    return null;
  });
  if (!photoRes || !photoRes.data) {
    return { success: false, msg: '照片不存在' };
  }

  const photo = photoRes.data;

  // 2. 安全校验：只有这张照片的上传者或接收者能评论
  if (photo.uploader !== openid && photo.receiver !== openid) {
    return { success: false, msg: '无权评论这张照片' };
  }

  // 3. 存入 comments 集合
  const addRes = await db.collection('comments').add({
    data: {
      photo_id: photoId,
      commenter: openid,
      content: content,
      created_at: db.serverDate()
    }
  });

  return { success: true, msg: '评论成功', commentId: addRes._id };
};