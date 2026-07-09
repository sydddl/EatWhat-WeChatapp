App({
  globalData: {
    groupId: ''
  },

  onLaunch() {
    if (wx.cloud) {
      wx.cloud.init({
        env:"cloudbase-d5gdwhmua3714cd82",
        traceUser: true
      });
    }
  }
});
