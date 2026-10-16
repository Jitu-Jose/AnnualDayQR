// Original source setting; cache lifetime is not an eight-hour guarantee.
var VOLUNTEER_SESSION_SECONDS = 8 * 60 * 60;

function createVolunteer_(id, name, role, pin) {
  id = String(id || '').trim().toUpperCase();
  name = String(name || '').trim();
  role = String(role || '').trim().toUpperCase();
  pin = String(pin || '').trim();

  if (!/^[A-Z0-9_-]{3,20}$/.test(id)) {
    throw new Error('Invalid Volunteer ID');
  }

  if (!name) {
    throw new Error('Volunteer name is required');
  }

  if (role !== 'GATE' && role !== 'MEAL') {
    throw new Error('Role must be GATE or MEAL');
  }

  if (!/^[0-9]{6}$/.test(pin)) {
    throw new Error('PIN must contain exactly 6 digits');
  }

  var sh = ss_().getSheetByName('Volunteers');

  if (!sh) {
    throw new Error('Volunteers sheet not found');
  }

  var lock = LockService.getScriptLock();
  lock.waitLock(20000);

  try {
    var rows = sh.getDataRange().getValues();

    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][0]).trim().toUpperCase() === id) {
        throw new Error('Volunteer ID already exists');
      }
    }

    // Per-volunteer salt; never store the actual PIN.
    var salt = Utilities.getUuid().replace(/-/g, '');
    var pepper = PropertiesService.getScriptProperties()
      .getProperty('VOLUNTEER_PIN_PEPPER');

    if (!pepper) {
      throw new Error('PIN pepper not configured');
    }

    var hash = volunteerPinHash_(salt, pin, pepper);

    sh.appendRow([
      id,
      name,
      role,
      salt + ':' + hash,
      'Active',
      new Date()
    ]);

    return 'Volunteer created: ' + id;

  } finally {
    lock.releaseLock();
  }
}

function volunteerPinHash_(salt, pin, pepper) {
  var bytes = Utilities.computeHmacSha256Signature(
    salt + ':' + pin,
    pepper
  );

  return Utilities.base64EncodeWebSafe(bytes);
}

function verifyVolunteerLogin_(id, pin) {
  id = String(id || '').trim().toUpperCase();
  pin = String(pin || '').trim();

  if (!/^[A-Z0-9_-]{3,20}$/.test(id) ||
      !/^[0-9]{6}$/.test(pin)) {
    return { ok: false, message: 'Invalid credentials' };
  }

    var props = PropertiesService.getScriptProperties();
    var pepper = props.getProperty('VOLUNTEER_PIN_PEPPER');

    if (!pepper) {
      throw new Error('Volunteer security not initialized');
    }

    var cache = CacheService.getScriptCache();
    var key = 'VOL_LOGIN_FAIL_' + id;
    var attempts = Number(cache.get(key) || 0);

    if (attempts >= 5) {
      return {
        ok: false,
        message: 'Too many attempts. Try again after 15 minutes.'
      };
    }

    var sh = ss_().getSheetByName('Volunteers');
    var data = sh.getDataRange().getValues();

    var volunteer = null;

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][0]).trim().toUpperCase() === id) {
        volunteer = data[i];
        break;
      }
    }

    var valid = false;
    var role = '';

    if (volunteer &&
        String(volunteer[4]).trim().toUpperCase() === 'ACTIVE') {

      var parts = String(volunteer[3]).split(':');

      if (parts.length === 2) {
        var suppliedHash = volunteerPinHash_(
          parts[0], pin, pepper
        );

        valid = suppliedHash === parts[1];
        role = String(volunteer[2]).trim().toUpperCase();

        if (role !== 'GATE' && role !== 'MEAL') {
          valid = false;
        }
      }
    }

    if (!valid) {
      cache.put(key, String(attempts + 1), 900);

      return {
        ok: false,
        message: 'Invalid credentials'
      };
    }

    cache.remove(key);

    return {
      ok: true,
      volunteerId: id,
      role: role
    };


}

function volunteerLogin(id, pin) {
  var result = verifyVolunteerLogin_(id, pin);

  if (!result.ok) {
    return result;
  }

  var sessionToken =
    Utilities.getUuid() +
    Utilities.getUuid();

  var session = {
    volunteerId: result.volunteerId,
    role: result.role
  };

  CacheService.getScriptCache().put(
    'VOL_SESSION_' + sessionToken,
    JSON.stringify(session),
    VOLUNTEER_SESSION_SECONDS
  );

  return {
    ok: true,
    sessionToken: sessionToken,
    volunteerId: result.volunteerId,
    role: result.role,
    expiresInSeconds: VOLUNTEER_SESSION_SECONDS
  };
}

function validateVolunteerSession_(sessionToken, action) {
  sessionToken = String(sessionToken || '').trim();

  if (!/^[0-9a-fA-F-]{72}$/.test(sessionToken)) {
    return {
      ok: false,
      message: 'Invalid volunteer session'
    };
  }

  var stored = CacheService.getScriptCache().get(
    'VOL_SESSION_' + sessionToken
  );

  if (!stored) {
    return {
      ok: false,
      message: 'Session expired. Please log in again.'
    };
  }

  var session = JSON.parse(stored);

  // Recheck the account status and role, so disabling an
  // account also prevents its existing sessions from scanning.
  var sh = ss_().getSheetByName('Volunteers');
  var data = sh.getDataRange().getValues();
  var activeRole = '';

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toUpperCase() ===
        session.volunteerId &&
        String(data[i][4]).trim().toUpperCase() === 'ACTIVE') {
      activeRole = String(data[i][2]).trim().toUpperCase();
      break;
    }
  }

  if (activeRole !== session.role) {
    return {
      ok: false,
      message: 'Volunteer account is inactive or changed'
    };
  }

  if (
    (action === 'gate' && activeRole !== 'GATE') ||
    (action === 'food' && activeRole !== 'MEAL')
  ) {
    return {
      ok: false,
      message: 'Not authorized for this scanning action'
    };
  }

  if (action !== 'gate' && action !== 'food') {
    return {
      ok: false,
      message: 'Invalid scanning action'
    };
  }

  return {
    ok: true,
    volunteerId: session.volunteerId,
    role: session.role
  };
}

function volunteerLogout(sessionToken) {
  CacheService.getScriptCache().remove(
    'VOL_SESSION_' + String(sessionToken || '')
  );

  return { ok: true };
}
