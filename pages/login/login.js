const app = getApp();

Page({
  data: {
    statusTime: '9:41'
  },

  onLoad() {
    const app = getApp();
    this.setData({
      statusTime: app.globalData.statusTime || '9:41'
    });
  },

  // 点击「进入」
  onEnter() {
    const app = getApp();

    wx.showLoading({ title: '登录中...' });
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        wx.hideLoading();
        const r = res.result || {};
        console.log('登录成功:', r);

        app.globalData.openid = r.openid;
        app.globalData.userInfo = r.userInfo || null;
        wx.setStorageSync('openid', r.openid);

        // 有昵称=老用户→直接进首页；没昵称=新用户→走引导页
        const nickname = (r.userInfo && r.userInfo.nickname) ? r.userInfo.nickname : '';
        if (nickname) {
          app.globalData.userName = nickname;
          wx.reLaunch({ url: '/pages/friends/friends' });
        } else {
          // 新用户 → 引导页（引导页结束后再去设置页填资料）
          wx.reLaunch({ url: '/pages/guide/guide' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('登录失败', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  }
});