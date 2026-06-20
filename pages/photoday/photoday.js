const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    dateStr: '',
    hasPhoto: false,
    lightbox: false,
    lightboxSrc: '',
    friendName: '',
    zones: []
  },

  onLoad(options) {
    const year = options.year || 2025;
    const month = options.month || 6;
    const day = options.day || 1;
    this.setData({
      statusBarHeight: app.globalData.statusBarHeight || 20,
      dateStr: year + '.' + month + '.' + day,
      friendName: options.name ? decodeURIComponent(options.name) : '朋友'
    });
    this.loadDayPhotos(year, month, day);
  },

  loadDayPhotos(year, month, day) {
    const that = this;
    const openid = app.globalData.openid;
    if (!openid) { this.setData({ hasPhoto: false }); return; }

    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    const shootDate = year + '-' + mm + '-' + dd;

    const db = wx.cloud.database();
    const _ = db.command;

    db.collection('photos').where(
      _.and([
        { shoot_date: shootDate },
        _.or([{ uploader: openid }, { receiver: openid }])
      ])
    ).get({
      success: function (res) {
        if (res.data.length === 0) {
          that.setData({ hasPhoto: false });
          return;
        }

        const zones = res.data.map(function (photo, idx) {
          const isMine = photo.uploader === openid;
          const iAmReceiver = photo.receiver === openid;
          return {
            zid: idx + 1,
            photoId: photo._id,
            uploaderOpenid: photo.uploader,
            isMine: isMine,
            myRead: isMine ? photo.is_read_by_receiver : false,
            needMarkRead: (!isMine) && (photo.is_read_by_receiver !== true),
            who: isMine ? '我' : (that.data.friendName || '朋友'),
            whoAvatar: '',
            whoEmoji: '🙂',
            photos: photo.image_urls || [],
            caption: photo.caption || '',
            liked: false,
            canLike: iAmReceiver,
            comments: [],
            draft: '',
            showInput: false
          };
        });

        const openids = [];
        zones.forEach(function (z) {
          if (openids.indexOf(z.uploaderOpenid) === -1) {
            openids.push(z.uploaderOpenid);
          }
        });

        let pending = openids.length;
        const userMap = {};

        function afterUsersLoaded() {
          zones.forEach(function (z) {
            const u = userMap[z.uploaderOpenid];
            if (u) {
              z.whoAvatar = u.avatar || '';
              // 保留传入的 friendName（备注优先），不用真实昵称覆盖
              if (!z.isMine && !that.data.friendName) z.who = u.nickname || '朋友';
            }
          });
          that.markFriendPhotosRead(zones);
          that.convertUrlsAndRender(zones, function () {
            that.loadComments(function () {
              that.loadLikes();
            });
          });
        }

        if (pending === 0) {
          afterUsersLoaded();
          return;
        }
        openids.forEach(function (oid) {
          db.collection('users').where({ openid: oid }).get({
            success: function (uRes) {
              if (uRes.data.length > 0) {
                userMap[oid] = uRes.data[0];
              }
            },
            complete: function () {
              pending--;
              if (pending === 0) {
                afterUsersLoaded();
              }
            }
          });
        });
      },
      fail: function () {
        that.setData({ hasPhoto: false });
      }
    });
  },

  convertUrlsAndRender(zones, done) {
    const that = this;

    const cloudIds = [];
    function collect(u) {
      if (u && u.indexOf('cloud://') === 0 && cloudIds.indexOf(u) === -1) {
        cloudIds.push(u);
      }
    }
    zones.forEach(function (z) {
      (z.photos || []).forEach(collect);
      collect(z.whoAvatar);
    });

    function finish(map) {
      zones.forEach(function (z) {
        z.photos = (z.photos || []).map(function (u) {
          return map[u] || u;
        });
        if (z.whoAvatar && map[z.whoAvatar]) {
          z.whoAvatar = map[z.whoAvatar];
        }
      });
      console.log('换链接后的 zones:', zones);
      that.setData({ hasPhoto: true, zones: zones }, function () {
        if (typeof done === 'function') done();
      });
    }

    if (cloudIds.length === 0) {
      finish({});
      return;
    }

    wx.cloud.callFunction({
      name: 'getPhotoUrls',
      data: { fileList: cloudIds },
      success: function (cfRes) {
        const map = (cfRes.result && cfRes.result.urls) ? cfRes.result.urls : {};
        finish(map);
      },
      fail: function (err) {
        console.error('调用 getPhotoUrls 失败:', err);
        finish({});
      }
    });
  },

  loadComments(done) {
    const that = this;
    const db = wx.cloud.database();
    const zones = that.data.zones;

    const photoIds = [];
    zones.forEach(function (z) {
      if (z.photoId && photoIds.indexOf(z.photoId) === -1) {
        photoIds.push(z.photoId);
      }
    });
    if (photoIds.length === 0) {
      if (typeof done === 'function') done();
      return;
    }

    let pending = photoIds.length;
    const commentsByPhoto = {};
    const commenterSet = [];

    photoIds.forEach(function (pid) {
      db.collection('comments')
        .where({ photo_id: pid })
        .orderBy('created_at', 'asc')
        .get({
          success: function (cRes) {
            commentsByPhoto[pid] = cRes.data || [];
            console.log('查评论 photo_id=' + pid + ' 查到', (cRes.data || []).length, '条');
            (cRes.data || []).forEach(function (c) {
              if (commenterSet.indexOf(c.commenter) === -1) {
                commenterSet.push(c.commenter);
              }
            });
          },
          complete: function () {
            pending--;
            if (pending === 0) {
              that.fillCommenterNames(commentsByPhoto, commenterSet, done);
            }
          }
        });
    });
  },

  fillCommenterNames(commentsByPhoto, commenterSet, done) {
    const that = this;
    const db = wx.cloud.database();
    const myOpenid = app.globalData.openid;

    function applyAndRender(nameMap) {
      const newZones = that.data.zones.map(function (z) {
        const raw = commentsByPhoto[z.photoId] || [];
        z.comments = raw.map(function (c) {
          let displayName;
          if (c.commenter === myOpenid) {
            displayName = '我';
          } else {
            displayName = nameMap[c.commenter] || '朋友';
          }
          return { n: displayName, c: c.content };
        });
        return z;
      });
      that.setData({ zones: newZones }, function () {
        if (typeof done === 'function') done();
      });
    }

    if (commenterSet.length === 0) {
      applyAndRender({});
      return;
    }

    let pending = commenterSet.length;
    const nameMap = {};
    commenterSet.forEach(function (oid) {
      db.collection('users').where({ openid: oid }).get({
        success: function (uRes) {
          if (uRes.data.length > 0) {
            nameMap[oid] = uRes.data[0].nickname || '朋友';
          }
        },
        complete: function () {
          pending--;
          if (pending === 0) {
            applyAndRender(nameMap);
          }
        }
      });
    });
  },

  loadLikes(done) {
    const that = this;
    const db = wx.cloud.database();
    const zones = that.data.zones;

    const photoIds = [];
    zones.forEach(function (z) {
      if (z.photoId && photoIds.indexOf(z.photoId) === -1) {
        photoIds.push(z.photoId);
      }
    });
    if (photoIds.length === 0) {
      if (typeof done === 'function') done();
      return;
    }

    let pending = photoIds.length;
    const likedSet = {};

    photoIds.forEach(function (pid) {
      db.collection('likes').where({ photo_id: pid }).get({
        success: function (lRes) {
          likedSet[pid] = (lRes.data && lRes.data.length > 0);
          console.log('查点赞 photo_id=' + pid + ' 查到', (lRes.data || []).length, '条');
        },
        complete: function () {
          pending--;
          if (pending === 0) {
            const newZones = that.data.zones.map(function (z) {
              z.liked = !!likedSet[z.photoId];
              return z;
            });
            that.setData({ zones: newZones }, function () {
              if (typeof done === 'function') done();
            });
          }
        }
      });
    });
  },

  markFriendPhotosRead(zones) {
    zones.forEach(function (z) {
      if (z.needMarkRead && z.photoId) {
        wx.cloud.callFunction({
          name: 'markRead',
          data: { photoId: z.photoId },
          success: function (res) {
            console.log('标已读结果 zid=' + z.zid + ':', res.result);
          },
          fail: function (err) {
            console.error('标已读失败 zid=' + z.zid + ':', err);
          }
        });
      }
    });
  },

  onAvatarError(e) {
    const zid = e.currentTarget.dataset.zid;
    const zones = this.data.zones.map(function (z) {
      if (z.zid === zid) z.whoAvatar = '';
      return z;
    });
    this.setData({ zones: zones });
  },

  onPhotoTap(e) {
    this.setData({
      lightbox: true,
      lightboxSrc: e.currentTarget.dataset.src || ''
    });
  },
  onCloseLightbox() {
    this.setData({ lightbox: false });
  },

  onLike(e) {
    const that = this;
    if (getApp().isDeactivating()) return;   // 注销中：静默无反应
    const zid = e.currentTarget.dataset.zid;

    let target = null;
    this.data.zones.forEach(function (z) {
      if (z.zid === zid) target = z;
    });
    if (!target) { return; }

    if (!target.canLike) {
      wx.showToast({ title: '这是对方的心意哦', icon: 'none' });
      return;
    }
    if (!target.photoId) { return; }

    wx.cloud.callFunction({
      name: 'toggleLike',
      data: { photoId: target.photoId },
      success: function (res) {
        if (res.result && res.result.success) {
          const zones = that.data.zones.map(function (z) {
            if (z.zid === zid) z.liked = res.result.liked;
            return z;
          });
          that.setData({ zones: zones });
        } else {
          wx.showToast({
            title: (res.result && res.result.msg) ? res.result.msg : '操作失败',
            icon: 'none'
          });
        }
      },
      fail: function (err) {
        console.error('toggleLike 失败:', err);
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    });
  },

  // 点击💬图标 → 切换该 zone 的评论框显示
  onToggleComment(e) {
    if (getApp().isDeactivating()) return;   // 注销中：静默无反应
    const zid = e.currentTarget.dataset.zid;
    const zones = this.data.zones.map(function (z) {
      if (z.zid === zid) z.showInput = !z.showInput;
      return z;
    });
    this.setData({ zones: zones });
  },

  onCommentInput(e) {
    const zid = e.currentTarget.dataset.zid;
    const val = e.detail.value;
    const zones = this.data.zones.map(function (z) {
      if (z.zid === zid) z.draft = val;
      return z;
    });
    this.setData({ zones: zones });
  },

  onSendComment(e) {
    const that = this;
    if (getApp().isDeactivating()) return;   // 注销中：静默无反应
    const zid = e.currentTarget.dataset.zid;

    let target = null;
    this.data.zones.forEach(function (z) {
      if (z.zid === zid) target = z;
    });
    if (!target) { return; }

    const content = (target.draft || '').trim();
    if (!content) {
      wx.showToast({ title: '说点什么吧～', icon: 'none' });
      return;
    }
    if (!target.photoId) {
      wx.showToast({ title: '这张照片还不能评论', icon: 'none' });
      return;
    }

    wx.showLoading({ title: '发送中...' });
    wx.cloud.callFunction({
      name: 'addComment',
      data: { photoId: target.photoId, content: content },
      success: function (res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          // 清空草稿并收起评论框
          const zones = that.data.zones.map(function (z) {
            if (z.zid === zid) {
              z.draft = '';
              z.showInput = false;
            }
            return z;
          });
          that.setData({ zones: zones });
          that.loadComments();
        } else {
          wx.showToast({
            title: (res.result && res.result.msg) ? res.result.msg : '发送失败',
            icon: 'none'
          });
        }
      },
      fail: function (err) {
        wx.hideLoading();
        console.error('addComment 失败:', err);
        wx.showToast({ title: '发送失败', icon: 'none' });
      }
    });
  },

  onBack() {
    wx.navigateBack({ fail: function () { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  }
});