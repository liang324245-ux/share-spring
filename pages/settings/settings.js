const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    profile: { name: '', avatar: '', days: 0 },
    firstTime: false,    // 新用户首次填资料
    deactivating: false, // 注销冷静期（禁用头像/昵称编辑）
    notifyComment: true,
    notifyPhoto: true
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      firstTime: options.firstTime === '1',
      deactivating: app.isDeactivating ? app.isDeactivating() : false
    });
    this.loadProfile();
  },

  // 从数据库读当前用户资料
  loadProfile() {
    const that = this;
    let openid = getApp().globalData.openid;
    if (!openid) {
      openid = wx.getStorageSync('openid');
      if (openid) getApp().globalData.openid = openid;
    }
    if (!openid) return;

    const db = wx.cloud.database();
    db.collection('users').where({ openid }).get({
      success: (res) => {
        if (res.data.length > 0) {
          const u = res.data[0];
          that.setData({
            'profile.name': u.nickname || ''
          });
          // 头像是 cloud://，走云函数换 https 再显示
          if (u.avatar) {
            that.convertAvatar(u.avatar);
          } else {
            that.setData({ 'profile.avatar': '' });
          }
        }
      }
    });
  },

  // 把头像 cloud:// 换成 https 临时链接
  convertAvatar(cloudUrl) {
    const that = this;
    if (!cloudUrl || cloudUrl.indexOf('cloud://') !== 0) {
      that.setData({ 'profile.avatar': cloudUrl || '' });
      return;
    }
    wx.cloud.callFunction({
      name: 'getPhotoUrls',
      data: { fileList: [cloudUrl] },
      success: function (cfRes) {
        const map = (cfRes.result && cfRes.result.urls) ? cfRes.result.urls : {};
        that.setData({ 'profile.avatar': map[cloudUrl] || '' });
      },
      fail: function () {
        that.setData({ 'profile.avatar': '' });
      }
    });
  },

  // 选头像 → 上传云存储 + 云函数存数据库
  onChooseAvatar(e) {
    const that = this;
    if (getApp().isDeactivating()) return;   // 注销中：静默无反应
    const tempUrl = e.detail.avatarUrl;
    let openid = getApp().globalData.openid;
    if (!openid) { openid = wx.getStorageSync('openid'); }
    if (!openid) { wx.showToast({ title: '请先登录', icon: 'none' }); return; }
    wx.showLoading({ title: '保存中...' });

    wx.cloud.uploadFile({
      cloudPath: `avatars/${openid}_${Date.now()}.jpg`,
      filePath: tempUrl,
      success: (uploadRes) => {
        const fileID = uploadRes.fileID;
        wx.cloud.callFunction({
          name: 'updateProfile',
          data: { avatar: fileID },
          success: () => {
            wx.hideLoading();
            // 存好后换 https 显示
            that.convertAvatar(fileID);
            wx.showToast({ title: '头像已更新', icon: 'success' });
          },
          fail: () => {
            wx.hideLoading();
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      },
      fail: () => {
        wx.hideLoading();
        wx.showToast({ title: '上传失败', icon: 'none' });
      }
    });
  },

  // 填昵称 → 云函数存数据库
  onNicknameBlur(e) {
    const that = this;
    if (getApp().isDeactivating()) return;   // 注销中：静默无反应
    const nickname = (e.detail.value || '').trim();
    if (!nickname) return;
    let openid = getApp().globalData.openid;
    if (!openid) { openid = wx.getStorageSync('openid'); }
    if (!openid) { wx.showToast({ title: '请先登录', icon: 'none' }); return; }

    wx.cloud.callFunction({
      name: 'updateProfile',
      data: { nickname: nickname },
      success: () => {
        that.setData({ 'profile.name': nickname });
        app.globalData.userName = nickname;
        wx.showToast({ title: '昵称已更新', icon: 'success' });
      },
      fail: () => {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    });
  },

  onToggleComment() { this.setData({ notifyComment: !this.data.notifyComment }); },
  onTogglePhoto() { this.setData({ notifyPhoto: !this.data.notifyPhoto }); },

  onPrivacy() { wx.showToast({ title: '隐私设置（待开发）', icon: 'none' }); },

  onDeactivate() {
    const that = this;
    wx.showModal({
      title: '账号注销',
      content: '注销后你将无法发照片、评论、点赞，但仍可查看历史照片。朋友会看到你已注销，并保留你们的回忆。约7天后账号彻底注销。期间任意登录可恢复。确定申请注销吗？',
      confirmText: '确定注销',
      confirmColor: '#e57373',
      success: (res) => {
        if (!res.confirm) { return; }
        wx.showLoading({ title: '处理中...' });
        wx.cloud.callFunction({
          name: 'deactivateAccount',
          success: function (r) {
            wx.hideLoading();
            if (r.result && r.result.success) {
              getApp().globalData.isDeactivating = true;
              if (getApp().globalData.userInfo) {
                getApp().globalData.userInfo.status = 'deactivating';
              }
              wx.showModal({
                title: '已进入注销冷静期',
                content: '账号将在约7天后彻底注销。期间你仍可查看历史照片，任意一次登录可选择恢复账号。',
                showCancel: false,
                confirmText: '我知道了',
                success: function () {
                  wx.reLaunch({ url: '/pages/friends/friends' });
                }
              });
            } else {
              wx.showToast({
                title: (r.result && r.result.msg) ? r.result.msg : '注销失败',
                icon: 'none'
              });
            }
          },
          fail: function (err) {
            wx.hideLoading();
            console.error('deactivateAccount 失败:', err);
            wx.showToast({ title: '注销失败', icon: 'none' });
          }
        });
      }
    });
  },

  onLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('openid');
          getApp().globalData.openid = '';
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },

  // 首次填完 → 进首页；普通进入 → 返回上一页
  onBack() {
    if (this.data.firstTime) {
      // 新用户首次：要求至少填了昵称才放行
      if (!this.data.profile.name) {
        wx.showToast({ title: '先填个昵称吧～', icon: 'none' });
        return;
      }
      wx.reLaunch({ url: '/pages/friends/friends' });
      return;
    }
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  }
});