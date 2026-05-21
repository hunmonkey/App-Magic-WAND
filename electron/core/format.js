function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "확인 안 됨";
  }

  const gb = bytes / 1024 ** 3;
  if (gb >= 1024) {
    return `${(gb / 1024).toFixed(2)} TB`;
  }
  return `${gb.toFixed(gb >= 10 ? 0 : 1)} GB`;
}

module.exports = {
  formatBytes,
};
