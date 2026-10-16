function recordBadgeAction(token, action, sessionToken) {
  requireStagingAttendanceEnabled_();

  var lock = LockService.getScriptLock();

  lock.waitLock(20000);

  var auth = validateVolunteerSession_(
    sessionToken,
    action
  );

  if (!auth.ok) {
    lock.releaseLock();

    return {
      ok: false,
      message: auth.message
    };
  }
  try {

    var hit = attendeeByToken_(
      String(token || '').trim().toUpperCase()
    );

    if (!hit) {
      return {
        ok: false,
        message: 'Invalid badge'
      };
    }

    var sh = hit.sh;
    var row = hit.row;
    var h = hit.h;
    var r = hit.values;

    if (String(r[h['Status']]) !== 'Active') {
      return {
        ok: false,
        message: 'Badge is not active'
      };
    }

    var now = new Date();
    var msg = '';

    if (action === 'gate') {

      if (r[h['Entry Time']]) {
        return badgeState_(
          r,
          h,
          'ALREADY ENTERED'
        );
      }

      sh.getRange(
        row,
        h['Entry Time'] + 1
      ).setValue(now);

      r[h['Entry Time']] = now;

      msg = 'ENTRY OK';

    } else if (action === 'food') {

      if (r[h['Meal Time']]) {
        return badgeState_(
          r,
          h,
          'MEAL ALREADY SERVED'
        );
      }

      sh.getRange(
        row,
        h['Meal Time'] + 1
      ).setValue(now);

      r[h['Meal Time']] = now;

      msg = 'MEAL OK';

    } else {

      return {
        ok: false,
        message: 'Invalid action'
      };
    }
logActivity_(
  r,
  h,
  action,
  msg,
  auth.volunteerId,
  auth.role
);

    var state =
      badgeState_(r, h, msg);

    state.ok = true;

    return state;

  } finally {

    lock.releaseLock();

  }
}


function badgeState_(r, h, msg) {

  return {

    ok: true,

    message: msg,

    entered:
      !!r[h['Entry Time']],

    meal:
      !!r[h['Meal Time']],

    entryText:
      r[h['Entry Time']]
        ? dateText_(r[h['Entry Time']])
        : '',

    mealText:
      r[h['Meal Time']]
        ? dateText_(r[h['Meal Time']])
        : ''

  };
}


