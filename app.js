App({
  globalData: {
    userName: '',
    statusTime: '9:41',
    openid: '',
    userInfo: null,
    isDeactivating: false   // 注销冷静期标记（login 时设置）
  },

  onLaunch() {
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请升级');
    } else {
      wx.cloud.init({
        env: 'cloudbase-d3g00thv5d1e1d96e',
        traceUser: true
      });
      console.log('云开发初始化成功');
    }

    const cachedOpenid = wx.getStorageSync('openid');
    if (cachedOpenid) {
      this.globalData.openid = cachedOpenid;
      console.log('从缓存读取到 openid:', cachedOpenid);
    }
  },

  // 注销冷静期 → 写操作拦截。返回 true 表示"被拦截"（不允许操作），并弹提示
  blockIfDeactivating() {
    if (this.isDeactivating()) {
      wx.showToast({ title: '账号注销中，无法操作', icon: 'none' });
      return true;
    }
    return false;
  },

  // 静默版：只判断是否注销中，不弹提示（用于"点了完全无反应"的场景）
  isDeactivating() {
    const ui = this.globalData.userInfo;
    const status = ui && ui.status ? ui.status : '';
    return this.globalData.isDeactivating || status === 'deactivating' || status === 'deactivated';
  }
});