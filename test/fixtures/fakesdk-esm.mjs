export default class FakeSdk {
  static create() {
    return new FakeSdk();
  }
  async read() {
    return {
      type: 'text',
      text: JSON.stringify({
        result: { scenes: [{ time_ms: 500 }], format: { duration_ms: 2000 } },
      }),
    };
  }
}
