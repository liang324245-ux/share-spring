const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;   // 接收者

  // 我是否还有 pending 的申请（被锁定/匹配后就不查了）
  const myApp = await db.collection('applications').where({
    applicant: openid,
    status: 'pending'
  }).get();

  if (!myApp.data || myApp.data.length === 0) {
    return { success: true, pending: false, pickers: [] };
  }

  // 查所有"选了我"的 pick 记录
  const pickRes = await db.collection('picks').where({
    b_openid: openid
  }).get();

  const pickers = [];
  for (let i = 0; i < (pickRes.data || []).length; i++) {
    const pk = pickRes.data[i];
    // 补发起者昵称头像
    const uRes = await db.collection('users').where({ openid: pk.a_openid }).get();
    let nickname = '朋友', avatar = '';
    if (uRes.data && uRes.data.length > 0) {
      nickname = uRes.data[0].nickname || '朋友';
      avatar = uRes.data[0].avatar || '';
    }
    pickers.push({
      a_openid: pk.a_openid,
      full_secret: pk.full_secret,
      invite_id: pk.invite_id,
      pickId: pk._id,
      nickname: nickname,
      avatar: avatar
    });
  }

  return { success: true, pending: true, pickers: pickers };
};