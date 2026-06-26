const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const PHOTO_TEMPLATE_ID = 'dZt5GfFG-oMRJ-KB-rDXJzlltzN5wiK6oLWMHr_mQSM';

function formatDateTime(date) {
  const pad = function (n) { return n < 10 ? '0' + n : '' + n; };
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) +
    ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
}

async function getUserByOpenid(openid) {
  const res = await db.collection('users').where({ openid }).get();
  return res.data && res.data.length > 0 ? res.data[0] : null;
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;
  const photoId = event.photoId;

  if (!photoId) {
    return { success: false, msg: '缺少 photoId' };
  }

  const photoRes = await db.collection('photos').doc(photoId).get().catch(function () {
    return null;
  });
  if (!photoRes || !photoRes.data) {
    return { success: false, msg: '照片不存在' };
  }

  const photo = photoRes.data;
  if (photo.uploader !== openid) {
    return { success: false, msg: '无权发送提醒' };
  }
  if (!photo.receiver || photo.receiver === photo.uploader) {
    return { success: true, skipped: true, reason: 'no_receiver' };
  }

  const receiver = await getUserByOpenid(photo.receiver);
  if (!receiver || receiver.notify_photo === false) {
    return { success: true, skipped: true, reason: 'receiver_disabled' };
  }

  const uploader = await getUserByOpenid(photo.uploader);
  const uploaderName = (uploader && uploader.nickname) ? uploader.nickname : '朋友';
  const dateParts = (photo.shoot_date || '').split('-');
  const page = dateParts.length === 3
    ? '/pages/photoday/photoday?year=' + dateParts[0] + '&month=' + Number(dateParts[1]) + '&day=' + Number(dateParts[2])
    : '/pages/friends/friends';

  await cloud.openapi.subscribeMessage.send({
    touser: photo.receiver,
    templateId: PHOTO_TEMPLATE_ID,
    page: page,
    data: {
      thing1: { value: '你收到了一张新照片' },
      thing6: { value: ('来自：' + uploaderName).slice(0, 20) },
      time2: { value: formatDateTime(new Date()) }
    },
    miniprogramState: 'formal'
  });

  return { success: true };
};