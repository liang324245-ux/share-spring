const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    friendName: '',
    friendId: '',
    friendAvatar: '',     // 朋友真实头像（https）
    friendInitial: '',    // 没头像时显示昵称首字
    cleanup: false,       // B1清理模式：对方已离开，我自己清回忆
    mode: 'keep'   // keep=保留回忆, clear=彻底清除
  },

  onLoad(options) {
    const name = options.name ? decodeURIComponent(options.name) : '';
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      friendName: name,
      friendId: options.id || '',
      friendInitial: name ? name.charAt(0) : '友',
      cleanup: options.cleanup === '1'
    });
    if (options.id) {
      this.loadFriendAvatar(options.id);
    }
  },

  // 查朋友头像，换 https 后显示
  loadFriendAvatar(friendId) {
    const that = this;
    const db = wx.cloud.database();
    db.collection('users').where({ openid: friendId }).get({
      success: function (res) {
        if (res.data && res.data.length > 0) {
          const u = res.data[0];
          // 昵称兜底（如果列表没传 name）
          if (!that.data.friendName && u.nickname) {
            that.setData({
              friendName: u.nickname,
              friendInitial: u.nickname.charAt(0)
            });
          }
          if (u.avatar) {
            that.convertAvatar(u.avatar);
          }
        }
      }
    });
  },

  convertAvatar(cloudUrl) {
    const that = this;
    if (!cloudUrl || cloudUrl.indexOf('cloud://') !== 0) {
      that.setData({ friendAvatar: cloudUrl || '' });
      return;
    }
    wx.cloud.callFunction({
      name: 'getPhotoUrls',
      data: { fileList: [cloudUrl] },
      success: function (cfRes) {
        const map = (cfRes.result && cfRes.result.urls) ? cfRes.result.urls : {};
        that.setData({ friendAvatar: map[cloudUrl] || '' });
      },
      fail: function () {
        that.setData({ friendAvatar: '' });
      }
    });
  },

  onAvatarError() {
    this.setData({ friendAvatar: '' });
  },

  onPickKeep() { this.setData({ mode: 'keep' }); },
  onPickClear() { this.setData({ mode: 'clear' }); },

  onConfirm() {
    const that = this;
    // 清理模式（B1）：固定走彻底清除；正常模式用用户选的 mode
    const mode = this.data.cleanup ? 'clear' : this.data.mode;

    if (!this.data.friendId) {
      wx.showToast({ title: '缺少朋友信息', icon: 'none' });
      return;
    }

    const modalContent = this.data.cleanup
      ? '你们的照片与评论将彻底消失，无法恢复。确定吗？'
      : (mode === 'clear'
          ? '照片与评论将从双方彻底消失，无法恢复。确定吗？'
          : '对方会收到你离开的提示。确定吗？');

    wx.showModal({
      title: '确认',
      content: modalContent,
      confirmText: '确认',
      confirmColor: '#e57373',
      success: (res) => {
        if (!res.confirm) { return; }

        wx.showLoading({ title: '处理中...' });
        wx.cloud.callFunction({
          name: 'deleteFriend',
          data: { friendId: that.data.friendId, mode: mode },
          success: function (r) {
            wx.hideLoading();
            if (r.result && r.result.success) {
              const tip = that.data.cleanup
                ? '回忆已清除'
                : (mode === 'clear' ? '已彻底清除' : '已离开，回忆已为对方保留');
              wx.showToast({ title: tip, icon: 'none' });
              setTimeout(() => wx.reLaunch({ url: '/pages/friends/friends' }), 1000);
            } else {
              wx.showToast({
                title: (r.result && r.result.msg) ? r.result.msg : '删除失败',
                icon: 'none'
              });
            }
          },
          fail: function (err) {
            wx.hideLoading();
            console.error('deleteFriend 失败:', err);
            wx.showToast({ title: '删除失败', icon: 'none' });
          }
        });
      }
    });
  },

  onBack() {
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  }
});