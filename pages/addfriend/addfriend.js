const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    role: 'init',     // init=发起者, recv=接收者
    secret: '',
    part: 'up',       // up=上句, low=下句
    recvSecret: ''
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
  },

  onRoleInit() { this.setData({ role: 'init' }); },
  onRoleRecv() { this.setData({ role: 'recv' }); },

  onSecretInput(e) { this.setData({ secret: e.detail.value }); },
  onPickUp() { this.setData({ part: 'up' }); },
  onPickLow() { this.setData({ part: 'low' }); },
  onRecvInput(e) { this.setData({ recvSecret: e.detail.value }); },

  // 发起者：生成邀请
  onGenerate() {
    const secret = (this.data.secret || '').trim();
    if (!secret) {
      wx.showToast({ title: '请先输入暗号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '生成中...' });
    wx.cloud.callFunction({
      name: 'createInvite',
      data: { secretFull: secret, part: this.data.part },   // 暗号 + 上/下句
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({ title: res.result.msg, icon: 'success' });
          setTimeout(() => this.goFriends(), 1200);
        } else {
          wx.showToast({ title: res.result.msg, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('生成邀请失败', err);
        wx.showToast({ title: '生成失败', icon: 'none' });
      }
    });
  },

  // 接收者：确认添加
  onConfirm() {
    const secret = (this.data.recvSecret || '').trim();
    if (!secret) {
      wx.showToast({ title: '请输入暗号', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '匹配中...' });
    wx.cloud.callFunction({
      name: 'matchInvite',
      data: { secretFull: secret },
      success: (res) => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({ title: res.result.msg, icon: 'success' });
          setTimeout(() => this.goFriends(), 1200);
        } else {
          wx.showToast({ title: res.result.msg, icon: 'none' });
        }
      },
      fail: (err) => {
        wx.hideLoading();
        console.error('匹配失败', err);
        wx.showToast({ title: '匹配失败', icon: 'none' });
      }
    });
  },

  goFriends() {
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  },
  onBack() { this.goFriends(); }
});