"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.zonedDateTime = zonedDateTime;
exports.calendarParts = calendarParts;
exports.formatMonthKey = formatMonthKey;
exports.resolveReportingPeriod = resolveReportingPeriod;
exports.previousReportingPeriod = previousReportingPeriod;
exports.periodTaxScope = periodTaxScope;
exports.daysInRange = daysInRange;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
function isUtcZone(timeZone) {
    const zone = String(timeZone || 'UTC').trim();
    return !zone || zone.toUpperCase() === 'UTC';
}
function monthName(index) {
    return MONTHS[index] || '';
}
function pad(value) {
    return String(value).padStart(2, '0');
}
function addCalendarMonths(year, month, delta) {
    const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
    return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1 };
}
function quarterIndex(month) {
    return Math.floor((month - 1) / 3);
}
function quarterLabel(year, month) {
    return `Q${quarterIndex(month) + 1} ${year}`;
}
function zoneParts(instant, timeZone) {
    const formatted = new Intl.DateTimeFormat('en-US', {
        timeZone,
        hourCycle: 'h23',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).formatToParts(instant);
    const read = (type) => { var _a; return Number(((_a = formatted.find((part) => part.type === type)) === null || _a === void 0 ? void 0 : _a.value) || 0); };
    let hour = read('hour');
    if (hour === 24)
        hour = 0;
    return {
        year: read('year'),
        month: read('month'),
        day: read('day'),
        hour,
        minute: read('minute'),
        second: read('second')
    };
}
function zoneOffsetMs(instant, timeZone) {
    const parts = zoneParts(instant, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    return asUtc - instant.getTime();
}
function zonedDateTime(year, month, day, hour, minute, second, timeZone) {
    const normalised = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
    const y = normalised.getUTCFullYear();
    const m = normalised.getUTCMonth() + 1;
    const d = normalised.getUTCDate();
    const h = normalised.getUTCHours();
    const min = normalised.getUTCMinutes();
    const s = normalised.getUTCSeconds();
    if (isUtcZone(timeZone))
        return new Date(Date.UTC(y, m - 1, d, h, min, s));
    const zone = String(timeZone);
    let utc = Date.UTC(y, m - 1, d, h, min, s);
    for (let attempt = 0; attempt < 4; attempt += 1) {
        const next = Date.UTC(y, m - 1, d, h, min, s) - zoneOffsetMs(new Date(utc), zone);
        if (Math.abs(next - utc) < 1)
            return new Date(next);
        utc = next;
    }
    return new Date(utc);
}
function calendarParts(instant, timeZone) {
    if (isUtcZone(timeZone)) {
        return {
            year: instant.getUTCFullYear(),
            month: instant.getUTCMonth() + 1,
            day: instant.getUTCDate(),
            hour: instant.getUTCHours(),
            minute: instant.getUTCMinutes(),
            second: instant.getUTCSeconds()
        };
    }
    return zoneParts(instant, String(timeZone));
}
function formatMonthKey(instant, timeZone) {
    const parts = calendarParts(instant, timeZone);
    return `${parts.year}-${pad(parts.month)}`;
}
function parseCalendarDate(value) {
    if (value instanceof Date) {
        if (Number.isNaN(value.getTime()))
            return null;
        return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value).trim());
    if (!match)
        return null;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (!year || month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    return { year, month, day };
}
function utcMonthPeriod(asOf, monthOffset) {
    const start = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth() + monthOffset, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1, 0, 0, 0, 0));
    return {
        basis: monthOffset === 0 ? 'this_month' : 'previous_month',
        start,
        end,
        label: `${monthName(start.getUTCMonth())} ${start.getUTCFullYear()}`
    };
}
function zonedMonthPeriod(asOf, timeZone, monthOffset) {
    const parts = calendarParts(asOf, timeZone);
    const shifted = addCalendarMonths(parts.year, parts.month, monthOffset);
    const next = addCalendarMonths(shifted.year, shifted.month, 1);
    return {
        basis: monthOffset === 0 ? 'this_month' : 'previous_month',
        start: zonedDateTime(shifted.year, shifted.month, 1, 0, 0, 0, timeZone),
        end: zonedDateTime(next.year, next.month, 1, 0, 0, 0, timeZone),
        label: `${monthName(shifted.month - 1)} ${shifted.year}`
    };
}
function resolveReportingPeriod(basis, asOf = new Date(), options) {
    const normalized = String(basis || 'this_month').toLowerCase().replace(/-/g, '_');
    const timeZone = (options === null || options === void 0 ? void 0 : options.timeZone) || 'UTC';
    const utc = isUtcZone(timeZone);
    if (normalized === 'custom') {
        const startDate = (options === null || options === void 0 ? void 0 : options.start) ? parseCalendarDate(options.start) : null;
        const endDate = (options === null || options === void 0 ? void 0 : options.end) ? parseCalendarDate(options.end) : null;
        if (!startDate || !endDate)
            throw new Error('CUSTOM_PERIOD_REQUIRED');
        const start = zonedDateTime(startDate.year, startDate.month, startDate.day, 0, 0, 0, timeZone);
        const endExclusive = zonedDateTime(endDate.year, endDate.month, endDate.day + 1, 0, 0, 0, timeZone);
        if (!(start < endExclusive))
            throw new Error('CUSTOM_PERIOD_INVALID');
        const sameYear = startDate.year === endDate.year;
        const label = sameYear && startDate.month === endDate.month && startDate.day === endDate.day
            ? `${startDate.day} ${monthName(startDate.month - 1)} ${startDate.year}`
            : `${startDate.day} ${monthName(startDate.month - 1)} ${startDate.year} – ${endDate.day} ${monthName(endDate.month - 1)} ${endDate.year}`;
        return { basis: 'custom', start, end: endExclusive, label };
    }
    if (normalized === 'lifetime')
        return { basis: 'lifetime', label: 'Lifetime' };
    if (normalized === 'previous_month') {
        return utc ? utcMonthPeriod(asOf, -1) : zonedMonthPeriod(asOf, String(timeZone), -1);
    }
    if (normalized === 'this_quarter') {
        const parts = utc
            ? { year: asOf.getUTCFullYear(), month: asOf.getUTCMonth() + 1 }
            : calendarParts(asOf, String(timeZone));
        const startMonth = quarterIndex(parts.month) * 3 + 1;
        const end = addCalendarMonths(parts.year, startMonth, 3);
        return {
            basis: 'this_quarter',
            start: zonedDateTime(parts.year, startMonth, 1, 0, 0, 0, timeZone),
            end: zonedDateTime(end.year, end.month, 1, 0, 0, 0, timeZone),
            label: quarterLabel(parts.year, startMonth)
        };
    }
    if (normalized === 'this_year' || normalized === 'previous_year') {
        const parts = utc
            ? { year: asOf.getUTCFullYear() }
            : calendarParts(asOf, String(timeZone));
        const year = normalized === 'previous_year' ? parts.year - 1 : parts.year;
        return {
            basis: normalized,
            start: zonedDateTime(year, 1, 1, 0, 0, 0, timeZone),
            end: zonedDateTime(year + 1, 1, 1, 0, 0, 0, timeZone),
            label: String(year)
        };
    }
    if (normalized === 'year_to_date') {
        const parts = utc
            ? { year: asOf.getUTCFullYear() }
            : calendarParts(asOf, String(timeZone));
        return {
            basis: 'year_to_date',
            start: zonedDateTime(parts.year, 1, 1, 0, 0, 0, timeZone),
            end: asOf,
            label: `Year to date ${parts.year}`
        };
    }
    if (normalized === 'last_12_months') {
        const parts = utc
            ? { year: asOf.getUTCFullYear(), month: asOf.getUTCMonth() + 1 }
            : calendarParts(asOf, String(timeZone));
        const start = addCalendarMonths(parts.year, parts.month, -11);
        return {
            basis: 'last_12_months',
            start: zonedDateTime(start.year, start.month, 1, 0, 0, 0, timeZone),
            end: asOf,
            label: 'Last 12 months'
        };
    }
    return utc ? utcMonthPeriod(asOf, 0) : zonedMonthPeriod(asOf, String(timeZone), 0);
}
function previousReportingPeriod(period, timeZone = 'UTC') {
    if (!period.start || !period.end)
        return null;
    if (period.basis === 'lifetime' || period.basis === 'custom' || period.basis === 'last_12_months')
        return null;
    const zone = timeZone || 'UTC';
    const inside = new Date(period.start.getTime() + 24 * 60 * 60 * 1000);
    if (period.basis === 'this_month' || period.basis === 'previous_month') {
        return resolveReportingPeriod('previous_month', inside, { timeZone: zone });
    }
    if (period.basis === 'this_year' || period.basis === 'previous_year') {
        return resolveReportingPeriod('previous_year', inside, { timeZone: zone });
    }
    if (period.basis === 'this_quarter') {
        const start = calendarParts(period.start, zone);
        const previous = addCalendarMonths(start.year, start.month, -3);
        return {
            basis: 'custom',
            start: zonedDateTime(previous.year, previous.month, 1, 0, 0, 0, zone),
            end: zonedDateTime(start.year, start.month, 1, 0, 0, 0, zone),
            label: quarterLabel(previous.year, previous.month)
        };
    }
    if (period.basis === 'year_to_date') {
        const start = calendarParts(period.start, zone);
        const end = calendarParts(period.end, zone);
        return {
            basis: 'custom',
            start: zonedDateTime(start.year - 1, start.month, start.day, start.hour, start.minute, start.second, zone),
            end: zonedDateTime(end.year - 1, end.month, end.day, end.hour, end.minute, end.second, zone),
            label: `Year to date ${start.year - 1}`
        };
    }
    return null;
}
function periodTaxScope(period, timeZone = 'UTC') {
    if (!period.start || !period.end) {
        return {
            kind: 'unsupported',
            monthKey: null,
            year: null,
            message: 'Tax working papers need a calendar month or a full year. This reporting period does not map to one.'
        };
    }
    const start = calendarParts(period.start, timeZone);
    const end = calendarParts(period.end, timeZone);
    const nextMonth = addCalendarMonths(start.year, start.month, 1);
    const fullMonth = start.day === 1
        && end.day === 1
        && end.year === nextMonth.year
        && end.month === nextMonth.month;
    if (fullMonth && (period.basis === 'this_month' || period.basis === 'previous_month' || period.basis === 'custom')) {
        return {
            kind: 'month',
            monthKey: `${start.year}-${pad(start.month)}`,
            year: start.year,
            message: null
        };
    }
    const fullYear = start.month === 1 && start.day === 1 && end.month === 1 && end.day === 1 && end.year === start.year + 1;
    if (fullYear && (period.basis === 'this_year' || period.basis === 'previous_year')) {
        return { kind: 'year', monthKey: null, year: start.year, message: null };
    }
    if (period.basis === 'year_to_date') {
        return {
            kind: 'unsupported',
            monthKey: null,
            year: start.year,
            message: 'Tax working papers are prepared by calendar month or full year. Year to date is not a tax period.'
        };
    }
    if (period.basis === 'this_quarter') {
        return {
            kind: 'unsupported',
            monthKey: null,
            year: start.year,
            message: 'A quarterly tax working paper is not available. Choose a single month, or a full year for the annual schedule.'
        };
    }
    return {
        kind: 'unsupported',
        monthKey: null,
        year: start.year,
        message: 'Tax working papers are prepared by calendar month or full year. Choose one of those periods to see tax figures.'
    };
}
function daysInRange(start, end) {
    if (!start || !end)
        return 0;
    return Math.max(1, Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)));
}
