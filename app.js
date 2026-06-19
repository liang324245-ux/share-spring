App({
  globalData: {
    userName: '',
    statusTime: '9:41',
    openid: '',
    userInfo: null
  },
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('当前基础库版本过低，请升级');
    } else {
      wx.cloud.init({
        env: 'cloudbase-d3g00thv5d1e1d96e',    
        traceUser: true
      });
      console.log('云开发初始化成功');
    }

    // 读取本地缓存的 openid（登录态持久化）
    const cachedOpenid = wx.getStorageSync('openid');
    if (cachedOpenid) {
      this.globalData.openid = cachedOpenid;
      console.log('从缓存读取到 openid:', cachedOpenid);
    }
  }
});