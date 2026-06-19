const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async (event, context) => {
  // 前端传来的 cloud:// 地址数组
  const fileList = event.fileList || [];

  // 没有要换的 → 直接返回空
  if (!fileList.length) {
    return { success: true, urls: {} };
  }

  // 用管理员权限批量换临时链接（不受"仅创建者可读"限制）
  const res = await cloud.getTempFileURL({
    fileList: fileList
  });

  // 整理成 { cloud地址: https地址 } 的对照表，方便前端回填
  const urls = {};
  (res.fileList || []).forEach(function (item) {
    if (item.status === 0 && item.tempFileURL) {
      urls[item.fileID] = item.tempFileURL;
    }
  });

  return { success: true, urls: urls };
};