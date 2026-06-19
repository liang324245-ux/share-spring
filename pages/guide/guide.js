const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    current: 0,
    cards: [
      { id: 1, img: '/assets/guide1.png', w: 720, h: 720, text: ['暗号添加好友'] },
      { id: 2, img: '/assets/guide2.png', w: 480, h: 600, text: ['日历记录拍摄那天'] },
      { id: 3, img: '/assets/guide3.png', w: 440, h: 500, text: ['无需即时回复'] },
      { id: 4, img: '/assets/guide4.png', w: 400, h: 420, text: ['删除朋友后，', '对方仍能保留回忆'] }
    ]
  },

  onLoad() {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20
    });
  },

  onSwiperChange(e) {
    this.setData({ current: e.detail.current });
  },

  onDotTap(e) {
    this.setData({ current: e.currentTarget.dataset.i });
  },

  onNext() {
    const { current, cards } = this.data;
    if (current >= cards.length - 1) {
      this.goFriends();
    } else {
      this.setData({ current: current + 1 });
    }
  },

  onSkip() {
    this.goFriends();
  },

  goFriends() {
    // 引导页结束 → 去设置页填资料（新用户首次）
    wx.reLaunch({
      url: '/pages/settings/settings?firstTime=1',
      fail() {
        wx.showToast({ title: '设置页待开发', icon: 'none' });
      }
    });
  }
});