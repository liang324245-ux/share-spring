const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    photos: [],         // 照片数组
    date: '',
    caption: '',
    receiverId: ''      // 接收者（朋友）的 openid
  },

  onLoad(options) {
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      receiverId: options.receiver || ''   // 从日历页传来的朋友 openid
    });
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    this.setData({ date: y + '-' + m + '-' + d });
  },

  // 选照片（调系统相册/相机）
  onAddPhoto() {
    const that = this;
    wx.chooseMedia({
      count: 9 - this.data.photos.filter(p => p).length,   // 最多9张
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const newPaths = res.tempFiles.map(f => f.tempFilePath);
        // 过滤掉原来的空占位，再拼上新选的
        const real = that.data.photos.filter(p => p);
        that.setData({ photos: real.concat(newPaths) });
      }
    });
  },

  onDelPhoto(e) {
    const i = e.currentTarget.dataset.i;
    const photos = this.data.photos.filter((_, idx) => idx !== i);
    this.setData({ photos });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onCaptionInput(e) {
    this.setData({ caption: e.detail.value });
  },

  // 立即分享
  onPublish() {
    if (getApp().blockIfDeactivating()) return;  
    const photos = this.data.photos.filter(p => p);   // 过滤空占位
    if (photos.length === 0) {
      wx.showToast({ title: '请先选择照片', icon: 'none' });
      return;
    }

    const openid = app.globalData.openid;
    const receiver = this.data.receiverId || openid;   // 发给真实朋友，没有则兜底发自己
    const that = this;
    wx.showLoading({ title: '上传中...' });

    // 1. 所有照片逐个传云存储
    const uploadTasks = photos.map((filePath, i) => {
      return wx.cloud.uploadFile({
        cloudPath: `photos/${openid}_${Date.now()}_${i}.jpg`,
        filePath: filePath
      });
    });

    // 2. 等全部传完
    Promise.all(uploadTasks).then((results) => {
      const imageUrls = results.map(r => r.fileID);

      // 3. 存进 photos 表
      const db = wx.cloud.database();
      db.collection('photos').add({
        data: {
          uploader: openid,
          receiver: receiver,          // 真实接收者（朋友）
          shoot_date: that.data.date,
          caption: that.data.caption,
          image_urls: imageUrls,
          is_read_by_receiver: false,
          upload_time: db.serverDate()
        },
        success: () => {
          wx.hideLoading();
          wx.showToast({ title: '分享成功', icon: 'success' });
          setTimeout(() => {
            wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
          }, 800);
        },
        fail: () => {
          wx.hideLoading();
          wx.showToast({ title: '保存失败', icon: 'none' });
        }
      });
    }).catch(() => {
      wx.hideLoading();
      wx.showToast({ title: '上传失败', icon: 'none' });
    });
  },

  onCancel() {
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  }
});