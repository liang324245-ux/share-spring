const STARTED_AT_KEY = 'world_days_started_at';
const RESET_PENDING_KEY = 'world_days_reset_pending';
const START_FROM_ZERO_KEY = 'world_days_start_from_zero';
const FROZEN_DAYS_KEY = 'world_days_frozen';

function toTimestamp(value) {
  if (!value) return 0;

  let date = value;
  if (value && value.$date) {
    date = value.$date;
  }

  if (date instanceof Date) {
    return isNaN(date.getTime()) ? 0 : date.getTime();
  }

  if (typeof date === 'number') {
    return isNaN(date) ? 0 : date;
  }

  if (typeof date === 'string') {
    const parsed = new Date(date).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

function calcDaysAt(startedAt, endedAt, startFromZero) {
  const timestamp = toTimestamp(startedAt);
  if (!timestamp) return 0;

  const start = new Date(timestamp);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const end = new Date(toTimestamp(endedAt) || Date.now());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const diffDays = Math.floor((endDay - startDay) / 86400000);
  return startFromZero ? Math.max(0, diffDays) : Math.max(1, diffDays + 1);
}

function calcDays(startedAt, startFromZero) {
  return calcDaysAt(startedAt, Date.now(), startFromZero);
}

function readFrozenDays() {
  const frozen = wx.getStorageSync(FROZEN_DAYS_KEY);
  if (!frozen || typeof frozen !== 'object') return null;

  const days = Number(frozen.days);
  return isNaN(days) ? null : Math.max(0, days);
}

function getDays(databaseCreatedAt) {
  if (wx.getStorageSync(RESET_PENDING_KEY)) return 0;

  let startedAt = toTimestamp(wx.getStorageSync(STARTED_AT_KEY));
  if (!startedAt) {
    startedAt = toTimestamp(databaseCreatedAt) || Date.now();
    wx.setStorageSync(STARTED_AT_KEY, startedAt);
    wx.setStorageSync(START_FROM_ZERO_KEY, false);
  }
  return calcDays(startedAt, !!wx.getStorageSync(START_FROM_ZERO_KEY));
}

function freeze(days) {
  const frozenDays = Math.max(0, Number(days) || 0);
  wx.setStorageSync(FROZEN_DAYS_KEY, { days: frozenDays });
  return frozenDays;
}

function getFrozenDays(databaseCreatedAt, deactivatedAt) {
  const savedDays = readFrozenDays();
  if (savedDays !== null) return savedDays;

  const startedAt = toTimestamp(wx.getStorageSync(STARTED_AT_KEY))
    || toTimestamp(databaseCreatedAt);
  const frozenDays = calcDaysAt(
    startedAt,
    deactivatedAt,
    !!wx.getStorageSync(START_FROM_ZERO_KEY)
  );
  return freeze(frozenDays);
}

function resume(databaseCreatedAt, deactivatedAt) {
  const frozenDays = readFrozenDays();
  const daysToResume = frozenDays === null
    ? getFrozenDays(databaseCreatedAt, deactivatedAt)
    : frozenDays;
  const resumedStart = new Date();
  resumedStart.setHours(0, 0, 0, 0);
  resumedStart.setDate(resumedStart.getDate() - daysToResume);

  wx.setStorageSync(STARTED_AT_KEY, resumedStart.getTime());
  wx.setStorageSync(START_FROM_ZERO_KEY, true);
  wx.removeStorageSync(RESET_PENDING_KEY);
  wx.removeStorageSync(FROZEN_DAYS_KEY);
}

function startLoginSession(databaseCreatedAt, forceRestart) {
  const shouldRestart = forceRestart || !!wx.getStorageSync(RESET_PENDING_KEY);
  const existingStartedAt = toTimestamp(wx.getStorageSync(STARTED_AT_KEY));
  const startedAt = shouldRestart
    ? Date.now()
    : (existingStartedAt || toTimestamp(databaseCreatedAt) || Date.now());

  wx.setStorageSync(STARTED_AT_KEY, startedAt);
  if (shouldRestart) {
    wx.setStorageSync(START_FROM_ZERO_KEY, true);
  } else if (!existingStartedAt) {
    wx.setStorageSync(START_FROM_ZERO_KEY, false);
  }
  wx.removeStorageSync(RESET_PENDING_KEY);
  wx.removeStorageSync(FROZEN_DAYS_KEY);
  return startedAt;
}

function reset() {
  wx.removeStorageSync(STARTED_AT_KEY);
  wx.removeStorageSync(START_FROM_ZERO_KEY);
  wx.setStorageSync(RESET_PENDING_KEY, true);
}

function resetAfterDeactivation() {
  wx.removeStorageSync(FROZEN_DAYS_KEY);
  reset();
}

module.exports = {
  calcDays,
  freeze,
  getDays,
  getFrozenDays,
  reset,
  resetAfterDeactivation,
  resume,
  startLoginSession
};
