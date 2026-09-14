// All reminder scheduling works off wall-clock Sofia time as a plain
// "YYYY-MM-DDTHH:mm:ss" string (no zone), independent of the container's own
// system timezone. This sidesteps TIMESTAMPTZ/UTC conversion pitfalls -- the
// string format sorts and compares correctly with plain `<=`.
const TIMEZONE = "Europe/Sofia";

function sofiaNowString() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

function formatSofiaForHuman(isoLike) {
  if (!isoLike) return null;
  const [date, time] = isoLike.split("T");
  const [year, month, day] = date.split("-");
  return `${day}.${month} ${(time || "").slice(0, 5)}`;
}

module.exports = { sofiaNowString, formatSofiaForHuman };
