const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    hasNew: false,
    feature: {
      photo: '', date: '', name: '', cap: '',
      year: 0, month: 0, day: 0, friendId: ''
    },
    friends: []
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
  },

  onShow() {
    this.loadFriends();
    this.loadFeature();
  },

  getOpenid() {
    let openid = getApp().globalData.openid;
    if (!openid) {
      openid = wx.getStorageSync('openid');
      if (openid) getApp().globalData.openid = openid;
    }
    return openid;
  },

  convertUrls(cloudIds, cb) {
    const ids = [];
    cloudIds.forEach(function (u) {
      if (u && u.indexOf('cloud://') === 0 && ids.indexOf(u) === -1) {
        ids.push(u);
      }
    });
    if (ids.length === 0) { cb({}); return; }

    wx.cloud.callFunction({
      name: 'getPhotoUrls',
      data: { fileList: ids },
      success: function (cfRes) {
        const map = (cfRes.result && cfRes.result.urls) ? cfRes.result.urls : {};
        cb(map);
      },
      fail: function (err) {
        console.error('friends 换链接失败:', err);
        cb({});
      }
    });
  },

  // 置顶动态卡片（朋友发我的最新一张照片）
  // 排除"已经把我删了的人"发的照片（B1：对方离开后不再占置顶）
  loadFeature() {
    const that = this;
    const openid = this.getOpenid();
    if (!openid) { that.setData({ hasNew: false }); return; }

    const db = wx.cloud.database();
    const _ = db.command;

    // 第一步：先查出"已经删除了我的人"的 openid 列表
    db.collection('friendships').where(
      _.and([
        { status: 'deleted' },
        _.or([{ user_a: openid }, { user_b: openid }])
      ])
    ).get({
      success: function (relRes) {
        const removedByOthers = [];   // 已经把我删了的人
        (relRes.data || []).forEach(function (rel) {
          // 对方发起的删除（不是我删的）→ 对方已离开
          if (rel.deleted_by && rel.deleted_by !== openid) {
            const other = rel.user_a === openid ? rel.user_b : rel.user_a;
            if (other) removedByOthers.push(other);
          }
        });
        that.queryFeaturePhoto(removedByOthers);
      },
      fail: function () {
        // 查关系失败也照常查照片（不排除）
        that.queryFeaturePhoto([]);
      }
    });
  },

  // 查最新照片，跳过"已离开的人"发的
  queryFeaturePhoto(removedByOthers) {
    const that = this;
    const openid = this.getOpenid();
    const db = wx.cloud.database();
    const _ = db.command;

    // 查最近若干条朋友发我的、且我还没读的照片，前端逐条排除已离开的人
    db.collection('photos')
      .where(_.and([
        { receiver: openid },
        { uploader: _.neq(openid) },
        { is_read_by_receiver: _.neq(true) }
      ]))
      .orderBy('upload_time', 'desc')
      .limit(10)
      .get({
        success: function (res) {
          const all = res.data || [];
          // 找第一条"发照片的人没有离开"的
          let photo = null;
          for (let i = 0; i < all.length; i++) {
            if (removedByOthers.indexOf(all[i].uploader) === -1) {
              photo = all[i];
              break;
            }
          }

          if (!photo) {
            that.setData({ hasNew: false });
            return;
          }

          const parts = (photo.shoot_date || '').split('-');
          const year  = parseInt(parts[0], 10) || 0;
          const month = parseInt(parts[1], 10) || 0;
          const day   = parseInt(parts[2], 10) || 0;
          const dateText = month + '月' + day + '日';
          const coverCloud = (photo.image_urls && photo.image_urls.length > 0)
            ? photo.image_urls[0] : '';

          const feature = {
            photo: '', date: dateText, name: '朋友', cap: photo.caption || '',
            year: year, month: month, day: day, friendId: photo.uploader
          };
          that.setData({ hasNew: true, feature: feature });

          that.convertUrls([coverCloud], function (map) {
            that.setData({ 'feature.photo': map[coverCloud] || '' });
          });

          db.collection('users').where({ openid: photo.uploader }).get({
            success: function (uRes) {
              if (uRes.data && uRes.data.length > 0) {
                that.setData({ 'feature.name': uRes.data[0].nickname || '朋友' });
              }
            }
          });
        },
        fail: function (err) {
          console.error('加载置顶卡片失败', err);
          that.setData({ hasNew: false });
        }
      });
  },

  // 加载朋友列表（区分：正常 / 我删的(隐藏) / 被对方删的(灰显)）
  loadFriends() {
    const that = this;
    const openid = this.getOpenid();
    console.log('loadFriends里的openid:', openid);
    if (!openid) { that.setData({ friends: [] }); return; }

    const db = wx.cloud.database();
    const _ = db.command;

    db.collection('friendships').where(
      _.and([
        _.or([{ status: 'connected' }, { status: 'deleted' }]),
        _.or([{ user_a: openid }, { user_b: openid }])
      ])
    ).get({
      success: function (res) {
        if (res.data.length === 0) {
          that.setData({ friends: [] });
          return;
        }

        const list = [];
        const newLeaves = [];
        res.data.forEach(function (rel) {
          const other = rel.user_a === openid ? rel.user_b : rel.user_a;
          if (!other) return;

          // 我给对方起的备注（我是 a 读 remark_a_for_b，是 b 读 remark_b_for_a）
          const myRemark = rel.user_a === openid
            ? (rel.remark_a_for_b || '')
            : (rel.remark_b_for_a || '');

          if (rel.status === 'connected') {
            list.push({ foid: other, left: false, readonly: false, remark: myRemark });
          } else if (rel.status === 'deleted') {
            if (rel.deleted_by === openid) {
              return;
            } else {
              const keep = (rel.keep_memory === true);
              list.push({ foid: other, left: true, readonly: keep, remark: myRemark });
              if (keep) {
                newLeaves.push({ relId: rel._id, foid: other });
              }
            }
          }
        });

        const seen = {};
        const uniq = [];
        list.forEach(function (it) {
          if (seen[it.foid] === undefined) {
            seen[it.foid] = uniq.length;
            uniq.push(it);
          } else {
            const idx = seen[it.foid];
            if (!it.left) uniq[idx] = it;
          }
        });

        if (uniq.length === 0) {
          that.setData({ friends: [] });
          return;
        }

        const friends = [];
        let pending = uniq.length;
        uniq.forEach(function (it) {
          db.collection('users').where({ openid: it.foid }).get({
            success: function (uRes) {
              if (uRes.data.length > 0) {
                const u = uRes.data[0];
                friends.push({
                  id: it.foid,
                  name: it.remark || u.nickname || '朋友',   // 有备注优先用备注
                  realName: u.nickname || '朋友',             // 真实昵称（改备注时回显用）
                  remark: it.remark || '',
                  avatar: u.avatar || '',
                  emoji: '🌸',
                  dot: false,
                  left: it.left,
                  readonly: it.readonly
                });
              }
            },
            complete: function () {
              pending--;
              if (pending === 0) {
                const avatarClouds = [];
                friends.forEach(function (f) {
                  if (f.avatar) avatarClouds.push(f.avatar);
                });
                that.convertUrls(avatarClouds, function (map) {
                  friends.forEach(function (f) {
                    if (f.avatar && map[f.avatar]) {
                      f.avatar = map[f.avatar];
                    } else {
                      f.avatar = '';
                    }
                  });
                  console.log('最终friends数组:', friends);
                  that.setData({ friends: friends });
                  that.notifyLeaves(newLeaves, friends);
                });
              }
            }
          });
        });
      },
      fail: function (err) {
        console.error('加载朋友失败', err);
        that.setData({ friends: [] });
      }
    });
  },

  notifyLeaves(newLeaves, friends) {
    if (!newLeaves || newLeaves.length === 0) return;

    let notified = wx.getStorageSync('left_notified') || [];
    if (!Array.isArray(notified)) notified = [];

    const pending = newLeaves.filter(function (it) {
      return notified.indexOf(it.relId) === -1;
    });
    if (pending.length === 0) return;

    const one = pending[0];
    let name = '对方';
    friends.forEach(function (f) {
      if (f.id === one.foid) name = f.name || '对方';
    });

    wx.showModal({
      title: '一段关系的告别',
      content: name + ' 离开了，但为你保留了你们的回忆。你仍可以翻看过去的照片。',
      showCancel: false,
      confirmText: '我知道了'
    });

    pending.forEach(function (it) {
      notified.push(it.relId);
    });
    wx.setStorageSync('left_notified', notified);
  },

  onAvatarError(e) {
    const id = e.currentTarget.dataset.id;
    const friends = this.data.friends.map(function (f) {
      if (f.id === id) f.avatar = '';
      return f;
    });
    this.setData({ friends: friends });
  },

  onOpenCalendar() {
    const f = this.data.feature;
    if (!this.data.hasNew) {
      wx.showToast({ title: '还没有朋友发来的照片哦', icon: 'none' });
      return;
    }
    wx.navigateTo({
      url: '/pages/photoday/photoday?year=' + f.year +
           '&month=' + f.month +
           '&day=' + f.day +
           '&name=' + encodeURIComponent(f.name || '朋友') +
           '&hasphoto=1',
      fail: function () { wx.showToast({ title: '照片详情页待开发', icon: 'none' }); }
    });
  },

  onFriendTap(e) {
    const id = e.currentTarget.dataset.id;
    const friend = this.data.friends.find(f => f.id === id) || {};

    if (friend.left) {
      if (friend.readonly) {
        wx.navigateTo({
          url: `/pages/calendar/calendar?id=${id}&name=${encodeURIComponent(friend.name || '')}&readonly=1`,
          fail() { wx.showToast({ title: '日历页待开发', icon: 'none' }); }
        });
      } else {
        wx.showToast({ title: '对方已离开', icon: 'none' });
      }
      return;
    }

    wx.navigateTo({
      url: `/pages/calendar/calendar?id=${id}&name=${encodeURIComponent(friend.name || '')}`,
      fail() { wx.showToast({ title: '日历页待开发', icon: 'none' }); }
    });
  },

  onAddFriend() {
    wx.navigateTo({
      url: '/pages/addfriend/addfriend',
      fail() { wx.showToast({ title: '添加朋友页待开发', icon: 'none' }); }
    });
  },

  onSettings() {
    wx.navigateTo({
      url: '/pages/settings/settings',
      fail() { wx.showToast({ title: '设置页待开发', icon: 'none' }); }
    });
  }
});