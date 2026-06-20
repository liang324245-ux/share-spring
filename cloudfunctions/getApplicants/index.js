const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const openid = wxContext.OPENID;

  // 1. 找我发起的、还在 pending 的邀请，拿到我的完整暗号
  const myInvites = await db.collection('friendships').where({
    user_a: openid,
    status: 'pending'
  }).get();

  if (!myInvites.data || myInvites.data.length === 0) {
    return { success: true, hasInvite: false, applicants: [] };
  }

  // 我的所有完整暗号（理论上一个，但允许多个）
  const myFullSecrets = [];
  myInvites.data.forEach(function (inv) {
    const fs = inv.full_secret || (inv.secret_upper + '|' + inv.secret_lower);
    if (myFullSecrets.indexOf(fs) === -1) myFullSecrets.push(fs);
  });

  // 2. 查这些完整暗号下、status=pending 的申请者
  const applicants = [];
  for (let i = 0; i < myFullSecrets.length; i++) {
    const appRes = await db.collection('applications').where({
      full_secret: myFullSecrets[i],
      status: 'pending'
    }).get();

    (appRes.data || []).forEach(function (app) {
      // 不显示自己
      if (app.applicant === openid) return;
      applicants.push({
        applicant: app.applicant,
        full_secret: app.full_secret,
        appId: app._id
      });
    });
  }

  // 3. 补充申请者的昵称头像
  for (let j = 0; j < applicants.length; j++) {
    const uRes = await db.collection('users').where({ openid: applicants[j].applicant }).get();
    if (uRes.data && uRes.data.length > 0) {
      applicants[j].nickname = uRes.data[0].nickname || '朋友';
      applicants[j].avatar = uRes.data[0].avatar || '';
    } else {
      applicants[j].nickname = '朋友';
      applicants[j].avatar = '';
    }
  }

  return { success: true, hasInvite: true, applicants: applicants };
};