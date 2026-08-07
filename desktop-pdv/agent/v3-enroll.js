const os = require('os');
const hardware = require('./hardware');

function installEnrollV3(ThorAgent) {
  ThorAgent.prototype.enroll = async function ({ code, name }) {
    const body = {
      code,
      machineId: hardware.machineId(),
      name: name || `ThorPDV - ${os.hostname()}`,
      hostname: os.hostname(),
      appVersion: '0.3.2',
      capabilities: {
        offline: true,
        printing: process.platform === 'win32',
        serial: process.platform === 'win32',
        fiscalMenu: true,
        returns: true,
        pdf: true,
        configurableShortcuts: true,
        operators: true,
        multiPayment: true,
        cashDrawer: true,
        scale: true,
        tefBridge: true,
        profilePermissions: true,
        syncRecovery: true,
        bidirectionalSync: true,
      },
    };
    const response = await fetch(`${this.apiBase}/api/pdv/enroll`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'enrollment_failed');
    this.store.set('device_token', this.codec.encrypt(data.device_token));
    this.store.set('device_id', data.device_id);
    this.sync.appVersion = '0.3.2';
    this.sync.start();
    await this.sync.run();
    return this.status();
  };
}

module.exports = { installEnrollV3 };
