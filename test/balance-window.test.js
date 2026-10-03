/* Balance-capsule pricing-window logic probe.
 *
 * The capsule computes DeepSeek's peak/off-peak window locally (no host
 * service carries the schedule), so the arithmetic must be pinned: Beijing
 * weekdays 09:00-12:00 and 14:00-18:00 are PEAK, everything else — whole
 * weekend days, Chinese statutory holidays, and the 调休 make-up workdays that
 * fall on a weekend — is OFF-PEAK at half price. All cases below feed fixed
 * instants through the same UTC+8 shift the client uses, so they hold no
 * matter which machine zone runs the test.
 *
 * The window itself is the longest run of consecutive EQUAL-PRICE blocks, so
 * Friday evening runs into Monday 09:00 and a national holiday is one valley
 * rather than a chain of midnights. The holiday table is data transcribed from
 * the State Council notice (国办发明电〔2025〕7号 for 2026); check.js is what
 * fails loudly when the current year is missing from it, and this file pins the
 * resulting behaviour for that year.
 *
 * Extracts the holiday data + the pricing functions straight out of client.js
 * by slicing the source between marker comments — a structural change to the
 * file moves the slice and fails loudly here rather than silently testing
 * nothing.
 */
'use strict'
const fs = require('fs')
const path = require('path')
const vm = require('vm')

let pass = 0
let fail = 0
const check = (label, ok) => {
  if (ok) { pass += 1 } else { fail += 1; console.error('FAIL ' + label) }
}

const src = fs.readFileSync(path.join(__dirname, '..', 'client.js'), 'utf8')
const startMark = 'const BALANCE_HOLIDAY_NOTICES'
const endMark = 'const balancePaintWindow'
const a = src.indexOf(startMark)
const b = src.indexOf(endMark)
if (a < 0 || b < 0 || b <= a) {
  console.error('could not slice the balance pricing window out of client.js')
  process.exit(1)
}
const sandbox = { Math, Date }
vm.createContext(sandbox)
vm.runInContext(src.slice(a, b) + [
  'this.balancePricingWindow = balancePricingWindow;',
  'this.balanceFormatCountdown = balanceFormatCountdown;',
  'this.balanceHolidayName = balanceHolidayName;',
  'this.balanceDayIsOffPeak = balanceDayIsOffPeak;',
  'this.BALANCE_HOLIDAY_NOTICES = BALANCE_HOLIDAY_NOTICES;',
  'this.BALANCE_HOLIDAY_DATES = BALANCE_HOLIDAY_DATES;',
].join('\n'), sandbox)
const balancePricingWindow = sandbox.balancePricingWindow
const balanceFormatCountdown = sandbox.balanceFormatCountdown
const BALANCE_HOLIDAY_NOTICES = sandbox.BALANCE_HOLIDAY_NOTICES
const BALANCE_HOLIDAY_DATES = sandbox.BALANCE_HOLIDAY_DATES

// Beijing wall clock -> the fixed UTC instant the algorithm consumes.
const bj = (y, mo, d, h, mi, s) => new Date(Date.UTC(y, mo - 1, d, h - 8, mi, s || 0))
const at = (y, mo, d, h, mi, s) => balancePricingWindow(bj(y, mo, d, h, mi, s))
const H = 3600 * 1000

// --- Weekday walk: Thursday 2026-09-17 (a plain Thursday) ---
check('Thu 08:59 is off-peak', at(2026, 9, 17, 8, 59).peak === false)
check('Thu 08:59 window ends at 09:00', at(2026, 9, 17, 8, 59).remainingMs === 60 * 1000)
check('Thu 09:00 is peak', at(2026, 9, 17, 9, 0).peak === true)
check('Thu 11:59 is peak', at(2026, 9, 17, 11, 59).peak === true)
check('Thu 12:00 is off-peak', at(2026, 9, 17, 12, 0).peak === false)
check('Thu 13:59 is off-peak', at(2026, 9, 17, 13, 59).peak === false)
check('Thu 14:00 is peak', at(2026, 9, 17, 14, 0).peak === true)
check('Thu 17:59 is peak', at(2026, 9, 17, 17, 59).peak === true)
check('Thu 18:00 is off-peak', at(2026, 9, 17, 18, 0).peak === false)
check('Thu 12-14 valley spans 2h exactly', at(2026, 9, 17, 13, 0).totalMs === 2 * H)
check('Thu 20:00 valley runs 18:00 to next 09:00', at(2026, 9, 17, 20, 0).totalMs === 15 * H)
check('Thu 23:30 counts down to Friday 09:00 (9h30m)',
  at(2026, 9, 17, 23, 30).remainingMs === 9.5 * H)
check('a plain Thursday carries no holiday name', at(2026, 9, 17, 20, 0).holiday === '')

// --- Weekend: Saturday 2026-09-19 opens one valley across Fri 18:00-Mon 09:00 ---
check('Sat 00:00 is off-peak', at(2026, 9, 19, 0, 0).peak === false)
check('Sat 12:00 is STILL off-peak', at(2026, 9, 19, 12, 0).peak === false)
check('Sat valley spans Fri 18:00 to Mon 09:00 (63h)', at(2026, 9, 19, 12, 0).totalMs === 63 * H)
check('Sun 23:00 is off-peak', at(2026, 9, 20, 23, 0).peak === false)
check('Sun 23:00 counts down to Monday 09:00 (10h)', at(2026, 9, 20, 23, 0).remainingMs === 10 * H)

// --- Monday edge: Monday 00:00-09:00 is the weekend valley's tail ---
check('Mon 07:00 is off-peak', at(2026, 9, 21, 7, 0).peak === false)
check('Mon 07:00 valley ends at 09:00', at(2026, 9, 21, 7, 0).remainingMs === 2 * H)

// --- The reference-screenshot shape: a long weekend countdown ---
const satMorning = at(2026, 9, 19, 9, 40) // 15h40m into the 63h valley
check('Sat 09:40 remaining = 47:20:00 (to Monday 09:00)', satMorning.remainingMs === ((47 * 60 + 20) * 60) * 1000)
check('Sat 09:40 elapsedPct = 25%', satMorning.elapsedPct === 25)

// --- Elapsed percentage on a peak window ---
const thuPeak = at(2026, 9, 17, 10, 30) // 1.5h into 3h peak
check('Thu 10:30 peak elapsed 50%', thuPeak.elapsedPct === 50)

// --- Statutory holidays are off-peak ALL DAY, even on a weekday ---
// 元旦 2026-01-01 (Thu) would otherwise be the steepest peak slot of the week.
const newYear = at(2026, 1, 1, 10, 0)
check('元旦 (Thu) 10:00 is off-peak', newYear.peak === false)
check('元旦 is named 元旦', newYear.holiday === '元旦')
check('元旦 valley starts on New Year Eve 18:00', (() => {
  const w = at(2026, 1, 1, 0, 0) // Wednesday 24:00 -> Thursday 00:00, no edge here
  return w.peak === false && w.holiday === '元旦'
})())
// 12-31-2025 is an ordinary Wednesday night -> the valley opens at its 18:00.
check('元旦 window spans 12-31 18:00 to 01-05 09:00 (111h)', newYear.totalMs === 111 * H)
check('元旦 10:00 counts down 95h to Monday 09:00', newYear.remainingMs === 95 * H)

// 春节 2026-02-15 (Sun) .. 02-23 (Mon), with 02-14 and 02-28 worked.
check('春节 (Mon) 02-16 10:00 is off-peak', at(2026, 2, 16, 10, 0).holiday === '春节')
check('春节 window spans 02-13 18:00 to 02-24 09:00 (255h)',
  at(2026, 2, 16, 10, 0).totalMs === 255 * H)
check('02-14 (Sat, 调休 workday) is off-peak', at(2026, 2, 14, 10, 0).peak === false)
check('02-28 (Sat, 调休 workday) is off-peak', at(2026, 2, 28, 10, 0).peak === false)
check('02-24 (Tue) is back to peak', at(2026, 2, 24, 10, 0).peak === true)

// 清明节 04-04 (Sat) .. 04-06 (Mon).
check('清明节 (Mon) 04-06 10:00 is off-peak', at(2026, 4, 6, 10, 0).holiday === '清明节')
check('04-07 (Tue) is back to peak', at(2026, 4, 7, 10, 0).peak === true)

// 劳动节 05-01 (Fri) .. 05-05 (Tue), with 05-09 worked.
check('劳动节 (Mon) 05-04 10:00 is off-peak', at(2026, 5, 4, 10, 0).holiday === '劳动节')
check('05-06 (Wed) is back to peak', at(2026, 5, 6, 10, 0).peak === true)
check('05-09 (Sat, 调休 workday) is off-peak', at(2026, 5, 9, 10, 0).peak === false)

// 端午节 06-19 (Fri) .. 06-21 (Sun).
check('端午节 (Fri) 06-19 10:00 is off-peak', at(2026, 6, 19, 10, 0).holiday === '端午节')

// 中秋节 09-25 (Fri) .. 09-27 (Sun) — one week before the plain Thursday above.
check('中秋节 (Fri) 09-25 10:00 is off-peak', at(2026, 9, 25, 10, 0).holiday === '中秋节')
check('09-24 (Thu) is peak, one day earlier', at(2026, 9, 24, 10, 0).peak === true)

// 国庆节 2026-10-01 (Thu) .. 10-07 (Wed), with 09-20 and 10-10 worked.
const nationalDay = at(2026, 10, 5, 10, 0)
check('国庆节 (Mon) 10-05 10:00 is off-peak', nationalDay.peak === false)
check('国庆节 is named 国庆节', nationalDay.holiday === '国庆节')
// The whole 7-day span is ONE valley: it opens on 09-30 18:00 (the last peak
// block before it) and closes at 10-08 09:00, the first weekday peak.
check('国庆节 window spans 09-30 18:00 to 10-08 09:00 (183h)', nationalDay.totalMs === 183 * H)
check('国庆节 10-05 10:00 counts down 71h to 10-08 09:00', nationalDay.remainingMs === 71 * H)
check('10-07 23:59 counts down 9h01m to the peak', at(2026, 10, 7, 23, 59).remainingMs === 9 * H + 60 * 1000)
check('10-08 00:00 (Thu) is the tail of the same valley', at(2026, 10, 8, 0, 0).remainingMs === 9 * H)
check('10-08 09:00 is peak again', at(2026, 10, 8, 9, 0).peak === true)
check('09-30 (Wed) 09:30 is still peak', at(2026, 9, 30, 9, 30).peak === true)

// --- 调休 workdays are ordinary weekends for billing (DeepSeek 2026-09-19) ---
for (const [mo, d] of [[1, 4], [2, 14], [2, 28], [5, 9], [9, 20], [10, 10]]) {
  const w = at(2026, mo, d, 10, 0)
  check('调休 ' + mo + '-' + d + ' is off-peak', w.peak === false)
  check('调休 ' + mo + '-' + d + ' is not a named holiday', w.holiday === '')
}

// --- A year with no notice falls back to the plain weekday rule ---
// 2027-01-01 (Fri) 10:00 has no table entry yet: billed as peak, which is the
// behaviour check.js's current-year assertion exists to force us to revisit.
const unlisted = at(2027, 1, 1, 10, 0)
check('2027-01-01 falls back to the weekday rule (peak)', unlisted.peak === true)
check('2027-01-01 has no holiday name', unlisted.holiday === '')

// --- Table integrity: 2026 expands to 3+9+3+5+3+3+7 days ---
check('holiday table expands to 33 dates', BALANCE_HOLIDAY_DATES.size === 33)
check('every span expands to its own name', (() => {
  for (const year of Object.keys(BALANCE_HOLIDAY_NOTICES)) {
    for (const span of BALANCE_HOLIDAY_NOTICES[year].spans) {
      const from = span.from.split('-').map(Number)
      const to = span.to.split('-').map(Number)
      for (let at = Date.UTC(Number(year), from[0] - 1, from[1]); at <= Date.UTC(Number(year), to[0] - 1, to[1]); at += 24 * 3600 * 1000) {
        const d = new Date(at + 8 * 3600 * 1000)
        const key = d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0')
        if (BALANCE_HOLIDAY_DATES.get(key) !== span.name) return false
      }
    }
  }
  return true
})())

// --- Fixed-offset sanity: computed from a UTC+9 machine must match ---
// The function shifts internally, so the same absolute instant yields the same
// Beijing window no matter which zone constructed it: Beijing 16:00 on that
// Thursday = UTC 08:00 = Tokyo 17:00.
const tokioInstant = new Date(Date.UTC(2026, 8, 17, 8, 0, 0))
check('zone-independent: Thu 16:00 Beijing is peak', balancePricingWindow(tokioInstant).peak === true)

// --- balanceFormatCountdown shape (the real function, not a re-implementation) ---
check('42h20m37s formats as 42:20:37',
  balanceFormatCountdown(((42 * 60 + 20) * 60 + 37) * 1000) === '42:20:37')
check('9h01m formats as 9:01:00', balanceFormatCountdown(9 * H + 60 * 1000) === '9:01:00')
check('0 formats as 0:00:00', balanceFormatCountdown(0) === '0:00:00')

console.log('balance-window: ' + pass + ' passed, ' + fail + ' failed')
process.exit(fail === 0 ? 0 : 1)
