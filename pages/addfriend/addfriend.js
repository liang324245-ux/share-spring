const app = getApp();

Page({
  data: {
    statusBarHeight: 20,
    role: 'inviter',      // inviter=发起者 / applicant=接收者
    secretInput: '',      // 输入框内容
    part: 'up',           // 发起者选：自己填的是上句(up)/下句(low)
    // 状态：idle=初始 / waiting=已提交等待 / picking=有候选可选
    phase: 'idle',
    applicants: [],       // 发起者看到的申请者列表
    pickers: [],          // 接收者看到的"选了我的发起者"列表
    pollTimer: null
  },

  onLoad() {
    this.setData({ statusBarHeight: app.globalData.statusBarHeight || 20 });
  },

  onShow() {
    // 进页面就检查当前状态（可能之前发起过/申请过）
    this.refreshState();
    // 轮询刷新（每5秒）
    this.startPolling();
  },

  onHide() { this.stopPolling(); },
  onUnload() { this.stopPolling(); },

  startPolling() {
    const that = this;
    this.stopPolling();
    const timer = setInterval(function () { that.refreshState(); }, 5000);
    this.setData({ pollTimer: timer });
  },
  stopPolling() {
    if (this.data.pollTimer) {
      clearInterval(this.data.pollTimer);
      this.setData({ pollTimer: null });
    }
  },

  // 根据后端状态刷新页面
  refreshState() {
    const that = this;
    // 查我作为发起者，有没有申请者
    wx.cloud.callFunction({
      name: 'getApplicants',
      success: function (res) {
        const r = res.result || {};
        if (r.hasInvite && r.applicants && r.applicants.length > 0) {
          that.convertAvatars(r.applicants, function (list) {
            that.setData({ phase: 'picking', role: 'inviter', applicants: list });
          });
          return;
        }
        // 没有申请者，再查我作为接收者，有没有人选我
        that.checkPickers(r.hasInvite);
      },
      fail: function () { that.checkPickers(false); }
    });
  },

  checkPickers(hasInvite) {
    const that = this;
    wx.cloud.callFunction({
      name: 'getMyPickers',
      success: function (res) {
        const r = res.result || {};
        if (r.pending && r.pickers && r.pickers.length > 0) {
          that.convertAvatars(r.pickers, function (list) {
            that.setData({ phase: 'picking', role: 'applicant', pickers: list });
          });
        } else if (r.pending) {
          // 我申请了但还没人选 → 等待中
          that.setData({ phase: 'waiting', role: 'applicant' });
        } else if (hasInvite) {
          // 我发起了邀请但还没人申请 → 等待中
          that.setData({ phase: 'waiting', role: 'inviter' });
        } else {
          // 啥都没有 → 初始
          if (that.data.phase !== 'idle') that.setData({ phase: 'idle' });
        }
      },
      fail: function () {}
    });
  },

  // 批量换头像 https
  convertAvatars(list, cb) {
    const clouds = [];
    list.forEach(function (it) {
      if (it.avatar && it.avatar.indexOf('cloud://') === 0) clouds.push(it.avatar);
    });
    if (clouds.length === 0) { cb(list); return; }
    wx.cloud.callFunction({
      name: 'getPhotoUrls',
      data: { fileList: clouds },
      success: function (cfRes) {
        const map = (cfRes.result && cfRes.result.urls) ? cfRes.result.urls : {};
        list.forEach(function (it) {
          if (it.avatar && map[it.avatar]) it.avatar = map[it.avatar];
          else if (it.avatar && it.avatar.indexOf('cloud://') === 0) it.avatar = '';
        });
        cb(list);
      },
      fail: function () { cb(list); }
    });
  },

  onRolePick(e) {
    this.setData({ role: e.currentTarget.dataset.role });
  },
  onPartPick(e) {
    this.setData({ part: e.currentTarget.dataset.part });
  },
  onSecretInput(e) {
    this.setData({ secretInput: e.detail.value });
  },

  // 提交（发起 或 申请）
  onSubmit() {
    const that = this;
    const secret = (this.data.secretInput || '').trim();
    if (!secret) {
      wx.showToast({ title: '请输入暗号', icon: 'none' });
      return;
    }

    if (this.data.role === 'inviter') {
      // 发起者：创建邀请
      wx.showLoading({ title: '生成中...' });
      wx.cloud.callFunction({
        name: 'createInvite',
        data: { secretFull: secret, part: this.data.part },
        success: function (res) {
          wx.hideLoading();
          if (res.result && res.result.success) {
            that.setData({ phase: 'waiting', secretInput: '' });
            that.refreshState();
          } else {
            wx.showToast({ title: (res.result && res.result.msg) ? res.result.msg : '失败', icon: 'none' });
          }
        },
        fail: function () { wx.hideLoading(); wx.showToast({ title: '生成失败', icon: 'none' }); }
      });
    } else {
      // 接收者：匹配暗号
      wx.showLoading({ title: '匹配中...' });
      wx.cloud.callFunction({
        name: 'matchInvite',
        data: { secretFull: secret },
        success: function (res) {
          wx.hideLoading();
          const r = res.result || {};
          if (r.success) {
            if (r.mode === 'connected') {
              wx.showToast({ title: '添加成功！', icon: 'success' });
              setTimeout(function () { wx.reLaunch({ url: '/pages/friends/friends' }); }, 1000);
            } else {
              // 撞车 → 进等待
              that.setData({ phase: 'waiting', secretInput: '' });
              that.refreshState();
            }
          } else {
            wx.showToast({ title: r.msg || '暗号不匹配', icon: 'none' });
          }
        },
        fail: function () { wx.hideLoading(); wx.showToast({ title: '匹配失败', icon: 'none' }); }
      });
    }
  },

  // 发起者选中一个申请者
  onPickApplicant(e) {
    const that = this;
    const applicantId = e.currentTarget.dataset.id;
    const fullSecret = e.currentTarget.dataset.secret;
    wx.showLoading({ title: '处理中...' });
    wx.cloud.callFunction({
      name: 'pickApplicant',
      data: { applicantId: applicantId, fullSecret: fullSecret },
      success: function (res) {
        wx.hideLoading();
        if (res.result && res.result.success) {
          wx.showToast({ title: '已选择，等待对方确认', icon: 'none' });
          that.refreshState();
        } else {
          wx.showToast({ title: (res.result && res.result.msg) ? res.result.msg : '失败', icon: 'none' });
        }
      },
      fail: function () { wx.hideLoading(); wx.showToast({ title: '操作失败', icon: 'none' }); }
    });
  },

  // 接收者确认一个发起者
  onConfirmInviter(e) {
    const that = this;
    const inviterId = e.currentTarget.dataset.id;
    const inviteId = e.currentTarget.dataset.invite;
    wx.showModal({
      title: '确认连接',
      content: '确认和 ' + (e.currentTarget.dataset.name || '对方') + ' 连接吗？',
      success: function (m) {
        if (!m.confirm) return;
        wx.showLoading({ title: '连接中...' });
        wx.cloud.callFunction({
          name: 'confirmFriend',
          data: { inviterId: inviterId, inviteId: inviteId },
          success: function (res) {
            wx.hideLoading();
            if (res.result && res.result.success) {
              wx.showToast({ title: '连接成功！', icon: 'success' });
              setTimeout(function () { wx.reLaunch({ url: '/pages/friends/friends' }); }, 1000);
            } else {
              wx.showToast({ title: (res.result && res.result.msg) ? res.result.msg : '失败', icon: 'none' });
              that.refreshState();
            }
          },
          fail: function () { wx.hideLoading(); wx.showToast({ title: '连接失败', icon: 'none' }); }
        });
      }
    });
  },

  onAvatarError(e) {
    // 头像加载失败回退（可选）
  },

  onBack() {
    wx.navigateBack({ fail() { wx.reLaunch({ url: '/pages/friends/friends' }); } });
  }
});