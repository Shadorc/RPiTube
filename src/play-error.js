class PlayError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "PlayError";
    this.code = code;
  }
}

module.exports = PlayError;
