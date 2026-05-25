const { DateTime, Interval } = require("luxon");

function toDateTime(value, timezone = "Europe/London") {
  if (!value) return null;

  if (value instanceof Date) {
    return DateTime.fromJSDate(value, { zone: timezone });
  }

  return DateTime.fromISO(String(value), { zone: timezone });
}

function isWithinCampaignSchedule(campaign, nowDate = new Date()) {
  const timezone = campaign.timezone || "Europe/London";
  const now = DateTime.fromJSDate(nowDate, { zone: timezone });

  if (campaign.startsAt) {
    const startsAt = toDateTime(campaign.startsAt, timezone);
    if (startsAt && now < startsAt) return false;
  }

  if (campaign.endsAt) {
    const endsAt = toDateTime(campaign.endsAt, timezone);
    if (endsAt && now > endsAt) return false;
  }

  if (Array.isArray(campaign.blackoutDates) && campaign.blackoutDates.length) {
    const today = now.toISODate();
    const isBlackout = campaign.blackoutDates.some((date) => {
      const blackout = toDateTime(date, timezone);
      return blackout && blackout.toISODate() === today;
    });

    if (isBlackout) return false;
  }

  if (Array.isArray(campaign.activeWindows) && campaign.activeWindows.length) {
    const dayOfWeek = now.weekday % 7;
    const minutes = now.hour * 60 + now.minute;

    return campaign.activeWindows.some((window) => {
      if (Number(window.dayOfWeek) !== dayOfWeek) return false;
      const [startHour, startMinute] = window.startTime.split(":").map(Number);
      const [endHour, endMinute] = window.endTime.split(":").map(Number);
      const start = startHour * 60 + startMinute;
      const end = endHour * 60 + endMinute;
      return minutes >= start && minutes <= end;
    });
  }

  return true;
}

function buildCampaignInterval(campaign) {
  const timezone = campaign.timezone || "Europe/London";
  const startsAt = toDateTime(campaign.startsAt, timezone);
  const endsAt = toDateTime(campaign.endsAt, timezone);

  if (!startsAt || !endsAt) return null;
  if (endsAt <= startsAt) return null;

  return Interval.fromDateTimes(startsAt, endsAt);
}

function overlaps(aCampaign, bCampaign) {
  const a = buildCampaignInterval(aCampaign);
  const b = buildCampaignInterval(bCampaign);
  if (!a || !b) return false;
  return a.overlaps(b);
}

function getMonthRange(year, month, timezone = "Europe/London") {
  const start = DateTime.fromObject({ year, month, day: 1 }, { zone: timezone }).startOf("day");
  const end = start.endOf("month");
  return { start: start.toJSDate(), end: end.toJSDate() };
}

module.exports = {
  toDateTime,
  isWithinCampaignSchedule,
  buildCampaignInterval,
  overlaps,
  getMonthRange
};
