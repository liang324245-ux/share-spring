const app = getApp();
const worldDays = require('../../utils/world-days');

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

        const userInfo = r.userInfo || {};
        const status = userInfo.status || 'active';

        // 注销冷静期 → 先弹"是否恢复账号"
        if (status === 'deactivating') {
          this.handleDeactivating(userInfo);
          return;
        }

        worldDays.startLoginSession(userInfo.created_at, r.isNew || r.reborn);

        // 正常账号：原有路由
        this.routeNormal(userInfo);
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('登录失败', err);
        wx.showToast({ title: '登录失败', icon: 'none' });
      }
    });
  },

  // 注销冷静期内的处理：弹窗问是否恢复
  handleDeactivating(userInfo) {
    const that = this;
    const app = getApp();

    wx.showModal({
      title: '账号注销中',
      content: '你的账号正在注销冷静期。是否恢复账号？\n（继续注销仍可查看历史照片，约7天后账号将彻底注销）',
      confirmText: '恢复账号',
      cancelText: '继续注销',
      success: function (res) {
        if (res.confirm) {
          // 恢复账号
          wx.showLoading({ title: '恢复中...' });
          wx.cloud.callFunction({
            name: 'reactivateAccount',
            success: function () {
              wx.hideLoading();
              app.globalData.isDeactivating = false;
              if (app.globalData.userInfo) app.globalData.userInfo.status = 'active';
              worldDays.resume(userInfo.created_at, userInfo.deactivate_at);
              wx.showToast({ title: '账号已恢复', icon: 'success' });
              setTimeout(function () { that.routeNormal(userInfo); }, 800);
            },
            fail: function () {
              wx.hideLoading();
              wx.showToast({ title: '恢复失败', icon: 'none' });
            }
          });
        } else {
          // 继续注销：仍可只读进入
          app.globalData.isDeactivating = true;
          that.routeNormal(userInfo);
        }
      }
    });
  },

  // 正常路由：有昵称进首页，没昵称走引导
  routeNormal(userInfo) {
    const app = getApp();
    const nickname = (userInfo && userInfo.nickname) ? userInfo.nickname : '';
    if (nickname) {
      app.globalData.userName = nickname;
      wx.reLaunch({ url: '/pages/friends/friends' });
    } else {
      wx.reLaunch({ url: '/pages/guide/guide' });
    }
  }
});
