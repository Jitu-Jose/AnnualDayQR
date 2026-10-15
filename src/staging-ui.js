import { AttendanceClient, messages } from './attendance.js';

export function stagingAttendance({ result, feedback }) {
  const section = document.getElementById('provisioning');
  const role = document.getElementById('scanner-role');
  const retry = document.getElementById('retry');
  let client;
  function report(code,value) {
    const known = messages[code];
    if (known) result(known[0],value?.attendeeName || '',known[1]);
    else if (code === 'PROCESSING') result('Checking badge…','Wait for server confirmation.');
    else result('NETWORK ERROR — RETRY','Result is uncertain. Retry before scanning the next attendee.','error');
    retry.hidden = !client.pending || code === 'PROCESSING' || code === 'SCANNER_NOT_AUTHORIZED';
    if (code === 'SCANNER_NOT_AUTHORIZED') { section.hidden = false; role.textContent = 'SCANNER NOT AUTHORIZED'; }
    if (code !== 'PROCESSING') feedback();
  }
  client = new AttendanceClient({ storage:sessionStorage,report });
  async function ready(operation) {
    const button = section.querySelector('button');
    button.disabled = true;
    try {
      const session = await operation();
      section.hidden = true;
      role.textContent = `STAGING · ${session.role} SCANNER`;
      if (client.pending) { retry.hidden = false; result('NETWORK ERROR — RETRY','An unresolved scan was recovered. Retry it before the next badge.','error'); }
      else result('Ready for next QR','Staging scanner authorized. Synthetic badges only.');
    } catch { report('SCANNER_NOT_AUTHORIZED'); }
    finally { button.disabled = false; }
  }
  section.addEventListener('submit',async (event) => {
    event.preventDefault();
    const input = document.getElementById('provision-code');
    const code = input.value.trim(); input.value = '';
    await ready(() => client.provision(code));
  });
  retry.addEventListener('click',() => client.retry());
  ready(() => client.restore());
  return client;
}
