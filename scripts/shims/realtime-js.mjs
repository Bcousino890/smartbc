// Shim: el cliente admin no usa realtime, y Node 20 (VPS) no trae WebSocket
// nativo, así que el constructor real revienta al instanciarse. No-op.
export class RealtimeClient {
  constructor() {}
  channel() { return { subscribe() {}, unsubscribe() {} }; }
  removeChannel() {}
  removeAllChannels() {}
  getChannels() { return []; }
  connect() {}
  disconnect() {}
  setAuth() {}
}
export class RealtimeChannel {}
export class RealtimePresence {}
export default { RealtimeClient, RealtimeChannel, RealtimePresence };
