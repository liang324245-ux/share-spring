const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    friendName: '',
    friendRealName: '',
    friendId: '',
    readonly: false,
    year: 2026,
    month: 6,
    weekHeaders: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [],
    selectedDay: 0,
    dayPosts: {}
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      friendName: options.name ? decodeURIComponent(options.name) : '朋友',
      friendId: options.id || '',
      readonly: options.readonly === '1'   // 只读模式（被保留式删除后只能看不能传）
    });
    this.loadFriendRealName();
    this.loadPhotos();
  },

  // 查朋友真实昵称（清空备注时回退用）
  loadFriendRealName() {
    const that = this;
    const friendId = this.data.friendId;
    if (!friendId) { return; }
    const db = wx.cloud.database();
    db.collection('users').where({ openid: friendId }).get({
      success: function (res) {
        if (res.data && res.data.length > 0) {
          that.setData({ friendRealName: res.data[0].nickname || '朋友' });
        }
      }
    });
  },

  // 从 photos 表读取与当前用户相关的照片
  loadPhotos() {
    const openid = app.globalData.openid;
    if (!openid) { this.buildCalendar(); return; }

    const db = wx.cloud.database();
    const _ = db.command;

    db.collection('photos').where(
      _.or([
        { uploader: openid },
        { receiver: openid }
      ])
    ).get({
      success: (res) => {
        const dayPosts = {};
        res.data.forEach(photo => {
          const day = parseInt(photo.shoot_date.split('-')[2], 10);
          if (!dayPosts[day]) dayPosts[day] = [];
          dayPosts[day].push({
            from: photo.uploader === openid ? 'me' : 'friend',
            time: photo.upload_time ? new Date(photo.upload_time).getTime() : 0,
            readByMe: photo.uploader === openid ? true : photo.is_read_by_receiver,
            readByFriend: photo.uploader === openid ? photo.is_read_by_receiver : true
          });
        });
        this.setData({ dayPosts });
        this.buildCalendar();
      },
      fail: () => {
        this.buildCalendar();
      }
    });
  },

  // 根据某天的 posts 算出：是否未读 + 圆点颜色
  computeDay(posts) {
    if (!posts || !posts.length) {
      return { hasPhoto: false, isUnread: false, dotType: '' };
    }
    const isUnread = posts.some(p => p.from === 'friend' && !p.readByMe);
    let latest = posts[0];
    for (let i = 1; i < posts.length; i++) {
      if (posts[i].time > latest.time) latest = posts[i];
    }
    const dotType = latest.from === 'me' ? 'yellow' : 'blue';
    return { hasPhoto: true, isUnread, dotType };
  },

  buildCalendar() {
    const { year, month } = this.data;
    const daysInMonth = new Date(year, month, 0).getDate();
    const firstDay = new Date(year, month - 1, 1).getDay();

    const cells = [];
    for (let f = 0; f < firstDay; f++) {
      cells.push({ empty: true, key: 'e' + f });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const info = this.computeDay(this.data.dayPosts[d]);
      cells.push({
        empty: false,
        day: d,
        key: 'd' + d,
        dotType: info.dotType,
        isUnread: info.isUnread,
        hasPhoto: info.hasPhoto,
        selected: d === this.data.selectedDay
      });
    }
    this.setData({ cells });
  },

  onPrevMonth() {
    let { year, month } = this.data;
    month--;
    if (month < 1) { month = 12; year--; }
    this.setData({ year, month, selectedDay: 0 }, () => this.buildCalendar());
  },

  onNextMonth() {
    let { year, month } = this.data;
    month++;
    if (month > 12) { month = 1; year++; }
    this.setData({ year, month, selectedDay: 0 }, () => this.buildCalendar());
  },

  onDayTap(e) {
    const { day, hasphoto } = e.currentTarget.dataset;
    if (!day) return;
    this.setData({ selectedDay: day }, () => this.buildCalendar());

    const { year, month, friendName } = this.data;
    setTimeout(() => {
      wx.navigateTo({
        url: `/pages/photoday/photoday?year=${year}&month=${month}&day=${day}&name=${encodeURIComponent(friendName)}&hasphoto=${hasphoto ? 1 : 0}`,
        fail() { wx.showToast({ title: '照片详情页待开发', icon: 'none' }); }
      });
    }, 150);
  },

  // 上传照片给朋友（只读模式拦截）
  onUpload() {
    if (getApp().blockIfDeactivating()) return;
    if (this.data.readonly) {
      wx.showToast({ title: '对方已离开，无法上传', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: `/pages/upload/upload?receiver=${this.data.friendId}`,
      fail() { wx.showToast({ title: '上传页待开发', icon: 'none' }); }
    });
  },

  // 点朋友名字 → 改备注
  onEditRemark() {
    const that = this;
    if (getApp().blockIfDeactivating()) return;
    const friendId = this.data.friendId;
    if (!friendId) { return; }

    wx.showModal({
      title: '设置备注名',
      content: '',
      editable: true,
      placeholderText: '只有你能看到的称呼',
      success: function (res) {
        if (!res.confirm) { return; }
        const remark = (res.content || '').trim();

        wx.showLoading({ title: '保存中...' });
        wx.cloud.callFunction({
          name: 'setRemark',
          data: { friendId: friendId, remark: remark },
          success: function (r) {
            wx.hideLoading();
            if (r.result && r.result.success) {
              // 有备注用备注，清空了用真实昵称
              const newName = r.result.remark
                ? r.result.remark
                : (that.data.friendRealName || '朋友');
              that.setData({ friendName: newName });
              wx.showToast({ title: r.result.remark ? '备注已更新' : '已清除备注', icon: 'none' });
            } else {
              wx.showToast({
                title: (r.result && r.result.msg) ? r.result.msg : '保存失败',
                icon: 'none'
              });
            }
          },
          fail: function (err) {
            wx.hideLoading();
            console.error('setRemark 失败:', err);
            wx.showToast({ title: '保存失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 删除朋友（把对方 id 和昵称带过去）
  onTrash() {
    const { friendId, friendName, readonly } = this.data;
    let url = '/pages/delfriend/delfriend?id=' + friendId +
              '&name=' + encodeURIComponent(friendName || '');
    // 只读模式（B1：对方已离开，我自己清理回忆）→ 带 cleanup 标记
    if (readonly) {
      url += '&cleanup=1';
    }
    wx.navigateTo({
      url: url,
      fail() { wx.showToast({ title: '删除朋友页待开发', icon: 'none' }); }
    });
  },

  onBack() {
    wx.navigateBack({
      fail() { wx.reLaunch({ url: '/pages/friends/friends' }); }
    });
  }
});